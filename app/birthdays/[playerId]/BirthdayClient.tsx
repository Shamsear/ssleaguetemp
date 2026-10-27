'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  Cake,
  Share2,
  Copy,
  Check,
  Sparkles,
  Trophy,
  Flame,
  Shield,
  Star,
  RefreshCw,
  Heart,
  Calendar,
  Users,
  Award,
  ChevronLeft,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';
import ConfettiEffect from '@/components/birthday/ConfettiEffect';

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

export default function BirthdayClient({ initialData }: { initialData: BirthdayData }) {
  const { player, stats, seasons, awards } = initialData;
  const [story, setStory] = useState(initialData.story);
  const [copied, setCopied] = useState(false);
  const [showConfetti, setShowConfetti] = useState(true);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [wishCount, setWishCount] = useState(1);
  const [hasWished, setHasWished] = useState(false);

  const winRate = stats.matches > 0 ? Math.round((stats.wins / stats.matches) * 100) : 0;
  const goalsPerMatch = stats.matches > 0 ? (stats.goals / stats.matches).toFixed(1) : '0';

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
        `🎂 Today is ${player.name}'s Birthday (${player.age} Years)! 🎉\nCheck out his career stats & hilarious SS League birthday roast:\n${window.location.href}`
      );
      window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
    }
  };

  const handleShareTwitter = () => {
    if (typeof window !== 'undefined') {
      const text = encodeURIComponent(
        `🎂 Wishing a Happy Birthday to ${player.name} (${player.age})! Check out his SS League stats & birthday roast:\n`
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
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-20 pt-6 px-4 sm:px-6 lg:px-8">
      {/* Festive Confetti Burst */}
      {showConfetti && <ConfettiEffect duration={5000} />}

      {/* Background Ambience */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 h-[500px] w-[800px] rounded-full bg-gradient-to-b from-amber-500/15 via-orange-500/10 to-transparent blur-3xl" />
        <div className="absolute top-1/3 -left-40 h-[400px] w-[400px] rounded-full bg-amber-600/10 blur-3xl" />
        <div className="absolute bottom-10 -right-40 h-[400px] w-[400px] rounded-full bg-yellow-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-5xl">
        {/* Navigation / Header */}
        <div className="mb-6 flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-slate-400 hover:text-amber-400 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Home
          </Link>

          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300">
              <Cake className="h-3.5 w-3.5 text-amber-400" />
              Official SS League Birthday Card
            </span>
          </div>
        </div>

        {/* HERO SECTION: Player Photo & Birthday Spotlight */}
        <section className="relative overflow-hidden rounded-3xl border border-amber-500/30 bg-gradient-to-b from-slate-900/90 via-slate-900/80 to-slate-950 p-6 sm:p-10 shadow-2xl shadow-amber-500/15">
          {/* Subtle Festive Banner Overlay */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 h-48 w-48 rounded-full bg-amber-500/10 blur-2xl" />

          <div className="relative flex flex-col md:flex-row items-center gap-8 md:gap-10">
            {/* Player Avatar with Halo */}
            <div className="relative shrink-0">
              <div className="h-40 w-40 sm:h-48 sm:w-48 overflow-hidden rounded-full border-4 border-amber-400/80 p-1.5 shadow-2xl shadow-amber-500/30 bg-gradient-to-tr from-amber-600 via-yellow-400 to-amber-200">
                <div className="relative h-full w-full overflow-hidden rounded-full bg-slate-800">
                  <Image
                    src={player.photo_url || '/placeholder-player.png'}
                    alt={player.name}
                    fill
                    sizes="(max-width: 640px) 160px, 192px"
                    priority
                    className="object-cover"
                  />
                </div>
              </div>

              {/* Age Milestone Stamp */}
              <div className="absolute -bottom-2 -right-2 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-tr from-amber-500 via-yellow-400 to-amber-300 text-slate-950 shadow-xl border-4 border-slate-950">
                <div className="text-center">
                  <span className="block text-base font-black leading-none">{player.age}</span>
                  <span className="block text-[9px] font-bold uppercase tracking-wider">Years</span>
                </div>
              </div>
            </div>

            {/* Player Greeting & Details */}
            <div className="flex-1 text-center md:text-left">
              <div className="inline-flex items-center gap-2 rounded-full bg-amber-400/10 border border-amber-400/20 px-3.5 py-1 text-xs font-bold text-amber-300 uppercase tracking-wider mb-2">
                <Sparkles className="h-3 w-3 text-yellow-300" />
                Happy Birthday, Champion!
              </div>

              <h1 className="text-3xl sm:text-5xl font-black tracking-tight text-white">
                {player.name}
              </h1>

              {player.display_name && player.display_name !== player.name && (
                <p className="text-sm font-semibold text-slate-400 mt-0.5">
                  ({player.display_name})
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-center md:justify-start gap-2.5">
                <span className="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-bold text-slate-200">
                  Team: <strong className="text-amber-400">{player.team}</strong>
                </span>
                <span className="rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-bold text-slate-200">
                  Category: <strong className="text-emerald-400">{player.category}</strong>
                </span>
                {player.dob && (
                  <span className="flex items-center gap-1 rounded-xl border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-semibold text-slate-300">
                    <Calendar className="h-3 w-3 text-amber-400" />
                    Born {player.dob}
                  </span>
                )}
              </div>

              <p className="mt-4 text-sm sm:text-base text-slate-300 leading-relaxed max-w-2xl">
                The SS Premier Super League family congratulates you on your special day! Here’s to another year of legendary goals, tactical triumphs, and unforgettable tournament memories.
              </p>

              {/* Action Buttons: Wish & Share */}
              <div className="mt-6 flex flex-wrap items-center justify-center md:justify-start gap-3">
                <button
                  onClick={handleSendWish}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-5 py-2.5 text-xs sm:text-sm font-bold text-white shadow-lg shadow-amber-500/25 hover:from-amber-400 hover:to-amber-500 hover:scale-105 transition-all"
                >
                  <Heart className={`h-4 w-4 ${hasWished ? 'fill-current text-red-200' : ''}`} />
                  <span>{hasWished ? 'Wished!' : 'Wish Happy Birthday!'}</span>
                  <span className="rounded-full bg-black/20 px-2 py-0.5 text-[11px]">
                    {wishCount}
                  </span>
                </button>

                <button
                  onClick={handleCopyLink}
                  className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800/80 hover:bg-slate-700/80 px-4 py-2.5 text-xs sm:text-sm font-semibold text-slate-200 hover:text-white transition-all"
                >
                  {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4 text-slate-400" />}
                  <span>{copied ? 'Link Copied!' : 'Copy Share Link'}</span>
                </button>

                <button
                  onClick={handleShareWhatsApp}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 px-4 py-2.5 text-xs sm:text-sm font-semibold text-emerald-300 transition-all"
                >
                  <MessageCircle className="h-4 w-4 text-emerald-400" />
                  <span>WhatsApp</span>
                </button>

                <button
                  onClick={handleShareTwitter}
                  className="flex items-center gap-2 rounded-xl bg-sky-600/20 hover:bg-sky-600/30 border border-sky-500/40 px-4 py-2.5 text-xs sm:text-sm font-semibold text-sky-300 transition-all"
                >
                  <Share2 className="h-4 w-4 text-sky-400" />
                  <span>Share on X</span>
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION: The Birthday Chronicle (Funny News & Roast & Toast) */}
        <section className="mt-8 rounded-3xl border border-amber-500/30 bg-gradient-to-b from-slate-900/90 to-slate-950 p-6 sm:p-8 shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-widest">
                <Sparkles className="h-3.5 w-3.5" />
                SS League Special Sports Gazette
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                The Birthday Chronicle: Roast & Toast 📰
              </h2>
            </div>

            <button
              onClick={handleRegenerateStory}
              disabled={isGeneratingStory}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 px-4 py-2 text-xs font-bold text-amber-300 hover:text-white transition-all disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isGeneratingStory ? 'animate-spin' : ''}`} />
              <span>{isGeneratingStory ? 'Drafting Story with AI...' : 'Regenerate Roast ✨'}</span>
            </button>
          </div>

          {/* Newspaper Styled Article */}
          <article className="mt-6 space-y-5">
            {/* Headline */}
            <div>
              <h3 className="text-xl sm:text-3xl font-extrabold tracking-tight text-amber-300 leading-snug">
                {story.headline}
              </h3>
              {story.subtitle && (
                <p className="mt-2 text-sm sm:text-base font-semibold text-slate-300 italic">
                  "{story.subtitle}"
                </p>
              )}
            </div>

            {/* The Loving Roast */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6 text-sm sm:text-base text-slate-200 leading-relaxed">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-orange-400 mb-2">
                <Flame className="h-4 w-4" />
                The Birthday Roast
              </div>
              <p>{story.roastParagraph}</p>
            </div>

            {/* Tactical Scouting Report */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6 text-sm sm:text-base text-slate-200 leading-relaxed">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-sky-400 mb-2">
                <Trophy className="h-4 w-4" />
                Tactical Scouting & Stat Analysis
              </div>
              <p>{story.tacticalReport}</p>
            </div>

            {/* Locker Room Rumor */}
            <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-6 text-sm sm:text-base text-slate-200 leading-relaxed">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-purple-400 mb-2">
                <Users className="h-4 w-4" />
                Locker-Room Dispatch
              </div>
              <p>{story.lockerRoomRumor}</p>
            </div>

            {/* Heartfelt Birthday Salute */}
            <div className="rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-500/10 via-orange-500/10 to-amber-500/10 p-5 sm:p-6 text-sm sm:text-base text-amber-100 font-medium leading-relaxed">
              <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300 mb-2">
                <Cake className="h-4 w-4" />
                Official SS League Wishes
              </div>
              <p>{story.birthdayWish}</p>
            </div>
          </article>
        </section>

        {/* SECTION: Career Statistics Showcase */}
        <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 sm:p-8">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <div className="flex items-center gap-2 text-xs font-bold text-amber-400 uppercase tracking-widest">
                <Trophy className="h-3.5 w-3.5" />
                Career Hall of Records
              </div>
              <h2 className="text-xl sm:text-2xl font-black text-white mt-1">
                {player.name}'s Tournament Metrics
              </h2>
            </div>
            <span className="text-xs font-semibold text-slate-400">
              {seasons.length} Seasons Contested
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
            {/* Matches Played */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-center">
              <span className="block text-xs font-medium text-slate-400 uppercase">Matches</span>
              <span className="mt-1 block text-2xl sm:text-3xl font-extrabold text-white">
                {stats.matches}
              </span>
              <span className="text-[11px] text-slate-500">{seasons.length} seasons</span>
            </div>

            {/* Goals Scored */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-center">
              <span className="block text-xs font-medium text-slate-400 uppercase">Goals</span>
              <span className="mt-1 block text-2xl sm:text-3xl font-extrabold text-amber-400">
                {stats.goals}
              </span>
              <span className="text-[11px] text-slate-500">{goalsPerMatch} / match</span>
            </div>

            {/* Wins */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-center">
              <span className="block text-xs font-medium text-slate-400 uppercase">Victories</span>
              <span className="mt-1 block text-2xl sm:text-3xl font-extrabold text-emerald-400">
                {stats.wins}
              </span>
              <span className="text-[11px] text-slate-500">{winRate}% win rate</span>
            </div>

            {/* Clean Sheets */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-center">
              <span className="block text-xs font-medium text-slate-400 uppercase">Clean Sheets</span>
              <span className="mt-1 block text-2xl sm:text-3xl font-extrabold text-sky-400">
                {stats.clean_sheets}
              </span>
              <span className="text-[11px] text-slate-500">Shutouts</span>
            </div>

            {/* MOTM Awards */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-center">
              <span className="block text-xs font-medium text-slate-400 uppercase">MOTM</span>
              <span className="mt-1 block text-2xl sm:text-3xl font-extrabold text-yellow-300">
                {stats.motm_awards}
              </span>
              <span className="text-[11px] text-slate-500">Player of Match</span>
            </div>

            {/* Total Points */}
            <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4 text-center">
              <span className="block text-xs font-medium text-slate-400 uppercase">Career Pts</span>
              <span className="mt-1 block text-2xl sm:text-3xl font-extrabold text-purple-400">
                {stats.points}
              </span>
              <span className="text-[11px] text-slate-500">League points</span>
            </div>
          </div>
        </section>

        {/* SECTION: Season-by-Season Journey */}
        {seasons.length > 0 && (
          <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 sm:p-8">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-amber-400" />
              Tournament History by Season
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs sm:text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400">
                    <th className="pb-3 font-semibold">Season</th>
                    <th className="pb-3 font-semibold">Team</th>
                    <th className="pb-3 font-semibold">Cat</th>
                    <th className="pb-3 font-semibold text-center">Matches</th>
                    <th className="pb-3 font-semibold text-center">Goals</th>
                    <th className="pb-3 font-semibold text-center">Wins</th>
                    <th className="pb-3 font-semibold text-center">Points</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {seasons.map((s, idx) => (
                    <tr key={idx} className="hover:bg-slate-850/50 transition-colors">
                      <td className="py-3 font-bold text-amber-400">{s.season_id}</td>
                      <td className="py-3 font-medium text-white">{s.team}</td>
                      <td className="py-3">
                        <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
                          {s.category}
                        </span>
                      </td>
                      <td className="py-3 text-center text-slate-300">{s.matches}</td>
                      <td className="py-3 text-center font-bold text-amber-300">{s.goals}</td>
                      <td className="py-3 text-center text-emerald-400">{s.wins}</td>
                      <td className="py-3 text-center font-bold text-purple-400">{s.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* SECTION: Honors & Awards */}
        {awards.length > 0 && (
          <section className="mt-8 rounded-3xl border border-slate-800 bg-slate-900/80 p-6 sm:p-8">
            <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
              <Award className="h-5 w-5 text-yellow-400" />
              Honors & Accolades ({awards.length})
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {awards.map((award, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3.5 rounded-2xl border border-slate-800 bg-slate-950/60 p-4"
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-400 uppercase">
                        {award.award_type === 'POTD' ? 'Player of the Day' : award.award_type === 'POTW' ? 'Player of the Week' : award.award_type}
                      </span>
                      <span className="text-xs text-slate-500">• {award.season_id}</span>
                    </div>
                    <p className="text-sm font-semibold text-white truncate mt-0.5">
                      {award.team_name || player.team}
                    </p>
                    {award.performance_stats && (
                      <p className="text-xs text-slate-400 mt-1">
                        {award.performance_stats.goals ? `${award.performance_stats.goals} Goals scored` : ''}
                        {award.performance_stats.matchup ? ` • ${award.performance_stats.matchup}` : ''}
                      </p>
                    )}
                    {award.instagram_post_url && (
                      <a
                        href={award.instagram_post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-pink-400 hover:text-pink-300"
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
        <div className="mt-12 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-2xl border border-slate-700 bg-slate-850 px-6 py-3 text-sm font-bold text-white hover:bg-slate-800 hover:border-amber-500/40 transition-all shadow-md"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>Return to SS Premier Super League Home</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
