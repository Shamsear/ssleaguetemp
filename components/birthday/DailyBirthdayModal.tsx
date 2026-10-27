'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Cake, Sparkles, X, Trophy, Flame, ArrowRight, Heart } from 'lucide-react';
import ConfettiEffect from './ConfettiEffect';

export interface BirthdayPlayer {
  id: string;
  player_id: string;
  name: string;
  display_name: string;
  dob: string;
  age: number;
  photo_url: string;
  team: string;
  category: string;
  stats?: {
    matches: number;
    goals: number;
    wins: number;
    clean_sheets: number;
  };
}

export default function DailyBirthdayModal() {
  const [players, setPlayers] = useState<BirthdayPlayer[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [todayDate, setTodayDate] = useState<string>('');

  useEffect(() => {
    // Determine today's local date in YYYY-MM-DD
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-CA');
    setTodayDate(dateStr);

    // Check localStorage if already shown once today
    const storageKey = `ssleague_bday_seen_${dateStr}`;
    const alreadySeen = localStorage.getItem(storageKey);

    // Fetch today's birthdays
    fetch(`/api/birthdays/today?date=${dateStr}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.players && data.players.length > 0) {
          setPlayers(data.players);

          // If not seen today, pop up modal automatically after gentle delay
          if (!alreadySeen) {
            const timer = setTimeout(() => {
              setIsOpen(true);
              setShowConfetti(true);
              // Save that it was shown for today
              localStorage.setItem(storageKey, 'true');
            }, 800);
            return () => clearTimeout(timer);
          }
        }
      })
      .catch((err) => {
        console.warn('Failed to check today birthdays:', err);
      });
  }, []);

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleReopen = () => {
    setIsOpen(true);
    setShowConfetti(true);
  };

  if (players.length === 0) return null;

  return (
    <>
      {/* Floating Re-Open Badge on Home Page if dismissed */}
      {!isOpen && (
        <aside
          aria-label="Birthday celebration notification"
          className="fixed bottom-20 right-4 z-40 sm:bottom-6 sm:right-6 animate-bounce"
        >
          <button
            onClick={handleReopen}
            className="flex items-center gap-2.5 rounded-full bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 px-4 py-2.5 text-xs sm:text-sm font-bold text-white shadow-xl shadow-amber-500/30 ring-2 ring-amber-300/40 hover:scale-105 transition-transform"
          >
            <Cake className="h-4 w-4 text-amber-100 animate-spin" style={{ animationDuration: '6s' }} />
            <span>
              {players.length === 1
                ? `🎂 ${players[0].name}'s Birthday!`
                : `🎂 ${players.length} Birthdays Today!`}
            </span>
            <Sparkles className="h-3.5 w-3.5 text-yellow-200" />
          </button>
        </aside>
      )}

      {/* Confetti Animation */}
      {isOpen && showConfetti && <ConfettiEffect duration={6000} />}

      {/* Daily Birthday Modal */}
      {isOpen && (
        <div 
          role="dialog"
          aria-modal="true"
          aria-labelledby="birthday-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
        >
          <div className="relative w-full max-w-xl overflow-hidden rounded-3xl border border-amber-500/40 bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 p-6 sm:p-8 shadow-2xl shadow-amber-500/20 text-white">
            {/* Background Festive Glow Effects */}
            <div className="pointer-events-none absolute -top-24 -left-24 h-56 w-56 rounded-full bg-amber-500/20 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 -right-24 h-56 w-56 rounded-full bg-orange-500/20 blur-3xl" />

            {/* Close Button */}
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 z-10 rounded-full p-2 text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
              aria-label="Close Birthday Modal"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Modal Header */}
            <div className="text-center mb-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-4 py-1.5 text-xs font-semibold tracking-wide text-amber-400 uppercase">
                <Cake className="h-3.5 w-3.5" />
                SS League Birthday Celebration
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <h2 id="birthday-modal-title" className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight bg-gradient-to-r from-amber-200 via-yellow-300 to-amber-500 bg-clip-text text-transparent">
                {players.length === 1
                  ? `Happy Birthday, ${players[0].name}! 🎂`
                  : `Celebrating Today's Birthday Stars! 🎂`}
              </h2>
              <p className="mt-1 text-xs sm:text-sm text-slate-300">
                Join the entire SS League community in wishing them glory, victories, and happiness!
              </p>
            </div>

            {/* Players Grid / List */}
            <div className={`grid gap-4 ${players.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
              {players.map((player) => (
                <div
                  key={player.id}
                  className="group relative flex flex-col items-center rounded-2xl border border-slate-800 bg-slate-900/60 p-4 sm:p-5 text-center transition-all hover:border-amber-500/50 hover:bg-slate-850 hover:shadow-lg hover:shadow-amber-500/10"
                >
                  {/* Photo Avatar with Crown / Golden Border */}
                  <div className="relative mb-3">
                    <div className="h-24 w-24 sm:h-28 sm:w-28 overflow-hidden rounded-full border-3 border-amber-400 p-1 shadow-lg shadow-amber-500/20 bg-gradient-to-tr from-amber-600 via-yellow-400 to-amber-200">
                      <div className="relative h-full w-full overflow-hidden rounded-full bg-slate-800">
                        <Image
                          src={player.photo_url || '/placeholder-player.png'}
                          alt={player.name}
                          fill
                          sizes="(max-width: 640px) 96px, 112px"
                          className="object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                      </div>
                    </div>
                    {/* Birthday Badge */}
                    <span className="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 font-black shadow-md border-2 border-slate-900 text-xs">
                      {player.age || '🎉'}
                    </span>
                  </div>

                  {/* Player Name & Team */}
                  <h3 className="text-lg font-bold text-white group-hover:text-amber-300 transition-colors">
                    {player.name}
                  </h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs font-semibold text-amber-400 bg-amber-400/10 px-2.5 py-0.5 rounded-full border border-amber-400/20">
                      {player.team}
                    </span>
                    <span className="text-xs text-slate-400">
                      Turning {player.age} today
                    </span>
                  </div>

                  {/* Career Stats Mini Pills */}
                  {player.stats && player.stats.matches > 0 && (
                    <div className="flex items-center justify-center gap-3 mt-3 text-xs text-slate-300">
                      <span className="flex items-center gap-1 font-medium">
                        <Flame className="h-3.5 w-3.5 text-orange-400" />
                        {player.stats.goals} Goals
                      </span>
                      <span className="text-slate-600">•</span>
                      <span className="flex items-center gap-1 font-medium">
                        <Trophy className="h-3.5 w-3.5 text-amber-400" />
                        {player.stats.matches} Matches
                      </span>
                    </div>
                  )}

                  {/* View Congratulatory Page / Link */}
                  <Link
                    href={`/birthdays/${player.id}`}
                    onClick={handleClose}
                    className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2.5 text-xs sm:text-sm font-bold text-slate-950 shadow-md hover:from-amber-400 hover:to-amber-500 hover:shadow-amber-500/25 transition-all"
                  >
                    <span>Congratulate & Read Story</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </div>
              ))}
            </div>

            {/* Footer Dismiss */}
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-800/80 pt-4">
              <span className="text-[11px] text-slate-500">
                Shown once a day • Send your wishes to our champions
              </span>
              <button
                onClick={handleClose}
                className="text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                Close & Continue to League
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Reusable Home Page Hero / Inline Banner for Today's Birthdays
 */
export function TodayBirthdaysBanner() {
  const [players, setPlayers] = useState<BirthdayPlayer[]>([]);

  useEffect(() => {
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-CA');
    fetch(`/api/birthdays/today?date=${dateStr}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.players) {
          setPlayers(data.players);
        }
      })
      .catch(() => {});
  }, []);

  if (players.length === 0) return null;

  return (
    <div className="w-full my-4 rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/40 via-slate-900 to-amber-950/30 p-4 sm:p-5 shadow-lg shadow-amber-500/10">
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 text-slate-950 shadow-md">
            <Cake className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-400 uppercase tracking-wider">
              <Sparkles className="h-3 w-3" />
              Birthday Spotlight Today!
            </div>
            <p className="text-sm sm:text-base font-bold text-white mt-0.5">
              {players.map((p) => `${p.name} (${p.age})`).join(' & ')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {players.map((p) => (
            <Link
              key={p.id}
              href={`/birthdays/${p.id}`}
              className="flex items-center gap-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 px-3.5 py-2 text-xs sm:text-sm font-bold text-amber-300 hover:text-white transition-all shadow-sm"
            >
              <span>Wish {p.name} 🎂</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
