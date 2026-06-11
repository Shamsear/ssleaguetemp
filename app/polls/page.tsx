'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useLanguage } from '@/contexts/LanguageContext';
import Link from 'next/link';
import { Shield, Vote, Calendar, Clock, ChevronRight } from 'lucide-react';

interface Poll {
    poll_id: string;
    season_id: string;
    poll_type: string;
    title_en: string;
    title_ml: string;
    closes_at: string;
    total_votes: number;
    status: string;
    created_at: string;
}

function PollsListContent() {
    const router = useRouter();
    const { language, setLanguage } = useLanguage();
    const [polls, setPolls] = useState<Poll[]>([]);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<'all' | 'active' | 'closed'>('active');

    useEffect(() => {
        loadPolls();
    }, [filter]);

    const loadPolls = async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (filter !== 'all') {
                params.append('status', filter);
            }

            const response = await fetch(`/api/polls/public?${params}`);
            const data = await response.json();

            if (data.success) {
                setPolls(data.data || []);
            }
        } catch (err) {
            console.error('Error loading polls:', err);
        } finally {
            setLoading(false);
        }
    };

    const isPollClosed = (poll: Poll) => {
        return poll.status === 'closed' || new Date(poll.closes_at) < new Date();
    };

    const getTimeRemaining = (closesAt: string) => {
        const now = new Date();
        const closes = new Date(closesAt);
        const diff = closes.getTime() - now.getTime();

        if (diff < 0) return 'CLOSED';

        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 65)); // rounded down

        if (days > 0) return `${days}d ${hours}h left`;
        if (hours > 0) return `${hours}h left`;
        return 'CLOSING SOON';
    };

    const getLocalizedText = (poll: Poll, field: 'title'): string => {
        if (language === 'ml') {
            const mlField = `${field}_ml` as keyof Poll;
            if (poll[mlField]) return poll[mlField] as string;
        }
        const enField = `${field}_en` as keyof Poll;
        return (poll[enField] || poll[field] || '') as string;
    };

    const formatClosesDate = (closesAt: string) => {
        try {
            const date = new Date(closesAt);
            return new Intl.DateTimeFormat('en-IN', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Kolkata',
            }).format(date) + ' IST';
        } catch {
            return closesAt;
        }
    };

    return (
        <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
            {/* Decorative eSports glowing ambient overlay */}
            <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

            <div className="max-w-7xl mx-auto relative z-10 space-y-8">
                {/* Navigation back */}
                <Link
                    href="/"
                    className="inline-flex items-center text-xs font-mono font-bold text-slate-500 hover:text-amber-600 transition-colors"
                >
                    ← BACK_TO_HOME
                </Link>

                {/* Header Title Panel */}
                <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
                    <div className="text-center md:text-left">
                        <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">PUBLIC FAN POLLS</span>
                        <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                            🗳️ Fan Polls
                        </h1>
                        <p className="text-xs text-slate-500 font-mono mt-1">
                            CAST YOUR VOTE: ACTIVE OR COMPLETED FAN POLLS FOR RECENT TOURNAMENTS
                        </p>
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Language Toggle */}
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

                {/* Filter Tabs */}
                <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm space-y-4">
                    <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
                        SELECT POLL STATUS
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {[
                            { id: 'active' as const, label: 'Active Polls', icon: '🟢' },
                            { id: 'closed' as const, label: 'Closed Polls', icon: '🔒' },
                            { id: 'all' as const, label: 'All Polls', icon: '📊' },
                        ].map((tab) => (
                            <button
                                key={tab.id}
                                onClick={() => setFilter(tab.id)}
                                className={`px-4 py-2.5 rounded-xl font-mono font-bold text-xs border transition-all cursor-pointer ${
                                    filter === tab.id
                                        ? 'bg-amber-600 text-white border-amber-600 shadow-sm shadow-amber-600/10'
                                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                                }`}
                            >
                                <span className="mr-1.5">{tab.icon}</span> {tab.label.toUpperCase()}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Loading State */}
                {loading && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {[...Array(6)].map((_, i) => (
                            <div key={i} className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm space-y-4 animate-pulse">
                                <div className="flex items-center justify-between">
                                    <div className="h-4 bg-slate-100 rounded w-1/4"></div>
                                    <div className="h-4 bg-slate-100 rounded w-1/4"></div>
                                </div>
                                <div className="h-6 bg-slate-100 rounded w-3/4 mt-2"></div>
                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-100">
                                    <div className="h-10 bg-slate-100 rounded"></div>
                                    <div className="h-10 bg-slate-100 rounded"></div>
                                </div>
                                <div className="h-10 bg-slate-100 rounded-xl mt-4"></div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Empty State */}
                {!loading && polls.length === 0 && (
                    <div className="bg-white border border-slate-200/60 rounded-2xl p-12 text-center shadow-sm max-w-lg mx-auto">
                        <Vote className="w-12 h-12 text-slate-350 mx-auto mb-4" />
                        <h3 className="text-slate-900 text-lg font-bold">No Polls Available</h3>
                        <p className="text-xs text-slate-400 font-mono mt-1 uppercase">
                            {filter === 'active' ? 'There are no active polls at the moment' : 'No polls found matching filter'}
                        </p>
                    </div>
                )}

                {/* Polls Grid */}
                {!loading && polls.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {polls.map((poll) => {
                            const closed = isPollClosed(poll);
                            return (
                                <Link
                                    key={poll.poll_id}
                                    href={`/polls/${poll.poll_id}`}
                                    className="console-card rounded-2xl overflow-hidden bg-white border border-slate-200/60 shadow-sm flex flex-col h-full hover:border-amber-400/40 transition-all duration-250 group"
                                >
                                    {/* Card Header */}
                                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider border ${
                                                    closed
                                                        ? 'bg-slate-50 border-slate-200 text-slate-500'
                                                        : 'bg-emerald-50 border-emerald-200 text-emerald-755'
                                                }`}>
                                                    <span className="w-1.5 h-1.5 rounded-full bg-current"></span>
                                                    {closed ? 'Closed' : 'Active'}
                                                </span>
                                                <span className="text-[10px] font-mono text-slate-450 font-bold uppercase flex items-center gap-1">
                                                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                                                    {getTimeRemaining(poll.closes_at)}
                                                </span>
                                            </div>

                                            <h3 className="font-extrabold text-slate-900 text-lg sm:text-xl tracking-tight group-hover:text-amber-600 transition-colors line-clamp-2 mt-2">
                                                {getLocalizedText(poll, 'title')}
                                            </h3>
                                        </div>

                                        <div className="space-y-3">
                                            {/* Details Grid */}
                                            <div className="grid grid-cols-2 gap-4 bg-slate-50 border border-slate-100 rounded-xl p-3.5">
                                                <div>
                                                    <div className="text-[9px] text-slate-400 font-mono font-bold uppercase tracking-wider">TOTAL VOTES</div>
                                                    <div className="text-2xl font-black text-amber-600 font-mono mt-0.5">
                                                        {poll.total_votes || 0}
                                                    </div>
                                                </div>
                                                <div>
                                                    <div className="text-[9px] text-slate-400 font-mono font-bold uppercase tracking-wider">POLL TYPE</div>
                                                    <div className="inline-block text-[10px] font-mono font-bold text-slate-700 bg-white border border-slate-150 px-2 py-0.5 rounded-md uppercase mt-1">
                                                        {poll.poll_type.replace('award_', '').replace('_', ' ')}
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Footer details */}
                                            <div className="pt-3 border-t border-slate-100 flex flex-col gap-1.5 text-[9px] text-slate-400 font-mono">
                                                <div className="flex justify-between items-center">
                                                    <span>CLOSES ON:</span>
                                                    <span className="font-semibold text-slate-600">{formatClosesDate(poll.closes_at)}</span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span>SEASON ID:</span>
                                                    <span className="font-bold bg-slate-100 text-slate-650 px-2 py-0.5 rounded">{poll.season_id}</span>
                                                </div>
                                            </div>

                                            {/* CTA Button */}
                                            <div className={`w-full py-2.5 rounded-xl font-mono font-bold text-xs text-center border transition-all uppercase tracking-wider ${
                                                closed
                                                    ? 'bg-slate-50 border-slate-200 text-slate-500 group-hover:bg-slate-100'
                                                    : 'bg-amber-600 text-white border-amber-650 group-hover:bg-amber-700 group-hover:shadow-md group-hover:shadow-amber-600/10'
                                            }`}>
                                                {closed ? 'View Results' : 'Vote Now →'}
                                            </div>
                                        </div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export default function PublicPollsPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen console-bg flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
                    <p className="text-slate-500 font-mono text-xs">Loading Polls Arena...</p>
                </div>
            </div>
        }>
            <PollsListContent />
        </Suspense>
    );
}
