'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import InstagramEmbed from '@/components/InstagramEmbed';
import { Activity, Award as AwardIcon, Calendar, ChevronDown, Crown, Flame, Gem, Medal, Shield, Sparkles, Star, Trophy, Trophy as TrophyIcon, Zap } from 'lucide-react';

interface Award {
  id: string;
  award_type: string;
  player_name?: string;
  team_name?: string;
  round_number?: number;
  week_number?: number;
  performance_stats?: any;
  selected_at?: string;
  season_id?: string;
  instagram_link?: string;
  instagram_post_url?: string;
  notes?: string;
}

interface PlayerAward {
  id: string;
  award_type: string;
  player_name: string;
  team_name?: string;
  award_position?: string;
  award_category?: string;
  player_category?: string;
  season_id?: string;
  instagram_link?: string;
  instagram_post_url?: string;
}

interface TrophyData {
  id: string;
  trophy_name: string;
  team_name: string;
  trophy_type: string;
  trophy_position?: string;
  position?: number;
  season_id?: string;
  instagram_link?: string;
  instagram_post_url?: string;
  awarded_at?: string;
}

function SeasonAwardCardInner({ award, cardClass, positionClass, positionLabel }: { award: PlayerAward; cardClass: string; positionClass: string; positionLabel: string }) {
  return (
    <>
      <div className="flex justify-between items-start">
        <div className="min-w-0">
          <span className="text-[8px] font-bold text-slate-400 tracking-wider block uppercase">Honour</span>
          <h4 className="font-black text-slate-800 text-[10px] leading-tight truncate mt-0.5" title={award.award_type}>
            {award.award_type}
          </h4>
        </div>
        <AwardIcon className="w-3.5 h-3.5 text-amber-500 fill-amber-500/10 flex-shrink-0" />
      </div>
      
      <div className="text-center py-2 flex flex-col items-center min-w-0">
        <AwardIcon className={`w-10 h-10 mb-2 ${
          cardClass.includes('gold') ? 'text-amber-550' :
          cardClass.includes('silver') ? 'text-slate-450' :
          cardClass.includes('bronze') ? 'text-amber-800' : 'text-slate-355'
        }`} />
        <h3 className="font-black text-slate-800 text-[11px] tracking-tight truncate max-w-full">
          {award.player_name}
        </h3>
        {award.team_name && (
          <span className="text-[9px] font-bold text-slate-500 uppercase mt-0.5 truncate max-w-full">
            {award.team_name}
          </span>
        )}
        {award.player_category && (
          <span className="text-[8px] font-extrabold text-slate-400 uppercase mt-0.5 bg-slate-100/60 px-1.5 py-0.5 rounded">
            {award.player_category}
          </span>
        )}
      </div>

      <div className="border-t border-slate-200/50 pt-2 flex justify-between items-center text-[8px] font-mono">
        <span className="text-slate-400 font-bold uppercase">PLACING:</span>
        <span className={positionClass}>
          {positionLabel.toUpperCase()}
        </span>
      </div>
    </>
  );
}

function WeeklyAwardCardInner({ award, positionLabel, positionClass, renderStats }: { award: Award; positionLabel: string; positionClass: string; renderStats: (stats: any) => React.ReactNode }) {
  return (
    <>
      <div className="flex justify-between items-start">
        <div className="min-w-0">
          <span className="text-[8px] font-bold text-slate-400 tracking-wider block uppercase">Honour</span>
          <h4 className="font-black text-slate-800 text-[10px] leading-tight truncate mt-0.5" title={award.award_type}>
            {award.award_type}
          </h4>
        </div>
        <AwardIcon className="w-3.5 h-3.5 text-amber-500 fill-amber-500/10 flex-shrink-0" />
      </div>
      
      <div className="text-center py-2 flex flex-col items-center min-w-0 w-full">
        <AwardIcon className="w-10 h-10 mb-2 text-amber-550" />
        <h3 className="font-black text-slate-800 text-[11px] tracking-tight truncate max-w-full">
          {award.player_name || award.team_name}
        </h3>
        {award.team_name && award.player_name && (
          <span className="text-[9px] font-bold text-slate-500 uppercase mt-0.5 truncate max-w-full">
            {award.team_name}
          </span>
        )}
        
        {/* FIFA Card Attributes */}
        {renderStats(award.performance_stats)}
      </div>

      <div className="border-t border-slate-200/50 pt-2 flex justify-between items-center text-[8px] font-mono">
        <span className="text-slate-400 font-bold uppercase">MATCHDAY:</span>
        <span className={positionClass}>
          {positionLabel}
        </span>
      </div>
    </>
  );
}

function TrophyCardInner({ trophy, cardClass, positionClass, positionLabel }: { trophy: TrophyData; cardClass: string; positionClass: string; positionLabel: string }) {
  return (
    <>
      <div className="flex justify-between items-start">
        <div className="min-w-0">
          <span className="text-[8px] font-bold text-slate-400 tracking-wider block uppercase">Cabinet</span>
          <h4 className="font-black text-slate-800 text-[10px] leading-tight truncate mt-0.5" title={trophy.trophy_name}>
            {trophy.trophy_name}
          </h4>
        </div>
        <TrophyIcon className="w-3.5 h-3.5 text-amber-500 fill-amber-550/10 flex-shrink-0" />
      </div>
      
      <div className="text-center py-2 flex flex-col items-center min-w-0">
        <TrophyIcon className={`w-10 h-10 mb-2 ${
          cardClass.includes('gold') ? 'text-amber-550' :
          cardClass.includes('silver') ? 'text-slate-450' :
          cardClass.includes('bronze') ? 'text-amber-800' : 'text-slate-355'
        }`} />
        <h3 className="font-black text-slate-800 text-[11px] tracking-tight truncate max-w-full">
          {trophy.team_name}
        </h3>
        {trophy.trophy_type && (
          <span className="text-[8px] font-extrabold text-slate-400 uppercase mt-0.5 bg-slate-100/60 px-1.5 py-0.5 rounded">
            {trophy.trophy_type.replace('_', ' ')}
          </span>
        )}
      </div>

      <div className="border-t border-slate-200/50 pt-2 flex justify-between items-center text-[8px] font-mono">
        <span className="text-slate-400 font-bold uppercase">POSITION:</span>
        <span className={positionClass}>
          {positionLabel.toUpperCase()}
        </span>
      </div>
    </>
  );
}

export default function SeasonAwardsPage() {
  const params = useParams();
  const seasonId = params.seasonId as string;

  const [awards, setAwards] = useState<Award[]>([]);
  const [playerAwards, setPlayerAwards] = useState<PlayerAward[]>([]);
  const [trophies, setTrophies] = useState<TrophyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'awards' | 'trophies'>('awards');
  const [awardsSubTab, setAwardsSubTab] = useState<'season' | 'weekly'>('season');
  const [expandedRounds, setExpandedRounds] = useState<Set<string>>(new Set());

  const toggleRound = (roundKey: string) => {
    setExpandedRounds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(roundKey)) {
        newSet.delete(roundKey);
      } else {
        newSet.add(roundKey);
      }
      return newSet;
    });
  };

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const [awardsRes, playerAwardsRes, trophiesRes] = await Promise.all([
          fetch(`/api/awards?season_id=${seasonId}`),
          fetch(`/api/player-awards?season_id=${seasonId}`),
          fetch(`/api/trophies?season_id=${seasonId}`)
        ]);

        const [awardsData, playerAwardsData, trophiesData] = await Promise.all([
          awardsRes.json(),
          playerAwardsRes.json(),
          trophiesRes.json()
        ]);

        if (awardsData.success) setAwards(awardsData.data || []);
        if (playerAwardsData.success) setPlayerAwards(playerAwardsData.awards || []);
        if (trophiesData.success) setTrophies(trophiesData.trophies || []);
      } catch (error) {
        console.error('Error fetching season awards:', error);
      } finally {
        setLoading(false);
      }
    };

    if (seasonId) {
      fetchData();
    }
  }, [seasonId]);

  const cleanedPlayerAwards = Array.isArray(playerAwards) ? playerAwards.filter(award => {
    const type = award.award_type?.trim();
    if (!award.player_name && !award.team_name) return false;
    if (!type || type === 'Category') return false;

    const excludedTypes = ['POTD', 'TOD', 'POTW', 'TOTW', 'MOTM', 'Man of the Match', 'Player of the Day', 'Team of the Day'];
    if (excludedTypes.some(t => {
      const upperType = type.toUpperCase();
      return upperType === t || upperType.includes('PLAYER OF THE DAY');
    })) return false;

    return true;
  }) : [];

  const getAwardIcon = (awardType: string) => {
    const type = awardType?.toLowerCase() || '';
    if (type.includes('potd') || type.includes('player of the day')) return <Star className="w-5 h-5 text-amber-450 fill-amber-450 inline" />;
    if (type.includes('potw') || type.includes('player of the week')) return <Sparkles className="w-5 h-5 text-amber-450 fill-amber-450 inline" />;
    if (type.includes('tod') || type.includes('team of the day')) return <Medal className="w-5 h-5 text-amber-500 inline" />;
    if (type.includes('tow') || type.includes('team of the week')) return <Trophy className="w-5 h-5 text-amber-500 fill-amber-500 inline" />;
    if (type.includes('pots') || type.includes('player of the season')) return <Crown className="w-5 h-5 text-amber-550 fill-amber-550 inline" />;
    if (type.includes('tots') || type.includes('team of the season')) return <Trophy className="w-5 h-5 text-amber-500 fill-amber-500 inline" />;
    if (type.includes('motm') || type.includes('man of the match')) return <Gem className="w-5 h-5 text-blue-500 inline" />;
    return <Medal className="w-5 h-5 text-amber-500 inline" />;
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'N/A';
    }
  };

  const renderStats = (rawStats: any) => {
    if (!rawStats) return null;
    let stats;
    try {
      stats = typeof rawStats === 'string' ? JSON.parse(rawStats) : rawStats;
    } catch (e) { return null; }
    if (!stats || typeof stats !== 'object') return null;

    const allowedStats = [
      'wins', 'draws', 'losses', 'goals_for', 'goals',
      'goals_against', 'goal_difference', 'clean_sheet',
      'motm', 'assists', 'matchup', 'avg_goals', 'total_goals'
    ];

    const entries = Object.entries(stats).filter(([originalKey, value]) => {
      const key = originalKey.toLowerCase();
      if (!allowedStats.includes(key)) return false;
      if (value === null || value === '' || value === undefined) return false;
      if (key === 'clean_sheet' || key === 'matchup') return false;
      if (key.includes('played') && !key.includes('matches')) return false;
      return true;
    });

    const hasCleanSheet = stats.clean_sheet === true || stats.clean_sheet === 'true' || stats.clean_sheets > 0;
    const hasMatchup = !!stats.matchup;

    if (entries.length === 0 && !hasCleanSheet && !hasMatchup) return null;

    return (
      <div className="flex flex-wrap gap-1 justify-center max-w-full mt-1.5 font-mono">
        {hasMatchup && (
          <div className="text-[8px] font-bold text-slate-700 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded text-center w-full truncate mb-0.5">
            <Activity className="w-4 h-4 text-rose-500 inline mr-1 align-text-bottom" /> {stats.matchup}
          </div>
        )}

        {hasCleanSheet && (
          <div className="inline-flex items-center px-1.5 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded text-[7px] font-bold uppercase">
            <Shield className="w-4 h-4 text-blue-500 inline mr-1 align-text-bottom" /> CS
          </div>
        )}

        {entries.map(([originalKey, value]: [string, any]) => {
          const key = originalKey.toLowerCase();
          let label = key.replace(/_/g, ' ');
          let colorClass = 'bg-white text-slate-700 border-slate-200';

          if (key === 'wins') { label = 'W'; colorClass = 'bg-emerald-50 text-emerald-850 border-emerald-200/50'; }
          else if (key === 'losses') { label = 'L'; colorClass = 'bg-rose-50 text-rose-850 border-rose-200/50'; }
          else if (key === 'draws') { label = 'D'; colorClass = 'bg-slate-50 text-slate-700 border-slate-200/50'; }
          else if (key.includes('goals') && !key.includes('against')) { label = 'G'; colorClass = 'bg-amber-50 text-amber-850 border-amber-200/50'; }
          else if (key === 'motm') { label = 'POTM'; colorClass = 'bg-amber-50 text-amber-900 border-amber-250/50'; }

          return (
            <div key={key} className={`flex items-center gap-0.5 px-1 py-0.2 rounded border text-[7px] font-bold ${colorClass}`}>
              <span>{label}:</span>
              <span>{String(value)}</span>
            </div>
          );
        })}
      </div>
    );
  };

  const cleanedAwards = Array.isArray(awards) ? awards.filter(award => {
    if (!award.player_name && !award.team_name) return false;
    const awardType = award.award_type?.trim();
    if (!awardType || awardType === 'Category') return false;
    return true;
  }) : [];

  const totalAwards = cleanedAwards.length + cleanedPlayerAwards.length;
  const totalTrophies = Array.isArray(trophies) ? trophies.length : 0;

  // Group weekly awards by round/week with proper ordering
  const groupedWeeklyAwards = cleanedAwards.reduce((acc, award) => {
    const key = award.round_number ? `Round ${award.round_number}` : award.week_number ? `Week ${award.week_number}` : 'Other';
    if (!acc[key]) {
      acc[key] = [];
    }
    acc[key].push(award);
    return acc;
  }, {} as Record<string, Award[]>);

  // Calculate sort value for proper ordering (weeks come after specific rounds based on season)
  const getSortValue = (groupKey: string) => {
    const roundMatch = groupKey.match(/Round (\d+)/);
    const weekMatch = groupKey.match(/Week (\d+)/);
    
    if (roundMatch) {
      return parseInt(roundMatch[1]);
    } else if (weekMatch) {
      const weekNum = parseInt(weekMatch[1]);
      const seasonNum = parseInt(seasonId.replace(/\D/g, '')) || 0;
      const isOldSeason = seasonNum === 16 || seasonNum === 17;
      
      if (isOldSeason) {
        if (weekNum === 1) return 7.5;
        if (weekNum === 2) return 13.5;
        if (weekNum === 3) return 20.5;
        if (weekNum === 4) return 26.5;
        return 26 + ((weekNum - 4) * 6.5) + 0.5;
      } else {
        return 7 + (7 * (weekNum - 1)) + 0.5;
      }
    }
    return 999;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 py-4 sm:py-8 px-3 sm:px-4 lg:px-6 console-bg">
        <div className="container mx-auto max-w-7xl relative z-10 pt-5 lg:pt-24 font-mono">
          <div className="animate-pulse space-y-6">
            <div className="h-6 bg-slate-200 rounded w-24"></div>
            <div className="h-24 bg-slate-200 rounded-2xl"></div>
            <div className="h-16 bg-slate-200 rounded-2xl w-full"></div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 justify-items-center">
              {[...Array(14)].map((_, i) => (
                <div key={i} className="bg-white border border-slate-200/60 rounded-2xl w-full h-[310px] p-5"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation back */}
        <div className="mb-4">
          <Link
            href="/awards"
            className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center w-fit"
          >
            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Awards
          </Link>
        </div>

        {/* Header Title Panel */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 font-mono relative overflow-hidden">
          <div className="text-center md:text-left">
            <span className="text-[10px] text-amber-655 font-extrabold uppercase tracking-wider font-mono">Season Honors</span>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-800 uppercase tracking-tight mt-1">
              {seasonId ? `${seasonId.toUpperCase()} Honors` : 'Season Honors'}
            </h1>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-1.5">
              Awards and trophies distributed throughout the season
            </p>
          </div>
          
          <div className="flex gap-4">
            <div className="text-center bg-slate-50/50 border border-slate-100 px-4 py-2 rounded-xl font-mono min-w-[90px]">
              <div className="text-xl font-black text-amber-600">{totalAwards}</div>
              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Awards</div>
            </div>
            <div className="text-center bg-slate-50/50 border border-slate-100 px-4 py-2 rounded-xl font-mono min-w-[90px]">
              <div className="text-xl font-black text-amber-600">{totalTrophies}</div>
              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Trophies</div>
            </div>
          </div>
        </div>

        {/* Main Tabs Selection Bar */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm font-mono">
          <div className="mb-4">
            <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-1">Cabinet Sections</h2>
            <p className="text-[10px] text-slate-400 font-bold uppercase">Select category to explore</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setActiveTab('awards')}
              className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer ${
                activeTab === 'awards'
                  ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                  : 'bg-slate-50 text-slate-500 hover:text-slate-850 hover:bg-slate-100 border border-slate-200/30'
              }`}
            >
              Awards ({totalAwards})
            </button>
            <button
              onClick={() => setActiveTab('trophies')}
              className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer ${
                activeTab === 'trophies'
                  ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                  : 'bg-slate-50 text-slate-500 hover:text-slate-850 hover:bg-slate-100 border border-slate-200/30'
              }`}
            >
              Trophies ({totalTrophies})
            </button>
          </div>
        </div>

        {/* Sub Tabs Selection (Only for Awards) */}
        {activeTab === 'awards' && (
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm font-mono">
            <div className="mb-4">
              <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <AwardIcon className="w-4 h-4 text-amber-500" /> Individual Honours
              </h2>
              <p className="text-[10px] text-slate-400 font-bold uppercase">Filter individual awards</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => setAwardsSubTab('season')}
                className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer ${
                  awardsSubTab === 'season'
                    ? 'bg-slate-800 text-amber-400 border border-slate-900'
                    : 'bg-slate-50 text-slate-500 hover:text-slate-850 hover:bg-slate-100 border border-slate-200/30'
                }`}
              >
                Season Awards ({cleanedPlayerAwards.length})
              </button>
              <button
                onClick={() => setAwardsSubTab('weekly')}
                className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer ${
                  awardsSubTab === 'weekly'
                    ? 'bg-slate-800 text-amber-400 border border-slate-900'
                    : 'bg-slate-50 text-slate-500 hover:text-slate-850 hover:bg-slate-100 border border-slate-200/30'
                }`}
              >
                Weekly Awards ({cleanedAwards.length})
              </button>
            </div>
          </div>
        )}

        {/* Dynamic Content Sections */}
        {activeTab === 'awards' ? (
          awardsSubTab === 'season' ? (
            cleanedPlayerAwards.length === 0 ? (
              <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-12 text-center shadow-sm max-w-lg mx-auto font-mono">
                <TrophyIcon className="w-12 h-12 text-slate-350 mx-auto mb-4" />
                <p className="text-slate-800 text-base font-extrabold uppercase">No Season Awards Found</p>
                <p className="text-[10px] text-slate-455 font-bold uppercase mt-1">Individual season awards will show here once recorded</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 justify-items-center">
                {cleanedPlayerAwards.map((award, index) => {
                  const isWinner = award.award_position?.toLowerCase().includes('winner') || award.award_position?.toLowerCase().includes('1st');
                  const isRunnerUp = award.award_position?.toLowerCase().includes('runner') || award.award_position?.toLowerCase().includes('2nd');
                  const isThird = award.award_position?.toLowerCase().includes('third') || award.award_position?.toLowerCase().includes('3rd');
                  
                  let cardClass = 'fut-card p-4 flex flex-col justify-between';
                  let positionLabel = 'NOMINEE';
                  let positionClass = 'text-slate-400 font-extrabold';
                  
                  if (isWinner) {
                    cardClass += ' fut-card-gold';
                    positionLabel = award.award_position || 'WINNER';
                    positionClass = 'text-amber-700 font-black';
                  } else if (isRunnerUp) {
                    cardClass += ' fut-card-silver';
                    positionLabel = award.award_position || 'RUNNER-UP';
                    positionClass = 'text-slate-600 font-black';
                  } else if (isThird) {
                    cardClass += ' fut-card-bronze';
                    positionLabel = award.award_position || 'THIRD PLACE';
                    positionClass = 'text-amber-900 font-black';
                  } else if (award.award_position) {
                    positionLabel = award.award_position;
                  }

                  const key = `player-${award.id}-${index}`;
                  const className = `${cardClass} hover-float`;

                  if (award.instagram_post_url) {
                    return (
                      <a
                        href={award.instagram_post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        key={key}
                        className={className}
                      >
                        <SeasonAwardCardInner award={award} cardClass={cardClass} positionClass={positionClass} positionLabel={positionLabel} />
                      </a>
                    );
                  } else {
                    return (
                      <div key={key} className={className}>
                        <SeasonAwardCardInner award={award} cardClass={cardClass} positionClass={positionClass} positionLabel={positionLabel} />
                      </div>
                    );
                  }
                })}
              </div>
            )
          ) : (
            // Weekly Awards Display
            cleanedAwards.length === 0 ? (
              <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-12 text-center shadow-sm max-w-lg mx-auto font-mono">
                <Calendar className="w-12 h-12 text-slate-350 mx-auto mb-4" />
                <p className="text-slate-800 text-base font-extrabold uppercase">No Weekly Awards Found</p>
                <p className="text-[10px] text-slate-455 font-bold uppercase mt-1">Matchday awards will show here once recorded</p>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(groupedWeeklyAwards)
                  .sort((a, b) => {
                    const aValue = getSortValue(a[0]);
                    const bValue = getSortValue(b[0]);
                    return aValue - bValue;
                  })
                  .map(([groupKey, awards]) => {
                    const isExpanded = expandedRounds.has(groupKey);
                    
                    return (
                      <div key={groupKey} className="console-card bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
                        {/* Collapsible Header */}
                        <button
                          onClick={() => toggleRound(groupKey)}
                          className="w-full flex items-center justify-between p-4 hover:bg-slate-50/50 transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <div className="bg-amber-50 border border-amber-100 rounded-xl px-3 py-1.5 flex items-center justify-center">
                              <h3 className="font-extrabold text-amber-700 font-mono text-xs uppercase tracking-wider">
                                {groupKey}
                              </h3>
                            </div>
                            <span className="text-[10px] text-slate-450 font-bold uppercase">
                              {awards.length} {awards.length === 1 ? 'Award' : 'Awards'}
                            </span>
                          </div>
                          <ChevronDown 
                            className={`w-4 h-4 text-amber-655 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
                          />
                        </button>
                      
                        {/* Collapsible Content */}
                        {isExpanded && (
                          <div className="p-4 pt-0 border-t border-slate-100 bg-slate-50/[0.01]">
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 justify-items-center pt-4">
                              {awards.map((award, index) => {
                                const cardClass = 'fut-card fut-card-gold p-4 flex flex-col justify-between';
                                const positionLabel = award.round_number ? `ROUND ${award.round_number}` : award.week_number ? `WEEK ${award.week_number}` : 'WEEKLY WINNER';
                                const positionClass = 'text-amber-700 font-black';

                                const key = `weekly-${award.id}-${index}`;
                                const className = `${cardClass} hover-float`;

                                if (award.instagram_post_url) {
                                  return (
                                    <a
                                      href={award.instagram_post_url}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      key={key}
                                      className={className}
                                    >
                                      <WeeklyAwardCardInner award={award} positionLabel={positionLabel} positionClass={positionClass} renderStats={renderStats} />
                                    </a>
                                  );
                                } else {
                                  return (
                                    <div key={key} className={className}>
                                      <WeeklyAwardCardInner award={award} positionLabel={positionLabel} positionClass={positionClass} renderStats={renderStats} />
                                    </div>
                                  );
                                }
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            )
          )
        ) : (
          // Trophies Cabinet Display
          trophies.length === 0 ? (
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-12 text-center shadow-sm max-w-lg mx-auto font-mono">
              <TrophyIcon className="w-12 h-12 text-slate-350 mx-auto mb-4" />
              <p className="text-slate-800 text-base font-extrabold uppercase">No Trophies Cabinet Records Found</p>
              <p className="text-[10px] text-slate-455 font-bold uppercase mt-1">Tournament honours will show here once recorded</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-7 gap-4 justify-items-center">
              {trophies.map((trophy, index) => {
                const isChampion = trophy.position === 1 || trophy.trophy_position?.toLowerCase().includes('champion') || trophy.trophy_position?.toLowerCase().includes('1st');
                const isRunnerUp = trophy.position === 2 || trophy.trophy_position?.toLowerCase().includes('runner') || trophy.trophy_position?.toLowerCase().includes('2nd');
                const isThird = trophy.position === 3 || trophy.trophy_position?.toLowerCase().includes('third') || trophy.trophy_position?.toLowerCase().includes('3rd');
                
                let cardClass = 'fut-card p-4 flex flex-col justify-between';
                let positionLabel = 'FINALIST';
                let positionClass = 'text-slate-400 font-extrabold';
                
                if (isChampion) {
                  cardClass += ' fut-card-gold';
                  positionLabel = trophy.trophy_position || 'CHAMPION';
                  positionClass = 'text-amber-700 font-black';
                } else if (isRunnerUp) {
                  cardClass += ' fut-card-silver';
                  positionLabel = trophy.trophy_position || 'RUNNER-UP';
                  positionClass = 'text-slate-600 font-black';
                } else if (isThird) {
                  cardClass += ' fut-card-bronze';
                  positionLabel = trophy.trophy_position || 'THIRD PLACE';
                  positionClass = 'text-amber-900 font-black';
                } else if (trophy.trophy_position) {
                  positionLabel = trophy.trophy_position;
                }

                const key = `trophy-${trophy.id}-${index}`;
                const className = `${cardClass} hover-float`;

                if (trophy.instagram_post_url) {
                  return (
                    <a
                      href={trophy.instagram_post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      key={key}
                      className={className}
                    >
                      <TrophyCardInner trophy={trophy} cardClass={cardClass} positionClass={positionClass} positionLabel={positionLabel} />
                    </a>
                  );
                } else {
                  return (
                    <div key={key} className={className}>
                      <TrophyCardInner trophy={trophy} cardClass={cardClass} positionClass={positionClass} positionLabel={positionLabel} />
                    </div>
                  );
                }
              })}
            </div>
          )
        )}
      </div>
    </div>
  );
}

