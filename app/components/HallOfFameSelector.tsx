'use client';

import { useState } from 'react';
import { Shield, Target, User, Activity, Zap, Play } from 'lucide-react';

interface HallOfFameProps {
  hallOfFame: {
    topScorers: any[];
    topAssisters: any[];
    cleanSheetKings: any[];
    mostAppearances: any[];
    mostPoints: any[];
    bestWinRate: any[];
  };
}

export default function HallOfFameSelector({ hallOfFame }: HallOfFameProps) {
  const [selectedHallCategory, setSelectedHallCategory] = useState('topScorers');

  const categories = [
    { key: 'topScorers', label: 'Top Scorers', icon: Target, pos: 'ST' },
    { key: 'cleanSheetKings', label: 'Clean Sheets', icon: Shield, pos: 'GK' },
    { key: 'mostAppearances', label: 'Most Matches', icon: User, pos: 'MID' },
    { key: 'mostPoints', label: 'Most Points', icon: Zap, pos: 'CAM' },
    { key: 'bestWinRate', label: 'Best Win Rate', icon: Activity, pos: 'MGR' },
  ];

  const currentCategoryObj = categories.find(c => c.key === selectedHallCategory) || categories[0];

  const handlePrevCategory = () => {
    const currentIndex = categories.findIndex(c => c.key === selectedHallCategory);
    const prevIndex = (currentIndex - 1 + categories.length) % categories.length;
    setSelectedHallCategory(categories[prevIndex].key);
  };

  const handleNextCategory = () => {
    const currentIndex = categories.findIndex(c => c.key === selectedHallCategory);
    const nextIndex = (currentIndex + 1) % categories.length;
    setSelectedHallCategory(categories[nextIndex].key);
  };

  return (
    <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm relative" data-scroll="fade-up">
      <div className="mb-6">
        <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">Leaderboard Room</span>
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight mt-0.5">
          SS Super League Hall of Fame
        </h2>
        <p className="text-slate-500 text-xs mt-1">Select a statistics category to inspect FUT player card profiles.</p>
      </div>

      {/* Console-style Sliding Tab Selector */}
      <div className="flex items-center justify-between bg-slate-50 border border-slate-200/80 rounded-2xl p-2.5 mb-8 select-none">
        <button
          onClick={handlePrevCategory}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-[#D4AF37] hover:border-[#D4AF37]/45 active:scale-95 transition-all cursor-pointer font-bold font-mono text-sm shadow-sm"
          aria-label="Previous Category"
        >
          &lt;
        </button>

        <div className="flex-1 text-center overflow-hidden px-4">
          <div className="inline-flex items-center gap-2 py-1 px-4">
            {(() => {
              const IconComponent = currentCategoryObj.icon;
              return (
                <>
                  <IconComponent className="w-4 h-4 text-[#D4AF37]" />
                  <span className="font-mono text-[11px] sm:text-xs font-bold text-slate-800 uppercase tracking-widest">
                    {currentCategoryObj.label}
                  </span>
                </>
              );
            })()}
          </div>
        </div>

        <button
          onClick={handleNextCategory}
          className="w-10 h-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-[#D4AF37] hover:border-[#D4AF37]/45 active:scale-95 transition-all cursor-pointer font-bold font-mono text-sm shadow-sm"
          aria-label="Next Category"
        >
          &gt;
        </button>
      </div>

      {/* FUT Player Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-6 justify-items-center">
        {hallOfFame[selectedHallCategory as keyof typeof hallOfFame]?.slice(0, 5).map((player: any, index: number) => {
          const isGold = index === 0;
          const isSilver = index === 1;
          const isBronze = index === 2;

          // Generate overall rating (OVR) based on rankings (e.g. 92, 88, 85, etc.)
          const ovr = isGold ? 92 : isSilver ? 88 : isBronze ? 85 : 82;

          return (
            <div
              key={player.player_id}
              className={`fut-card flex flex-col justify-between p-4 ${
                isGold ? 'fut-card-gold' :
                isSilver ? 'fut-card-silver' :
                isBronze ? 'fut-card-bronze' : ''
              }`}
            >
              {/* Card Header (OVR) */}
              <div className="flex flex-col items-center absolute top-4 left-4 font-mono select-none">
                <div className="text-2xl font-black text-slate-950 leading-none">
                  {ovr}
                </div>
              </div>

              {/* Decorative shield lines in background */}
              <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-16 bg-gradient-to-r from-transparent via-[#D4AF37]/5 to-transparent pointer-events-none rotate-12"></div>

              {/* Center space - Player Avatar Placeholder */}
              <div className="flex justify-center items-center h-28 mt-6 relative z-10">
                <div className={`w-20 h-20 rounded-full flex items-center justify-center border-2 shadow-inner bg-white overflow-hidden ${
                  isGold ? 'border-amber-400' :
                  isSilver ? 'border-slate-300' :
                  isBronze ? 'border-amber-700' : 'border-slate-200'
                }`}>
                  {player.photo_url ? (
                    <img src={player.photo_url} alt={player.player_name} className="w-full h-full object-cover" />
                  ) : (
                    <User className={`w-10 h-10 ${
                      isGold ? 'text-amber-600' :
                      isSilver ? 'text-slate-500' :
                      isBronze ? 'text-amber-800' : 'text-slate-300'
                    }`} />
                  )}
                </div>
              </div>

              {/* Player Name */}
              <div className="text-center mt-3 relative z-10">
                <h3 className="font-bold text-sm text-slate-900 truncate px-1 uppercase tracking-tight">
                  {player.player_name}
                </h3>
              </div>

              {/* Stats Block */}
              <div className="mt-4 pt-3 border-t border-slate-200/40 relative z-10 flex flex-col gap-1 text-[11px] font-mono font-semibold">
                <div className="flex justify-between text-slate-500">
                  <span>RECORD</span>
                  <span className="text-slate-950 font-black">
                    {selectedHallCategory === 'topScorers' && `${player.total_goals} Goals`}
                    {selectedHallCategory === 'cleanSheetKings' && `${player.total_clean_sheets} Sheets`}
                    {selectedHallCategory === 'mostAppearances' && `${player.total_matches} Matches`}
                    {selectedHallCategory === 'mostPoints' && `${parseFloat(player.total_points).toFixed(0)} Pts`}
                    {selectedHallCategory === 'bestWinRate' && `${player.win_rate}% Win`}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400 text-[10px]">
                  <span>SEASONS</span>
                  <span>{player.seasons_played} Played</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
