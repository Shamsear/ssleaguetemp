'use client';

import { useAuth } from '@/contexts/AuthContext';
import Link from 'next/link';
import { ArrowRight, CircleDot, Swords } from 'lucide-react';

export default function HeroSection() {
  const { user, loading } = useAuth();

  const getDashboardUrl = (userRole: string) => {
    switch (userRole) {
      case 'super_admin': return '/dashboard/superadmin';
      case 'committee_admin': return '/dashboard/committee';
      case 'team': return '/dashboard/team';
      default: return '/dashboard';
    }
  };

  if (loading) {
    return (
      <div className="bg-white border border-slate-200/60 p-8 rounded-2xl shadow-sm text-center relative overflow-hidden">
        <div className="max-w-2xl mx-auto py-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-700 text-[10px] font-mono font-bold uppercase tracking-wider mb-4">
            <CircleDot className="w-3 h-3 animate-pulse" /> Launching League Portal...
          </div>
          <h1 className="text-3xl sm:text-5xl font-black text-slate-900 tracking-tight leading-none uppercase">
            SS Super League
          </h1>
          <p className="text-sm text-slate-500 font-mono mt-4">Connecting to matchmaking...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200/60 p-8 sm:p-10 rounded-2xl shadow-sm relative overflow-hidden">
      
      {/* Decorative Console Elements */}
      <div className="absolute top-0 right-0 p-4 font-mono text-[9px] text-slate-300 pointer-events-none select-none hidden sm:block">
        LEAGUE_ID: [SS_SUPER_LEAGUE_17]
      </div>

      <div className="max-w-3xl mx-auto text-center relative z-10 py-4">
        {/* Gaming active status tag */}
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/5 border border-amber-500/20 text-amber-800 text-[10px] font-mono font-bold uppercase tracking-wider mb-6">
          <Swords className="w-3.5 h-3.5 text-[#D4AF37] animate-pulse" /> SS SUPER LEAGUE ONLINE // SEASON 17
        </div>

        {/* Hero title */}
        <h1 className="text-4xl sm:text-6xl font-black text-slate-950 tracking-tight leading-none uppercase select-none">
          SOUTH SOCCERS <span className="gradient-text">SUPER LEAGUE</span>
        </h1>

        {/* Description */}
        <p className="text-slate-600 text-sm sm:text-base font-mono max-w-2xl mx-auto mt-6 leading-relaxed">
          Auction. Franchise. Standings. Compete in live eFootball tournaments, manage your WhatsApp community squad, and climb the Super League rankings.
        </p>

        {/* Dashboard CTAs */}
        <div className="mt-8 flex justify-center items-center gap-4">
          {user ? (
            <Link
              href={getDashboardUrl(user.role)}
              className="inline-flex items-center gap-2 bg-slate-950 hover:bg-slate-900 text-white px-6 py-3 rounded-xl text-xs font-mono font-bold shadow-md hover:shadow-lg transition-all hover:scale-105 border border-slate-950"
            >
              Enter Match Dashboard
              <ArrowRight className="w-4 h-4 text-[#D4AF37]" />
            </Link>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-2 bg-slate-950 hover:bg-slate-900 text-white px-8 py-3 rounded-xl text-xs font-mono font-bold shadow-md hover:shadow-lg transition-all hover:scale-105 border border-slate-950"
            >
              Sign In to Account
              <ArrowRight className="w-4 h-4 text-[#D4AF37]" />
            </Link>
          )}
        </div>
      </div>
      
      {/* Decorative chevron lines */}
      <div className="absolute bottom-0 left-0 right-0 h-[4px] bg-[repeating-linear-gradient(90deg,rgba(0,0,0,0.06)_0px,rgba(0,0,0,0.06)_1px,transparent_1px,transparent_12px)] opacity-50"></div>
    </div>
  );
}
