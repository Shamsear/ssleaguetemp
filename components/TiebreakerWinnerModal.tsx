'use client';

import { useRouter } from 'next/navigation';

interface WinnerPageProps {
  playerName: string;
  position: string;
  winnerTeamName: string;
  finalBid: number;
  isCurrentTeamWinner: boolean;
}

export default function TiebreakerWinnerPage({
  playerName,
  position,
  winnerTeamName,
  finalBid,
  isCurrentTeamWinner,
}: WinnerPageProps) {
  const router = useRouter();

  return (
    <div className="console-bg min-h-screen flex items-center justify-center py-12 px-4 relative">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
      
      <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-8 md:p-12 max-w-2xl w-full shadow-sm relative z-10 font-mono text-xs">
        {/* Icon */}
        <div className="flex justify-center mb-6">
          {isCurrentTeamWinner ? (
            <div className="p-4 rounded-full bg-emerald-500 text-white">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          ) : (
            <div className="p-4 rounded-full bg-slate-500 text-white">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Title */}
        <h2 className="text-xl sm:text-2xl font-black text-center mb-2 uppercase tracking-wide text-slate-800">
          {isCurrentTeamWinner ? '🎉 Congratulations!' : 'Tiebreaker Completed'}
        </h2>

        {/* Winner Info */}
        <div className="mb-6">
          <p className="text-xs text-slate-500 uppercase font-bold text-center mb-4">
            {isCurrentTeamWinner
              ? `You won ${playerName}!`
              : `${winnerTeamName} won ${playerName}`}
          </p>

          {/* Player Details Card */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mb-4 space-y-3 uppercase">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400">Player</span>
              <span className="text-xs font-black text-slate-800">{playerName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400">Position</span>
              <span className="px-2.5 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700 text-[10px] font-black">
                {position}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400">Winner</span>
              <span className="text-xs font-black text-emerald-600">{winnerTeamName}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold text-slate-400">Final Bid</span>
              <span className="text-base font-black text-amber-600">£{finalBid.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={() => router.push('/dashboard/team')}
          className="w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-all duration-200"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  );
}
