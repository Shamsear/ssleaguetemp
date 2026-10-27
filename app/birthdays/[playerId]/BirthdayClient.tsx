'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Share2,
  Copy,
  Check,
  Trophy,
  Target,
  RefreshCw,
  Heart,
  Calendar,
  Users,
  Award,
  ChevronLeft,
  ExternalLink,
  MessageCircle,
  ArrowRight,
  Shield,
  CircleDot,
  Swords,
} from 'lucide-react';
import ConfettiEffect from '../../../components/birthday/ConfettiEffect';

interface BirthdayData {
  player: {
    id: string;
    player_id: string;
    name: string;
    display_name: string;
    dob: string;
    age: number;
    photo_url: string;
    team: string;
    category: string;
    place?: string;
  };
  stats: {
    matches: number;
    goals: number;
    goals_conceded: number;
    wins: number;
    draws: number;
    losses: number;
    clean_sheets: number;
    motm_awards: number;
    points: number;
  };
  seasons: Array<{
    season_id: string;
    team: string;
    category: string;
    matches: number;
    goals: number;
    wins: number;
    clean_sheets: number;
    motm_awards: number;
    points: number;
  }>;
  awards: any[];
  story: {
    headline: string;
    subtitle: string;
    roastParagraph: string;
    tacticalReport: string;
    lockerRoomRumor: string;
    birthdayWish: string;
    isAiGenerated: boolean;
  };
}

const getCategoryColor = (category: string) => {
  const cat = (category || '').toLowerCase();
  switch (cat) {
    case 'red':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'black':
      return 'bg-slate-900 text-white border-slate-800';
    case 'blue':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'orange':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'white':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

export default function BirthdayClient({ initialData }: { initialData: BirthdayData }) {
  const { player, stats, seasons, awards } = initialData;
  const [story, setStory] = useState(initialData.story);
  const [copied, setCopied] = useState(false);
  const [showConfetti, setShowConfetti] = useState(true);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [wishCount, setWishCount] = useState(1);
  const [hasWished, setHasWished] = useState(false);

  const winRate = stats.matches > 0 ? Math.round((stats.wins / stats.matches) * 100) : 0;
  const goalsPerMatch = stats.matches > 0 ? (stats.goals / stats.matches).toFixed(2) : '0.00';

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleShareWhatsApp = () => {
    if (typeof window !== 'undefined') {
      const text = encodeURIComponent(
        `Today is ${player.name}'s Birthday (${player.age} Years)!\nCheck out his SS League tournament record and birthday feature:\n${window.location.href}`
      );
      window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
    }
  };

  const handleShareTwitter = () => {
    if (typeof window !== 'undefined') {
      const text = encodeURIComponent(
        `Celebrating ${player.name}'s Birthday (${player.age} Years)! SS League tournament record:\n`
      );
      window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(window.location.href)}`, '_blank');
    }
  };

  const handleSendWish = () => {
    setWishCount((prev) => prev + 1);
    setHasWished(true);
    setShowConfetti(false);
    setTimeout(() => setShowConfetti(true), 50);
  };

  const handleRegenerateStory = async () => {
    try {
      setIsGeneratingStory(true);
      const res = await fetch(`/api/birthdays/${player.id}/story`, {
        method: 'POST',
      });
      const data = await res.json();
      if (data.success && data.story) {
        setStory(data.story);
        setShowConfetti(false);
        setTimeout(() => setShowConfetti(true), 50);
      }
    } catch (err) {
      console.error('Failed to regenerate birthday story:', err);
    } finally {
      setIsGeneratingStory(false);
    }
  };

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-24 sm:pt-32 lg:pt-36 pb-12 px-4 sm:px-6">
      {/* Gentle celebratory particle effect */}
      {showConfetti && <ConfettiEffect duration={3500} />}

      {/* Decorative ambient gold glow overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10 space-y-6">
        {/* Navigation & Status Header */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm font-mono"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            BACK TO HOME
          </Link>

          <div className="flex items-center gap-2 font-mono text-xs">
            <span className="bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1 rounded-xl font-bold">
              PLAYER_ID: {player.player_id || player.id}
            </span>
            <span className="bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-amber-700 px-3 py-1 rounded-xl font-bold">
              BIRTHDAY EDITION
            </span>
          </div>
        </div>

        {/* HERO SECTION: Player Spotlight Card */}
        <section className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-10 shadow-sm relative overflow-hidden">
          {/* Subtle console corner metadata */}
          <div className="absolute top-0 right-0 p-4 font-mono text-[9px] text-slate-300 pointer-events-none select-none hidden sm:block">
            LEAGUE_EVENT: [BIRTHDAY_CELEBRATION]
          </div>

          <div className="flex flex-col md:flex-row items-center gap-6 sm:gap-10 relative z-10">
            {/* Player Avatar */}
            <div className="relative shrink-0">
              <div className="h-32 w-32 sm:h-40 sm:w-40 rounded-2xl border-2 border-slate-200/90 ring-2 ring-[#D4AF37]/30 p-1 bg-white shadow-md overflow-hidden">
                <div className="relative h-full w-full rounded-xl overflow-hidden bg-slate-100">
                  <Image
                    src={player.photo_url || '/placeholder-player.png'}
                    alt={player.name}
                    fill
                    sizes="(max-width: 640px) 128px, 160px"
                    priority
                    className="object-cover"
                  />
                </div>
              </div>

              {/* Age Milestone Badge */}
              <div className="absolute -bottom-2 -right-2 flex h-8 px-2.5 items-center justify-center rounded-lg bg-slate-950 text-[#D4AF37] font-mono text-xs font-bold border border-slate-800 shadow-md">
                {player.age ? `${player.age} YEARS` : 'PLAYER'}
              </div>
            </div>

            {/* Player Greeting & Details */}
            <div className="flex-1 text-center md:text-left">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-800 text-[10px] font-mono font-bold uppercase tracking-wider mb-2.5">
                <CircleDot className="w-2.5 h-2.5 text-[#D4AF37] animate-pulse" />
                SS SUPER LEAGUE // BIRTHDAY SPOTLIGHT
              </div>

              <h1 className="text-3xl sm:text-5xl font-black text-slate-950 tracking-tight uppercase leading-none">
                {player.name}
              </h1>

              {player.display_name && player.display_name !== player.name && (
                <p className="text-xs font-mono font-bold text-slate-500 mt-1 uppercase">
                  AKA {player.display_name}
                </p>
              )}

              <div className="mt-3.5 flex flex-wrap items-center justify-center md:justify-start gap-2">
                <span className="border border-slate-200 bg-slate-50 px-3 py-1 rounded-xl text-xs font-mono font-bold text-slate-700">
                  TEAM: <strong className="text-slate-900">{player.team}</strong>
                </span>
                <span className={`border px-3 py-1 rounded-xl text-xs font-mono font-bold ${getCategoryColor(player.category)}`}>
                  CAT: {player.category}
                </span>
                {player.dob && (
                  <span className="flex items-center gap-1 border border-slate-200 bg-slate-50 px-3 py-1 rounded-xl text-xs font-mono text-slate-600">
                    <Calendar className="h-3 w-3 text-[#D4AF37]" />
                    {player.dob}
                  </span>
                )}
              </div>

              <p className="mt-3.5 text-xs sm:text-sm text-slate-600 font-mono leading-relaxed max-w-2xl">
                The SS Premier Super League family congratulates you on your special day. Celebrating your dedication, tournament consistency, and tournament highlights.
              </p>

              {/* Action Buttons: Wish & Share */}
              <div className="mt-6 flex flex-wrap items-center justify-center md:justify-start gap-2.5">
                <button
                  onClick={handleSendWish}
                  className="inline-flex items-center gap-2 bg-slate-950 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-mono font-bold shadow-md transition-all hover:scale-105 border border-slate-950"
                >
                  <Heart className={`h-3.5 w-3.5 ${hasWished ? 'fill-current text-rose-400' : 'text-[#D4AF37]'}`} />
                  <span>{hasWished ? 'Wished!' : 'Wish Happy Birthday'}</span>
                  <span className="rounded bg-white/20 px-1.5 py-0.2 text-[10px]">
                    {wishCount}
                  </span>
                </button>

                <button
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition-all shadow-sm"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
                  <span>{copied ? 'COPIED' : 'COPY LINK'}</span>
                </button>

                <button
                  onClick={handleShareWhatsApp}
                  className="inline-flex items-center gap-1.5 border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-emerald-800 px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition-all shadow-sm"
                >
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                  <span>WHATSAPP</span>
                </button>

                <button
                  onClick={handleShareTwitter}
                  className="inline-flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition-all shadow-sm"
                >
                  <Share2 className="h-3.5 w-3.5 text-slate-600" />
                  <span>SHARE ON X</span>
                </button>
              </div>
            </div>
          </div>

          {/* Decorative console chevron line */}
          <div className="absolute bottom-0 left-0 right-0 h-[4px] bg-[repeating-linear-gradient(90deg,rgba(0,0,0,0.06)_0px,rgba(0,0,0,0.06)_1px,transparent_1px,transparent_12px)] opacity-50" />
        </section>

        {/* SECTION: The Birthday Chronicle */}
        <section className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider font-mono">
                Tournament Press Dispatch // Special Feature
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight mt-0.5">
                The Birthday Chronicle: Roast & Toast
              </h2>
            </div>

            <button
              onClick={handleRegenerateStory}
              disabled={isGeneratingStory}
              className="inline-flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-3.5 py-2 rounded-xl text-xs font-mono font-bold transition-all shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 text-[#D4AF37] ${isGeneratingStory ? 'animate-spin' : ''}`} />
              <span>{isGeneratingStory ? 'Drafting Feature...' : 'Regenerate Feature'}</span>
            </button>
          </div>

          <article className="mt-5 space-y-4">
            {/* Headline */}
            <div>
              <h3 className="text-lg sm:text-2xl font-black text-slate-950 uppercase tracking-tight leading-snug">
                {story.headline}
              </h3>
              {story.subtitle && (
                <p className="mt-1 text-xs sm:text-sm font-mono text-slate-500 italic">
                  "{story.subtitle}"
                </p>
              )}
            </div>

            {/* Roast Box */}
            <div className="rounded-xl border border-amber-200/70 bg-amber-50/40 p-4 text-xs sm:text-sm text-slate-800 leading-relaxed font-mono">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-1.5">
                <Target className="h-3 w-3 text-amber-600" />
                COMMUNITY ROAST & OBSERVATION
              </div>
              <p>{story.roastParagraph}</p>
            </div>

            {/* Tactical Report */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-xs sm:text-sm text-slate-800 leading-relaxed font-mono">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                <Trophy className="h-3 w-3 text-[#D4AF37]" />
                TACTICAL SCOUTING DISPATCH
              </div>
              <p>{story.tacticalReport}</p>
            </div>

            {/* Locker Room Rumor */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-xs sm:text-sm text-slate-800 leading-relaxed font-mono">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                <Users className="h-3 w-3 text-slate-600" />
                FRANCHISE & TEAMMATE NOTES
              </div>
              <p>{story.lockerRoomRumor}</p>
            </div>

            {/* League Birthday Salute */}
            <div className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/10 p-4 text-xs sm:text-sm text-amber-950 leading-relaxed font-mono font-medium">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-1.5">
                <Swords className="h-3 w-3 text-[#D4AF37]" />
                OFFICIAL LEAGUE SALUTE
              </div>
              <p>{story.birthdayWish}</p>
            </div>
          </article>
        </section>

        {/* SECTION: Career Stats Metrics */}
        <section className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider font-mono">
                Career Hall of Records
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight uppercase mt-0.5">
                Tournament Metrics
              </h2>
            </div>
            <span className="text-xs font-mono font-bold bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1 rounded-xl">
              {seasons.length} SEASONS
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-center">
              <span className="block text-[10px] font-mono font-bold text-slate-500 uppercase">Matches</span>
              <span className="mt-1 block text-2xl sm:text-3xl font-black text-slate-900">
                {stats.matches}
              </span>
              <span className="text-[10px] font-mono text-slate-400">Total Played</span>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-center">
              <span className="block text-[10px] font-mono font-bold text-slate-500 uppercase">Goals</span>
              <span className="mt-1 block text-2xl sm:text-3xl font-black text-amber-700">
                {stats.goals}
              </span>
              <span className="text-[10px] font-mono text-slate-400">{goalsPerMatch} / match</span>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-center">
              <span className="block text-[10px] font-mono font-bold text-slate-500 uppercase">Wins</span>
              <span className="mt-1 block text-2xl sm:text-3xl font-black text-emerald-600">
                {stats.wins}
              </span>
              <span className="text-[10px] font-mono text-slate-400">{winRate}% Win Rate</span>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-center">
              <span className="block text-[10px] font-mono font-bold text-slate-500 uppercase">Clean Sheets</span>
              <span className="mt-1 block text-2xl sm:text-3xl font-black text-sky-600">
                {stats.clean_sheets}
              </span>
              <span className="text-[10px] font-mono text-slate-400">Shutouts</span>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-center">
              <span className="block text-[10px] font-mono font-bold text-slate-500 uppercase">MOTM</span>
              <span className="mt-1 block text-2xl sm:text-3xl font-black text-[#D4AF37]">
                {stats.motm_awards}
              </span>
              <span className="text-[10px] font-mono text-slate-400">Awards</span>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-center">
              <span className="block text-[10px] font-mono font-bold text-slate-500 uppercase">Points</span>
              <span className="mt-1 block text-2xl sm:text-3xl font-black text-slate-900">
                {stats.points}
              </span>
              <span className="text-[10px] font-mono text-slate-400">Career Pts</span>
            </div>
          </div>
        </section>

        {/* SECTION: Season-by-Season Journey */}
        {seasons.length > 0 && (
          <section className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm">
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-[#D4AF37]" />
              Tournament History by Season
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2.5 font-bold uppercase">Season</th>
                    <th className="pb-2.5 font-bold uppercase">Team</th>
                    <th className="pb-2.5 font-bold uppercase">Cat</th>
                    <th className="pb-2.5 font-bold uppercase text-center">Matches</th>
                    <th className="pb-2.5 font-bold uppercase text-center">Goals</th>
                    <th className="pb-2.5 font-bold uppercase text-center">Wins</th>
                    <th className="pb-2.5 font-bold uppercase text-center">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {seasons.map((s, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 font-bold text-amber-700">{s.season_id}</td>
                      <td className="py-2.5 font-semibold text-slate-900">{s.team}</td>
                      <td className="py-2.5">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getCategoryColor(s.category)}`}>
                          {s.category}
                        </span>
                      </td>
                      <td className="py-2.5 text-center text-slate-600">{s.matches}</td>
                      <td className="py-2.5 text-center font-bold text-slate-900">{s.goals}</td>
                      <td className="py-2.5 text-center text-emerald-600 font-bold">{s.wins}</td>
                      <td className="py-2.5 text-center font-bold text-[#D4AF37]">{s.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* SECTION: Honors & Awards */}
        {awards.length > 0 && (
          <section className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm">
            <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight mb-4 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-[#D4AF37]" />
              Honors & Accolades ({awards.length})
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {awards.map((award, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 text-[#D4AF37]">
                    <Award className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0 font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-800 uppercase">
                        {award.award_type === 'POTD' ? 'Player of the Day' : award.award_type === 'POTW' ? 'Player of the Week' : award.award_type}
                      </span>
                      <span className="text-[10px] text-slate-400">• {award.season_id}</span>
                    </div>
                    <p className="text-xs font-bold text-slate-800 truncate mt-0.5">
                      {award.team_name || player.team}
                    </p>
                    {award.performance_stats && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        {award.performance_stats.goals ? `${award.performance_stats.goals} Goals` : ''}
                        {award.performance_stats.matchup ? ` • ${award.performance_stats.matchup}` : ''}
                      </p>
                    )}
                    {award.instagram_post_url && (
                      <a
                        href={award.instagram_post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-pink-600 hover:text-pink-500"
                      >
                        <span>View Instagram Feature</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer Back Button */}
        <div className="text-center pt-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-6 py-3 rounded-xl text-xs font-bold transition-all shadow-sm font-mono"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>RETURN TO SS SUPER LEAGUE HOME</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
