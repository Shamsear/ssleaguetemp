'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, ArrowRight, Sparkles, Calendar, Trophy, Target } from 'lucide-react';
import ConfettiEffect from './ConfettiEffect';

export interface BirthdayPlayer {
  id: string;
  player_id: string;
  name: string;
  display_name: string;
  dob: string;
  age: number;
  photo_url: string;
  team?: string | null;
  category?: string | null;
  stats?: {
    matches: number;
    goals: number;
    wins: number;
    clean_sheets: number;
  };
}

export default function DailyBirthdayModal() {
  const pathname = usePathname();
  const [players, setPlayers] = useState<BirthdayPlayer[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Don't show modal on auth/registration paths
    if (pathname?.startsWith('/register') || pathname?.startsWith('/login')) {
      return;
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-CA');
    const storageKey = `ssleague_bday_seen_${dateStr}`;
    const alreadySeen = localStorage.getItem(storageKey);

    fetch(`/api/birthdays/today?date=${dateStr}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.players && data.players.length > 0) {
          setPlayers(data.players);

          // Show once per day on first visit
          if (!alreadySeen) {
            const timer = setTimeout(() => {
              setIsOpen(true);
              setShowConfetti(true);
              localStorage.setItem(storageKey, 'true');
            }, 600);
            return () => clearTimeout(timer);
          }
        }
      })
      .catch(() => {});
  }, [pathname]);

  const handleClose = () => {
    setIsOpen(false);
  };

  const handleReopen = () => {
    setIsOpen(true);
    setShowConfetti(true);
  };

  if (!mounted || players.length === 0 || pathname?.startsWith('/register') || pathname?.startsWith('/login')) return null;

  const modalContent = isOpen ? (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="birthday-modal-title"
      className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-5 bg-slate-950/60 backdrop-blur-sm overflow-y-auto animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-xl max-h-[90vh] my-auto overflow-y-auto rounded-2xl border border-slate-200/90 bg-white shadow-2xl p-5 sm:p-7 text-slate-900 flex flex-col">
        {/* Subtle Console Gold Top Border Line */}
        <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-transparent via-[#D4AF37] to-transparent" />

        {/* Close Button */}
        <button
          onClick={handleClose}
          className="absolute top-3.5 right-3.5 rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
          aria-label="Close Birthday Modal"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Modal Header */}
        <div className="text-center pt-1 pb-4">
          <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-800 text-[10px] font-mono font-bold uppercase tracking-wider mb-2">
            <Sparkles className="h-3 w-3 text-[#D4AF37]" />
            SS SUPER LEAGUE // BIRTHDAY SPOTLIGHT
          </div>
          <h2
            id="birthday-modal-title"
            className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight uppercase"
          >
            {players.length === 1
              ? `Happy Birthday, ${players[0].name}!`
              : `Today's Birthday Stars`}
          </h2>
          <p className="mt-1 text-xs text-slate-500 font-mono">
            Wishing our tournament gladiators glory, clean sheets & victories!
          </p>
        </div>

        {/* Players Grid / Cards */}
        <div
          className={`grid gap-3.5 py-1 ${
            players.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
          }`}
        >
          {players.map((player) => (
            <div
              key={player.id}
              className="flex flex-col items-center justify-between rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-center transition-all hover:border-amber-400/60 hover:bg-white hover:shadow-md"
            >
              {/* Photo Avatar with Ring */}
              <div className="relative mb-2.5">
                <div className="h-20 w-20 sm:h-24 sm:w-24 overflow-hidden rounded-full ring-2 ring-[#D4AF37]/50 p-0.5 bg-white shadow-sm">
                  <div className="relative h-full w-full overflow-hidden rounded-full bg-slate-100">
                    <Image
                      src={player.photo_url || '/placeholder-player.png'}
                      alt={player.name}
                      fill
                      sizes="(max-width: 640px) 80px, 96px"
                      className="object-cover"
                    />
                  </div>
                </div>
                {/* Age Badge */}
                <span className="absolute -bottom-1 -right-1 flex h-6 px-1.5 items-center justify-center rounded-full bg-slate-950 text-[#D4AF37] font-mono text-[10px] font-bold border-2 border-white shadow-sm">
                  {player.age ? `${player.age}Y` : 'STAR'}
                </span>
              </div>

              {/* Player Name & Team */}
              <h3 className="text-sm sm:text-base font-black text-slate-900 tracking-tight uppercase">
                {player.name}
              </h3>

              <div className="flex flex-wrap items-center justify-center gap-1.5 mt-1">
                {player.team && player.team !== 'FREE AGENT' && player.team.toLowerCase() !== 'unknown' && (
                  <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-700">
                    {player.team}
                  </span>
                )}
                <span className="text-[10px] font-mono font-bold text-amber-700 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                  TURNING {player.age}
                </span>
              </div>

              {/* Stats line */}
              {player.stats && player.stats.matches > 0 && (
                <div className="flex items-center justify-center gap-2 mt-2.5 text-[11px] font-mono text-slate-600">
                  <span className="flex items-center gap-1 font-bold text-slate-800">
                    <Target className="h-3 w-3 text-amber-600" />
                    {player.stats.goals} Goals
                  </span>
                  <span className="text-slate-300">•</span>
                  <span className="flex items-center gap-1 font-bold text-slate-800">
                    <Trophy className="h-3 w-3 text-[#D4AF37]" />
                    {player.stats.matches} Matches
                  </span>
                </div>
              )}

              {/* Action Button */}
              <Link
                href={`/birthdays/${player.id}`}
                onClick={handleClose}
                className="mt-3.5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 hover:bg-slate-900 text-white px-4 py-2 text-xs font-mono font-bold transition-all shadow-sm group"
              >
                <span>Read Story & Stats</span>
                <ArrowRight className="h-3.5 w-3.5 text-[#D4AF37] group-hover:translate-x-0.5 transition-transform" />
              </Link>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-[10px] font-mono text-slate-400">
          <span>SHOWN ONCE DAILY // SS LEAGUE</span>
          <button
            onClick={handleClose}
            className="text-slate-500 hover:text-slate-900 font-bold transition-colors"
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      {/* Confetti Effect */}
      {isOpen && showConfetti && <ConfettiEffect duration={4000} />}

      {/* Portal Modal rendering directly to document.body for z-[9999] stacking */}
      {typeof document !== 'undefined' && createPortal(modalContent, document.body)}

      {/* Subtle Floating Badge in Corner if user closed modal */}
      {!isOpen && (
        <aside
          aria-label="Birthday celebration notification"
          className="fixed bottom-20 right-4 z-40 sm:bottom-6 sm:right-6"
        >
          <button
            onClick={handleReopen}
            className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200/80 px-3.5 py-2 text-xs font-mono font-bold text-slate-900 shadow-md hover:border-amber-400 hover:shadow-lg transition-all"
          >
            <span className="w-2 h-2 rounded-full bg-[#D4AF37] animate-ping" />
            <span>
              {players.length === 1
                ? `${players[0].name}'s Birthday (${players[0].age})`
                : `${players.length} Birthdays Today`}
            </span>
            <ArrowRight className="h-3 w-3 text-[#D4AF37]" />
          </button>
        </aside>
      )}
    </>
  );
}

/**
 * Reusable Home Page Inline Banner matching Hero Section Console styling
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
    <div className="w-full my-4 rounded-2xl border border-slate-200/60 bg-white p-4 sm:p-5 shadow-sm relative overflow-hidden">
      {/* Decorative chevron lines */}
      <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-[repeating-linear-gradient(90deg,rgba(0,0,0,0.06)_0px,rgba(0,0,0,0.06)_1px,transparent_1px,transparent_12px)] opacity-50" />

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500/10 border border-amber-500/20 text-[#D4AF37]">
            <Sparkles className="h-5 w-5" />
          </div>
          <div>
            <div className="inline-flex items-center gap-1.5 text-[10px] font-mono font-bold uppercase tracking-wider text-amber-800">
              LEAGUE BIRTHDAY SPOTLIGHT
            </div>
            <p className="text-sm sm:text-base font-black text-slate-900 uppercase tracking-tight">
              {players.map((p) => `${p.name} (Turning ${p.age})`).join(' • ')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {players.map((p) => (
            <Link
              key={p.id}
              href={`/birthdays/${p.id}`}
              className="inline-flex flex-1 sm:flex-initial items-center justify-center gap-2 rounded-xl bg-slate-950 hover:bg-slate-900 text-white px-4 py-2 text-xs font-mono font-bold shadow-sm transition-all border border-slate-950"
            >
              <span>Congratulate {p.name}</span>
              <ArrowRight className="h-3.5 w-3.5 text-[#D4AF37]" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
