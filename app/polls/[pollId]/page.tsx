'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Award, CheckCircle, Clock, Crown, FileText, Medal, Shield, Star, TrendingUp, Trophy, Vote, XCircle } from 'lucide-react';

interface PollOption {
    id: string;
    text_en: string;
    text_ml: string;
    player_id?: string;
    team_id?: string;
    votes: number;
}

interface PlayerStats {
    matches_played: number;
    wins: number;
    draws: number;
    losses: number;
    goals_scored: number;
    goals_conceded: number;
    goal_difference: number;
    points_gained: number;
    potm_count: number;
    star_points: number;
}

interface TeamStats {
    matches_played: number;
    wins: number;
    draws: number;
    losses: number;
    goals_scored: number;
    goals_conceded: number;
    goal_difference: number;
    points: number;
}

interface Poll {
    poll_id: string;
    season_id: string;
    poll_type: string;
    title_en: string;
    title_ml: string;
    description_en?: string;
    description_ml?: string;
    options: PollOption[];
    closes_at: string;
    total_votes: number;
    status: string;
    created_at: string;
}

export default function PollPage() {
    const params = useParams();
    const router = useRouter();
    const pollId = params.pollId as string;

    const [poll, setPoll] = useState<Poll | null>(null);
    const [stats, setStats] = useState<Record<string, PlayerStats | TeamStats>>({});
    const [loading, setLoading] = useState(true);
    const [voting, setVoting] = useState(false);
    const [selectedOption, setSelectedOption] = useState<string>('');
    const [hasVoted, setHasVoted] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [language, setLanguage] = useState<'en' | 'ml'>('en');
    const [deviceFingerprint, setDeviceFingerprint] = useState<string>('');
    const [voterName, setVoterName] = useState<string>('');

    // Generate device fingerprint on mount
    useEffect(() => {
        const generateFingerprint = () => {
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.textBaseline = 'top';
                ctx.font = '14px Arial';
                ctx.fillText('fingerprint', 2, 2);
            }
            const canvasData = canvas.toDataURL();

            const fingerprint = `${navigator.userAgent}_${screen.width}x${screen.height}_${canvasData.slice(0, 50)}`;
            const hash = btoa(fingerprint).slice(0, 32);
            return hash;
        };

        setDeviceFingerprint(generateFingerprint());
    }, []);

    // Handle redirect result for mobile sign-in
    useEffect(() => {
        let mounted = true;

        const handleRedirectResult = async () => {
            try {
                const { getRedirectResult } = await import('firebase/auth');
                const { auth } = await import('@/lib/firebase/config');

                console.log('Checking for redirect result...');
                const result = await getRedirectResult(auth);

                if (result && mounted) {
                    console.log('[SUCCESS] Redirect sign-in successful:', result.user.email);

                    // Set the token
                    const idToken = await result.user.getIdToken(true);
                    const tokenResponse = await fetch('/api/auth/set-token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ token: idToken }),
                    });

                    if (tokenResponse.ok) {
                        console.log('[SUCCESS] Token set successfully');

                        // Show success and reload after a delay with cache busting
                        setSuccess('Successfully signed in! Reloading...');

                        setTimeout(() => {
                            if (mounted) {
                                // Force hard reload with cache busting
                                window.location.href = window.location.href.split('?')[0] + '?t=' + Date.now();
                            }
                        }, 1500);
                    } else {
                        console.error('Failed to set token:', tokenResponse.status);
                        setError('Authentication failed. Please try again.');
                    }
                } else if (!result) {
                    console.log('No redirect result found');
                }
            } catch (error: any) {
                if (error.code && error.code !== 'auth/popup-closed-by-user') {
                    console.error('Redirect result error:', error);
                    if (mounted) {
                        setError('Sign-in failed. Please try again.');
                    }
                }
            }
        };

        // Small delay to ensure Firebase is initialized
        const timer = setTimeout(() => {
            handleRedirectResult();
        }, 500);

        return () => {
            mounted = false;
            clearTimeout(timer);
        };
    }, []);

    // Prevent page caching
    useEffect(() => {
        // Add cache control meta tags dynamically
        if (typeof window !== 'undefined') {
            // Prevent back/forward cache
            window.addEventListener('pageshow', (event) => {
                if (event.persisted) {
                    console.log('Page loaded from cache, forcing reload');
                    window.location.reload();
                }
            });
        }
    }, []);

    useEffect(() => {
        loadPoll();
    }, [pollId]);

    const loadPoll = async () => {
        try {
            setLoading(true);
            const response = await fetch(`/api/polls/${pollId}`);
            const data = await response.json();

            if (data.success) {
                setPoll(data.poll);

                // Parse options if stored as string
                if (data.poll.options && typeof data.poll.options === 'string') {
                    data.poll.options = JSON.parse(data.poll.options);
                }
                setPoll(data.poll);

                // Fetch stats for candidates
                const statsResponse = await fetch(`/api/polls/${pollId}/stats`);
                const statsData = await statsResponse.json();
                if (statsData.success) {
                    setStats(statsData.stats);
                }
            } else {
                setError('Poll not found');
            }
        } catch (err) {
            console.error('Error loading poll:', err);
            setError('Failed to load poll');
        } finally {
            setLoading(false);
        }
    };

    const handleVote = async () => {
        // Prevent multiple clicks
        if (voting) {
            console.log('Vote already in progress, ignoring click');
            return;
        }

        if (!voterName || voterName.trim().length < 3) {
            setError('Please enter your name (minimum 3 characters)');
            return;
        }

        if (!selectedOption) {
            setError('Please select an option');
            return;
        }

        if (!deviceFingerprint) {
            setError('Device fingerprint not ready. Please try again.');
            return;
        }

        setVoting(true);
        setError(null);
        setSuccess(null);

        try {
            const response = await fetch(`/api/polls/${pollId}/vote`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    selected_option_id: selectedOption,
                    voter_name: voterName.trim(),
                    device_fingerprint: deviceFingerprint,
                    user_agent: navigator.userAgent,
                    browser_info: {
                        platform: navigator.platform,
                        language: navigator.language,
                        screen: `${screen.width}x${screen.height}`,
                    },
                }),
            });

            const data = await response.json();

            if (data.success) {
                setSuccess('[SUCCESS] Vote submitted successfully!');
                setHasVoted(true);
                loadPoll(); // Reload to get updated vote counts
            } else {
                setError(data.error || 'Failed to submit vote');
                // Only reset voting state on error so user can try again
                setVoting(false);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to submit vote');
            setVoting(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen console-bg flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
                    <p className="text-slate-500 font-mono text-xs animate-pulse">Loading Poll details...</p>
                </div>
            </div>
        );
    }

    if (error && !poll) {
        return (
            <div className="min-h-screen console-bg flex items-center justify-center p-4">
                <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm max-w-md w-full space-y-4">
                    <div className="text-4xl text-rose-500 flex justify-center"><XCircle className="w-12 h-12" /></div>
                    <h1 className="text-xl font-bold text-slate-900">Poll Not Found</h1>
                    <p className="text-xs text-slate-500 font-mono">{error}</p>
                    <button
                        onClick={() => router.push('/polls')}
                        className="inline-flex items-center px-5 py-2.5 rounded-xl bg-slate-800 text-white font-mono font-bold text-xs hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                        GO TO POLLS
                    </button>
                </div>
            </div>
        );
    }

    if (!poll) return null;

    const isPollClosed = poll.status === 'closed' || new Date(poll.closes_at) < new Date();
    const canVote = !isPollClosed && !hasVoted;

    // Calculate percentages
    const totalVotes = poll.total_votes || poll.options.reduce((sum, opt) => sum + (opt.votes || 0), 0);
    const optionsWithPercentage = poll.options.map(opt => ({
        ...opt,
        percentage: totalVotes > 0 ? ((opt.votes || 0) / totalVotes * 100).toFixed(1) : '0.0'
    }));

    return (
        <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
            {/* Decorative eSports glowing ambient overlay */}
            <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

            <div className="max-w-4xl mx-auto relative z-10 space-y-8">
                {/* Navigation back */}
                <Link
                    href="/polls"
                    className="inline-flex items-center text-xs font-mono font-bold text-slate-500 hover:text-amber-600 transition-colors"
                >
                    {"<-"} BACK_TO_POLLS
                </Link>

                {/* Header Title Panel */}
                <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="text-center md:text-left">
                        <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">
                            POLL / SEASON {poll.season_id}
                        </span>
                        <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                            {language === 'en' ? poll.title_en : poll.title_ml}
                        </h1>
                        {(poll.description_en || poll.description_ml) && (
                            <p className="text-xs text-slate-500 font-sans mt-2 max-w-2xl leading-relaxed">
                                {language === 'en' ? poll.description_en : poll.description_ml}
                            </p>
                        )}
                    </div>

                    <div className="flex flex-col items-center sm:items-end gap-3 flex-shrink-0">
                        {/* Status badge */}
                        <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono font-bold uppercase tracking-wider border ${
                                isPollClosed
                                    ? 'bg-slate-50 border-slate-200 text-slate-550'
                                    : 'bg-emerald-50 border-emerald-200 text-emerald-755'
                            }`}>
                                <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                                {isPollClosed ? 'Closed' : 'Active'}
                            </span>
                        </div>

                        {/* Language switcher */}
                        <div className="flex bg-slate-100 border border-slate-200/60 p-1 rounded-xl gap-1 font-mono">
                            <button
                                onClick={() => setLanguage('en')}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    language === 'en'
                                        ? 'bg-amber-600 text-white shadow-sm'
                                        : 'text-slate-650 hover:text-amber-600'
                                }`}
                            >
                                EN
                            </button>
                            <button
                                onClick={() => setLanguage('ml')}
                                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                                    language === 'ml'
                                        ? 'bg-amber-600 text-white shadow-sm'
                                        : 'text-slate-650 hover:text-amber-600'
                                }`}
                            >
                                ML
                            </button>
                        </div>
                    </div>
                </div>

                {/* Poll Status Dashboard */}
                <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-center md:text-left">
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex flex-col justify-center">
                            <span className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">TOTAL VOTES RECORDED</span>
                            <span className="text-3xl font-black text-amber-600 font-mono mt-1">{totalVotes}</span>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex flex-col justify-center">
                            <span className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">CLOSES AT</span>
                            <span className="text-sm font-extrabold text-slate-800 mt-1 uppercase font-mono">
                                {new Date(poll.closes_at).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}
                            </span>
                            <span className="text-[10px] text-slate-450 font-mono font-bold uppercase">
                                {new Date(poll.closes_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' })} IST
                            </span>
                        </div>
                        <div className="col-span-2 md:col-span-1 bg-slate-50 border border-slate-100 rounded-xl p-4 flex flex-col justify-center items-center md:items-start">
                            <span className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">YOUR VOTE STATUS</span>
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-xs font-mono font-bold uppercase tracking-wider mt-2 border ${
                                hasVoted
                                    ? 'bg-emerald-50 border-emerald-200 text-emerald-755'
                                    : canVote
                                    ? 'bg-amber-50 border-amber-200 text-amber-800'
                                    : 'bg-slate-50 border-slate-200 text-slate-500'
                            }`}>
                                {hasVoted ? 'ALREADY VOTED' : canVote ? 'WAITING FOR VOTE' : 'POLL CLOSED'}
                            </span>
                        </div>
                    </div>
                </div>

                {/* Messages */}
                {error && (
                    <div className="p-4 bg-rose-50 border border-rose-250/60 rounded-2xl flex items-start gap-3 animate-fade-in">
                        <AlertTriangle className="w-5 h-5 text-amber-500 inline-block" />
                        <div className="text-xs font-mono font-bold text-rose-800 uppercase tracking-wide">
                            {error}
                        </div>
                    </div>
                )}

                {success && (
                    <div className="p-4 bg-emerald-50 border border-emerald-250/60 rounded-2xl flex items-start gap-3 animate-fade-in">
                        <CheckCircle className="w-5 h-5 text-emerald-500 inline-block" />
                        <div className="text-xs font-mono font-bold text-emerald-800 uppercase tracking-wide">
                            {success}
                        </div>
                    </div>
                )}

                {/* Options List */}
                <div className="space-y-4">
                    {optionsWithPercentage.map((option) => {
                        const isSelected = selectedOption === option.id;
                        const showResults = hasVoted || isPollClosed;

                        return (
                            <div
                                key={option.id}
                                onClick={() => canVote && setSelectedOption(option.id)}
                                className={`relative overflow-hidden rounded-2xl border transition-all duration-250 console-card ${
                                    isSelected
                                        ? 'border-amber-500 bg-amber-50/10 shadow-md scale-[1.01]'
                                        : 'border-slate-200/60 bg-white hover:border-amber-400/40'
                                } ${!canVote ? 'cursor-default' : 'cursor-pointer'}`}
                            >
                                {/* Progress Bar Background */}
                                {showResults && (
                                    <div
                                        className="absolute inset-y-0 left-0 bg-gradient-to-r from-amber-100 to-amber-250/30 transition-all duration-500 pointer-events-none"
                                        style={{ width: `${option.percentage}%` }}
                                    />
                                )}

                                {/* Content */}
                                <div className="relative p-5 sm:p-6 z-10 flex flex-col">
                                    <div className="flex items-center justify-between gap-4">
                                        <div className="flex items-center gap-4 flex-1">
                                            {canVote && (
                                                <div
                                                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                                                        isSelected
                                                            ? 'border-amber-600 bg-amber-600'
                                                            : 'border-slate-300 bg-white group-hover:border-amber-400'
                                                    }`}
                                                >
                                                    {isSelected && (
                                                        <div className="w-2 h-2 bg-white rounded-full"></div>
                                                    )}
                                                </div>
                                            )}
                                            <div className="flex-1">
                                                <p className="text-lg font-extrabold text-slate-900 leading-snug">
                                                    {language === 'en' ? option.text_en : option.text_ml}
                                                </p>
                                                {showResults && (
                                                    <p className="text-xs font-mono font-bold text-slate-450 uppercase mt-1">
                                                        {option.votes || 0} votes recorded
                                                    </p>
                                                )}
                                            </div>
                                        </div>
                                        {showResults && (
                                            <div className="text-right">
                                                <p className="text-2xl font-black text-amber-600 font-mono">
                                                    {option.percentage}%
                                                </p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Stats Comparison Grid */}
                                    {stats[option.id] && (
                                        <div className="mt-4 pt-4 border-t border-slate-200/60 pointer-events-auto">
                                            <div className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">CANDIDATE STATISTICS</div>
                                            {'potm_count' in stats[option.id] ? (
                                                // Player Stats
                                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                                                    <div className="text-center bg-white/70 border border-slate-205 rounded-lg p-2 font-mono">
                                                        <p className="text-[9px] text-slate-400 font-bold uppercase">Matches</p>
                                                        <p className="text-sm font-extrabold text-slate-800 mt-0.5">{(stats[option.id] as PlayerStats).matches_played}</p>
                                                    </div>
                                                    <div className="text-center bg-white/70 border border-slate-205 rounded-lg p-2 font-mono">
                                                        <p className="text-[9px] text-slate-400 font-bold uppercase">W-D-L</p>
                                                        <p className="text-xs font-extrabold text-slate-805 mt-1">
                                                            {(stats[option.id] as PlayerStats).wins}-{(stats[option.id] as PlayerStats).draws}-{(stats[option.id] as PlayerStats).losses}
                                                        </p>
                                                    </div>
                                                    <div className="text-center bg-white/70 border border-slate-205 rounded-lg p-2 font-mono">
                                                        <p className="text-[9px] text-slate-400 font-bold uppercase">GS-GC</p>
                                                        <p className="text-xs font-extrabold text-slate-850 mt-1">
                                                            {(stats[option.id] as PlayerStats).goals_scored}-{(stats[option.id] as PlayerStats).goals_conceded}
                                                        </p>
                                                    </div>
                                                    <div className="text-center bg-white/70 border border-slate-205 rounded-lg p-2 font-mono">
                                                        <p className="text-[9px] text-slate-400 font-bold uppercase">Star Pts</p>
                                                        <p className="text-sm font-black text-amber-600 mt-0.5">{(stats[option.id] as PlayerStats).star_points || (stats[option.id] as PlayerStats).points_gained || 0}</p>
                                                    </div>
                                                    <div className="text-center bg-white/70 border border-slate-205 rounded-lg p-2 font-mono">
                                                        <p className="text-[9px] text-slate-400 font-bold uppercase">POTM</p>
                                                        <p className="text-sm font-black text-amber-600 mt-0.5">{(stats[option.id] as PlayerStats).potm_count}</p>
                                                    </div>
                                                </div>
                                            ) : (
                                                // Team Stats
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                                    <div className="text-center bg-white/70 border border-slate-205 rounded-lg p-2 font-mono">
                                                        <p className="text-[9px] text-slate-400 font-bold uppercase">Matches</p>
                                                        <p className="text-sm font-extrabold text-slate-800 mt-0.5">{(stats[option.id] as TeamStats).matches_played}</p>
                                                    </div>
                                                    <div className="text-center bg-white/70 border border-slate-205 rounded-lg p-2 font-mono">
                                                        <p className="text-[9px] text-slate-400 font-bold uppercase">W-D-L</p>
                                                        <p className="text-xs font-extrabold text-slate-805 mt-1">
                                                            {(stats[option.id] as TeamStats).wins}-{(stats[option.id] as TeamStats).draws}-{(stats[option.id] as TeamStats).losses}
                                                        </p>
                                                    </div>
                                                    <div className="text-center bg-white/70 border border-slate-205 rounded-lg p-2 font-mono">
                                                        <p className="text-[9px] text-slate-400 font-bold uppercase">GS-GC (GD)</p>
                                                        <p className="text-xs font-extrabold text-slate-850 mt-1">
                                                            {(stats[option.id] as TeamStats).goals_scored}-{(stats[option.id] as TeamStats).goals_conceded} ({(stats[option.id] as TeamStats).goal_difference > 0 ? '+' : ''}{(stats[option.id] as TeamStats).goal_difference})
                                                        </p>
                                                    </div>
                                                    <div className="text-center bg-white/70 border border-slate-205 rounded-lg p-2 font-mono">
                                                        <p className="text-[9px] text-slate-400 font-bold uppercase">PTS</p>
                                                        <p className="text-sm font-black text-amber-600 mt-0.5">{(stats[option.id] as TeamStats).points}</p>
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Name Input for Voting */}
                {canVote && (
                    <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm text-center space-y-4">
                        <div className="text-4xl text-amber-500 flex justify-center"><FileText className="w-12 h-12" /></div>
                        <div>
                            <h3 className="text-xl font-extrabold text-slate-900">
                                Verify Identity & Vote
                            </h3>
                            <p className="text-xs text-slate-500 font-mono mt-1">
                                ENTER YOUR FULL NAME TO LEGITIMIZE AND SUBMIT YOUR SELECTION
                            </p>
                        </div>
                        <input
                            type="text"
                            value={voterName}
                            onChange={(e) => setVoterName(e.target.value)}
                            placeholder="Enter your full name"
                            className="w-full max-w-md mx-auto px-4 py-2.5 rounded-xl border border-slate-200 text-sm font-mono text-center focus:ring-1 focus:ring-amber-500 focus:outline-none bg-slate-50 focus:bg-white transition-all shadow-inner"
                            disabled={hasVoted || voting}
                        />
                    </div>
                )}

                {/* Vote Button */}
                {canVote && (
                    <button
                        onClick={handleVote}
                        disabled={!selectedOption || !voterName || voting}
                        className="w-full bg-amber-600 hover:bg-amber-700 text-white font-mono font-bold text-sm uppercase py-4 rounded-2xl hover:shadow-md hover:shadow-amber-600/10 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {voting ? (
                            <span className="flex items-center justify-center">
                                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                                SUBMITTING_VOTE...
                            </span>
                        ) : (
                            <>
                                <Vote className="w-4 h-4 inline mr-1.5 align-middle" /> SUBMIT VOTE
                            </>
                        )}
                    </button>
                )}

                {/* Footer details */}
                <div className="text-center space-y-2 pt-4">
                    <p className="text-[10px] text-slate-400 font-mono uppercase">
                        POLL_ID: {poll.poll_id}
                    </p>
                </div>
            </div>
        </div>
    );
}
