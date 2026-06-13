'use client';

interface KnockoutMatch {
  id: string;
  round: string;
  home_team: string;
  away_team: string;
  home_score: number | null;
  away_score: number | null;
  status: string;
  result: string | null;
}

interface KnockoutBracketProps {
  knockoutFixtures: Record<string, KnockoutMatch[]>;
}

const ROUND_DISPLAY_ORDER = ['Round of 32', 'Round of 16', 'Quarter-Final', 'Semi-Final', 'Final'];

export default function KnockoutBracket({ knockoutFixtures }: KnockoutBracketProps) {
  if (!knockoutFixtures || Object.keys(knockoutFixtures).length === 0) {
    return (
      <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-8 text-center font-mono shadow-sm">
        <span className="text-4xl mb-3 block">🥇</span>
        <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-2">No Knockout Stage Data</h3>
        <p className="text-xs text-slate-500 uppercase font-semibold">Knockout bracket will appear once set up</p>
      </div>
    );
  }

  // Sort rounds in proper order: left-to-right (from R32 to Final)
  const sortedRounds = Object.keys(knockoutFixtures).sort((a, b) => {
    const indexA = ROUND_DISPLAY_ORDER.indexOf(a);
    const indexB = ROUND_DISPLAY_ORDER.indexOf(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  // Calculate standard container height to align rounds vertically using flex justify-around
  const maxMatches = Math.max(...Object.values(knockoutFixtures).map(matches => matches.length));
  const columnMinHeight = Math.max(500, maxMatches * 120);

  return (
    <div className="space-y-6">
      <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm font-mono relative overflow-hidden">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center">
            <span className="text-xl">🥇</span>
          </div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Knockout Stage</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Single-elimination playoff bracket</p>
          </div>
        </div>

        {/* Bracket Diagram Wrapper */}
        <div className="overflow-x-auto pb-4 scrollbar-thin">
          <div 
            className="flex gap-8 px-2 py-4 select-none justify-start lg:justify-center min-w-max"
          >
            {sortedRounds.map((round) => {
              const matches = knockoutFixtures[round];
              
              return (
                <div 
                  key={round} 
                  className="w-72 flex-shrink-0 flex flex-col"
                >
                  {/* Round Header */}
                  <div className="text-center mb-6">
                    <span className="px-3.5 py-1.5 bg-slate-50 text-slate-700 border border-slate-200/60 rounded-xl text-[10px] font-black uppercase tracking-wider font-mono inline-block shadow-sm">
                      {round}
                    </span>
                  </div>

                  {/* Matches Column - centered via justify-around */}
                  <div 
                    className="flex flex-col justify-around flex-grow relative py-2"
                    style={{ minHeight: `${columnMinHeight}px` }}
                  >
                    {matches.map((match, index) => {
                      const isCompleted = match.status === 'completed';
                      const homeWon = match.result === 'home_win';
                      const awayWon = match.result === 'away_win';
                      const isPending = match.status === 'pending' || match.home_team?.includes('Winner') || match.home_team?.includes('TBD');

                      return (
                        <div 
                          key={match.id}
                          className={`console-card bg-white border-2 rounded-2xl overflow-hidden transition-all duration-200 shadow-sm hover:shadow-md relative my-2 ${
                            isCompleted ? 'border-emerald-500/20' :
                            isPending ? 'border-slate-200/60' :
                            'border-amber-500/25 shadow-amber-500/5'
                          }`}
                        >
                          {/* Match Header */}
                          <div className="bg-slate-50/50 px-3.5 py-1.5 border-b border-slate-100 flex justify-between items-center">
                            <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider">
                              M-{index + 1}
                            </span>
                            <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                              isCompleted ? 'bg-emerald-50 text-emerald-750' :
                              isPending ? 'bg-slate-50 text-slate-500' :
                              'bg-amber-50 text-amber-700 animate-pulse'
                            }`}>
                              {isCompleted ? 'COMPLETED' : isPending ? 'PENDING' : 'SCHEDULED'}
                            </span>
                          </div>

                          {/* Teams */}
                          <div className="p-3.5 space-y-2">
                            {/* Home Team */}
                            <div className={`flex items-center justify-between p-2 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all duration-150 ${
                              homeWon ? 'bg-emerald-50/40 border-emerald-100/30 text-emerald-750 font-black' :
                              isCompleted ? 'bg-slate-50/30 border-slate-200/10 text-slate-400 opacity-60' :
                              'bg-slate-50/50 border-slate-200/20 text-slate-700'
                            }`}>
                              <div className="flex items-center gap-1.5 flex-1 min-w-0 font-mono">
                                {homeWon && <span className="text-xs">🏆</span>}
                                <span className={`truncate ${isPending ? 'text-slate-400 italic font-medium' : 'font-extrabold'}`}>
                                  {match.home_team}
                                </span>
                              </div>
                              {isCompleted && (
                                <span className={`font-black ml-2 text-xs ${homeWon ? 'text-emerald-700' : 'text-slate-400'}`}>
                                  {match.home_score}
                                </span>
                              )}
                            </div>

                            {/* VS separator */}
                            <div className="flex items-center justify-center">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-wider font-mono">VS</span>
                            </div>

                            {/* Away Team */}
                            <div className={`flex items-center justify-between p-2 rounded-xl border text-[10px] font-bold uppercase tracking-wider transition-all duration-150 ${
                              awayWon ? 'bg-emerald-50/40 border-emerald-100/30 text-emerald-750 font-black' :
                              isCompleted ? 'bg-slate-50/30 border-slate-200/10 text-slate-400 opacity-60' :
                              'bg-slate-50/50 border-slate-200/20 text-slate-700'
                            }`}>
                              <div className="flex items-center gap-1.5 flex-1 min-w-0 font-mono">
                                {awayWon && <span className="text-xs">🏆</span>}
                                <span className={`truncate ${isPending ? 'text-slate-400 italic font-medium' : 'font-extrabold'}`}>
                                  {match.away_team}
                                </span>
                              </div>
                              {isCompleted && (
                                <span className={`font-black ml-2 text-xs ${awayWon ? 'text-emerald-700' : 'text-slate-400'}`}>
                                  {match.away_score}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm font-mono relative overflow-hidden">
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <span className="text-lg">ℹ️</span>
          </div>
          <div>
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-2">Knockout Stage Info</h3>
            <ul className="text-[10px] text-slate-500 font-bold uppercase tracking-wider space-y-1.5">
              <li>• Single-elimination format - lose and you're out</li>
              <li>• Winners advance to the next round</li>
              <li>• Matches marked "TBD" will be determined by earlier round results</li>
              <li>• 🏆 indicates the winner of a completed match</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
