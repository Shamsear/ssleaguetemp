'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import InstagramEmbed from '@/components/InstagramEmbed';
import { Shield, Trophy, Award, Calendar } from 'lucide-react';

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

export default function SeasonAwardsPage() {
  const params = useParams();
  const seasonId = params.seasonId as string;

  const [awards, setAwards] = useState<Award[]>([]);
  const [playerAwards, setPlayerAwards] = useState<PlayerAward[]>([]);
  const [trophies, setTrophies] = useState<TrophyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'awards' | 'trophies'>('awards');

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
    if (type.includes('potd') || type.includes('player of the day')) return '⭐';
    if (type.includes('potw') || type.includes('player of the week')) return '🌟';
    if (type.includes('tod') || type.includes('team of the day')) return '🏅';
    if (type.includes('tow') || type.includes('team of the week')) return '🏆';
    if (type.includes('pots') || type.includes('player of the season')) return '👑';
    if (type.includes('tots') || type.includes('team of the season')) return '🏆';
    if (type.includes('motm') || type.includes('man of the match')) return '💎';
    return '🎖️';
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    try {
      return new Date(dateString).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
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
      <div className="space-y-2 bg-slate-50 border border-slate-100 rounded-xl p-3">
        <div className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-wider">PERFORMANCE DETAILS</div>
        
        {hasMatchup && (
          <div className="text-[10px] font-mono font-bold text-slate-650 bg-amber-50 border border-amber-100 px-2.5 py-1 rounded-lg">
            ⚔️ {stats.matchup}
          </div>
        )}

        {hasCleanSheet && (
          <div className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 border border-emerald-150 text-emerald-700 rounded text-[9px] font-mono font-bold uppercase tracking-wide">
            🛡️ Clean Sheet
          </div>
        )}

        {entries.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1">
            {entries.map(([originalKey, value]: [string, any]) => {
              const key = originalKey.toLowerCase();
              let label = key.replace(/_/g, ' ');
              let colorClass = 'bg-white text-slate-700 border-slate-200';

              if (key === 'wins') { label = 'W'; colorClass = 'bg-emerald-50 text-emerald-800 border-emerald-200'; }
              else if (key === 'losses') { label = 'L'; colorClass = 'bg-rose-50 text-rose-800 border-rose-200'; }
              else if (key === 'draws') { label = 'D'; colorClass = 'bg-slate-50 text-slate-700 border-slate-200'; }
              else if (key.includes('goals') && !key.includes('against')) { label = key.replace('goals', 'G').replace('total', 'Tot').replace('avg', 'Avg'); colorClass = 'bg-amber-50 text-amber-800 border-amber-200'; }
              else if (key === 'motm') { label = 'MOTM'; colorClass = 'bg-amber-50 text-amber-850 border-amber-250'; }

              return (
                <div key={key} className={`flex items-center gap-1 px-2 py-0.5 rounded border text-[9px] font-mono font-bold shadow-sm uppercase ${colorClass}`}>
                  <span>{label}:</span>
                  <span>{String(value)}</span>
                </div>
              );
            })}
          </div>
        )}
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

  const filteredItems = activeTab === 'awards' 
    ? [...cleanedAwards, ...cleanedPlayerAwards].sort((a, b) => {
        const aDate = a.selected_at || ('created_at' in a ? a.created_at : undefined);
        const bDate = b.selected_at || ('created_at' in b ? b.created_at : undefined);
        if (aDate && bDate) {
          return new Date(bDate).getTime() - new Date(aDate).getTime();
        }
        return 0;
      })
    : [...trophies].sort((a, b) => {
        const aDate = a.awarded_at;
        const bDate = b.awarded_at;
        if (aDate && bDate) {
          return new Date(bDate).getTime() - new Date(aDate).getTime();
        }
        return 0;
      });

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 py-4 sm:py-8 px-3 sm:px-4 lg:px-6 console-bg">
        <div className="container mx-auto max-w-7xl relative z-10 pt-5 lg:pt-24">
          <div className="animate-pulse space-y-6">
            <div className="h-4 bg-slate-200 rounded w-24"></div>
            <div className="h-20 bg-slate-200 rounded-2xl"></div>
            <div className="h-12 bg-slate-200 rounded-2xl w-48"></div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <div key={i} className="bg-white border border-slate-200/60 rounded-2xl h-64 p-5"></div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-8">
        
        {/* Navigation back */}
        <Link
          href="/awards"
          className="inline-flex items-center text-xs font-mono font-bold text-slate-500 hover:text-amber-600 transition-colors"
        >
          ← BACK_TO_AWARDS
        </Link>

        {/* Header Title Panel */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">Season Honors</span>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              {seasonId ? `${seasonId.toUpperCase()} Honors` : 'Season Honors'}
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-1">
              AWARDS & TROPHIES DISTRIBUTED THROUGHOUT THE SEASON: <span className="text-amber-600 font-bold">{totalAwards}</span> AWARDS & <span className="text-amber-600 font-bold">{totalTrophies}</span> TROPHIES
            </p>
          </div>
          
          <div className="flex gap-4">
            <div className="text-center bg-slate-50 border border-slate-200 px-5 py-2.5 rounded-xl font-mono">
              <div className="text-2xl font-black text-amber-600">{totalAwards}</div>
              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Awards</div>
            </div>
            <div className="text-center bg-slate-50 border border-slate-200 px-5 py-2.5 rounded-xl font-mono">
              <div className="text-2xl font-black text-amber-600">{totalTrophies}</div>
              <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Trophies</div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('awards')}
              className={`px-4 py-2.5 rounded-xl font-mono font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'awards'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              ★ AWARDS ({totalAwards})
            </button>
            <button
              onClick={() => setActiveTab('trophies')}
              className={`px-4 py-2.5 rounded-xl font-mono font-bold text-xs transition-all cursor-pointer ${
                activeTab === 'trophies'
                  ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-200'
              }`}
            >
              🏆 TROPHIES ({totalTrophies})
            </button>
          </div>
        </div>

        {/* Content Grid */}
        {filteredItems.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {activeTab === 'awards' ? (
              filteredItems.map((item, index) => {
                // Determine if it's an Award or PlayerAward
                const isPlayerAward = 'award_category' in item;

                if (isPlayerAward) {
                  const award = item as PlayerAward;
                  const isWinner = award.award_position?.toLowerCase().includes('winner');
                  const isRunnerUp = award.award_position?.toLowerCase().includes('runner');
                  const isThird = award.award_position?.toLowerCase().includes('third');
                  const Wrapper = award.instagram_post_url ? 'a' : 'div';

                  return (
                    <Wrapper
                      {...(award.instagram_post_url ? { href: award.instagram_post_url, target: '_blank', rel: 'noopener noreferrer' } : {})}
                      key={`player-${award.id}-${index}`}
                      className={`console-card rounded-2xl overflow-hidden bg-white border shadow-sm flex flex-col h-full hover:border-amber-400/40 transition-all duration-250 group ${
                        isWinner ? 'border-amber-200 bg-gradient-to-br from-amber-50/10 to-white' : 'border-slate-200/60'
                      }`}
                    >
                      {award.instagram_link && (
                        <div className="relative w-full overflow-hidden bg-slate-50 border-b border-slate-100">
                          <InstagramEmbed
                            postUrl={award.instagram_link}
                            instagramPostUrl={award.instagram_post_url ? '' : undefined}
                          />
                        </div>
                      )}

                      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap gap-1">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider ${
                                  award.award_category === 'individual'
                                    ? 'bg-purple-55 border border-purple-150 text-purple-700'
                                    : 'bg-indigo-50 border border-indigo-150 text-indigo-700'
                                }`}>
                                  {award.award_category}
                                </span>
                                {award.award_position && (
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider ${
                                    isWinner ? 'bg-amber-100 border border-amber-250 text-amber-800' :
                                    isRunnerUp ? 'bg-slate-100 border border-slate-200 text-slate-700' :
                                    isThird ? 'bg-orange-100 border border-orange-200 text-orange-800' :
                                    'bg-blue-50 border border-blue-200 text-blue-700'
                                  }`}>
                                    {award.award_position}
                                  </span>
                                )}
                              </div>
                              <h3 className="font-extrabold text-slate-900 text-base tracking-tight group-hover:text-amber-600 transition-colors mt-1">
                                {award.award_type}
                              </h3>
                            </div>
                            <div className="relative flex-shrink-0">
                              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-lg shadow-sm">
                                ⭐
                              </div>
                              {isWinner && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping"></div>}
                            </div>
                          </div>

                          <div className={`border rounded-xl p-3.5 space-y-0.5 ${
                            isWinner ? 'bg-amber-50/30 border-amber-100' : 'bg-slate-50 border-slate-100'
                          }`}>
                            <div className="text-[9px] text-slate-400 font-mono font-bold uppercase tracking-wider">RECIPIENT</div>
                            <div className="font-extrabold text-base text-slate-900 leading-tight">
                              {award.player_name}
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 mt-1">
                              {award.team_name && (
                                <div className="text-xs text-slate-500 font-mono">{award.team_name}</div>
                              )}
                              {award.player_category && (
                                <span className="inline-block px-1.5 py-0.5 rounded bg-white border border-slate-100 text-[8px] font-mono font-bold text-amber-600 uppercase">
                                  {award.player_category}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-[9px] text-slate-400 font-mono">
                          <span>SEASON AWARD</span>
                          <span className="bg-slate-100 text-slate-650 px-2 py-0.5 rounded font-bold">{award.season_id}</span>
                        </div>
                      </div>
                    </Wrapper>
                  );
                } else {
                  const award = item as Award;
                  const Wrapper = award.instagram_post_url ? 'a' : 'div';

                  return (
                    <Wrapper
                      {...(award.instagram_post_url ? { href: award.instagram_post_url, target: '_blank', rel: 'noopener noreferrer' } : {})}
                      key={`award-${award.id}-${index}`}
                      className="console-card rounded-2xl overflow-hidden bg-white border border-slate-200/60 shadow-sm flex flex-col h-full hover:border-amber-400/40 transition-all duration-250 group"
                    >
                      {award.instagram_link && (
                        <div className="relative w-full overflow-hidden bg-slate-50 border-b border-slate-100">
                          <InstagramEmbed
                            postUrl={award.instagram_link}
                            instagramPostUrl={award.instagram_post_url ? '' : undefined}
                          />
                        </div>
                      )}

                      <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="space-y-1">
                              <span className="text-[9px] text-amber-600 font-mono font-bold uppercase tracking-wider">
                                {award.round_number ? `ROUND ${award.round_number}` : award.week_number ? `WEEK ${award.week_number}` : 'SEASON AWARD'}
                              </span>
                              <h3 className="font-extrabold text-slate-900 text-base tracking-tight group-hover:text-amber-600 transition-colors">
                                {award.award_type}
                              </h3>
                            </div>
                            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-lg shadow-sm">
                              {getAwardIcon(award.award_type)}
                            </div>
                          </div>

                          <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 space-y-0.5">
                            <div className="text-[9px] text-slate-400 font-mono font-bold uppercase tracking-wider">RECIPIENT</div>
                            <div className="font-extrabold text-base text-slate-900 leading-tight">
                              {award.player_name || award.team_name}
                            </div>
                            {award.team_name && award.player_name && (
                              <div className="text-xs text-slate-500 font-mono">{award.team_name}</div>
                            )}
                          </div>

                          {renderStats(award.performance_stats)}
                        </div>

                        <div className="space-y-2.5 pt-3 border-t border-slate-100">
                          {award.notes && (
                            <div className="p-2.5 bg-amber-50/50 border-l-2 border-amber-500 rounded text-[10px] text-slate-650 font-medium">
                              <span className="font-bold text-amber-850">NOTE:</span> {award.notes}
                            </div>
                          )}
                          <div className="flex justify-between items-center text-[9px] text-slate-400 font-mono">
                            <span>DATE: {formatDate(award.selected_at)}</span>
                            <span className="bg-slate-100 text-slate-650 px-2 py-0.5 rounded font-bold">{award.season_id}</span>
                          </div>
                        </div>
                      </div>
                    </Wrapper>
                  );
                }
              })
            ) : (
              filteredItems.map((item, index) => {
                const trophy = item as TrophyData;
                const isChampion = trophy.position === 1 || trophy.trophy_position?.toLowerCase().includes('champion') || trophy.trophy_position?.toLowerCase().includes('1st');
                const isRunnerUp = trophy.position === 2 || trophy.trophy_position?.toLowerCase().includes('runner') || trophy.trophy_position?.toLowerCase().includes('2nd');
                const Wrapper = trophy.instagram_post_url ? 'a' : 'div';

                return (
                  <Wrapper
                    {...(trophy.instagram_post_url ? { href: trophy.instagram_post_url, target: '_blank', rel: 'noopener noreferrer' } : {})}
                    key={`trophy-${trophy.id}-${index}`}
                    className={`console-card rounded-2xl overflow-hidden bg-white border shadow-sm flex flex-col h-full hover:border-amber-400/40 transition-all duration-250 group ${
                      isChampion ? 'border-amber-200 bg-gradient-to-br from-amber-50/10 to-white' : 'border-slate-200/60'
                    }`}
                  >
                    {trophy.instagram_link && (
                      <div className="relative w-full overflow-hidden bg-slate-50 border-b border-slate-100">
                        <InstagramEmbed
                          postUrl={trophy.instagram_link}
                          instagramPostUrl={trophy.instagram_post_url ? '' : undefined}
                        />
                      </div>
                    )}

                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="space-y-1">
                            <span className={`inline-block px-1.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider ${
                              trophy.trophy_type === 'league' ? 'bg-amber-105 border border-amber-250 text-amber-800' :
                              trophy.trophy_type === 'runner_up' ? 'bg-slate-100 border border-slate-200 text-slate-700' :
                              'bg-orange-50 border border-orange-150 text-orange-700'
                            }`}>
                              {trophy.trophy_type.replace('_', ' ')}
                            </span>
                            <h3 className="font-extrabold text-slate-900 text-base tracking-tight group-hover:text-amber-600 transition-colors mt-1">
                              {trophy.trophy_name}
                            </h3>
                          </div>
                          <div className="relative flex-shrink-0">
                            <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-lg shadow-sm">
                              🏆
                            </div>
                            {isChampion && <div className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full animate-ping"></div>}
                          </div>
                        </div>

                        <div className={`border rounded-xl p-3.5 space-y-2 ${
                          isChampion ? 'bg-amber-50/30 border-amber-100' : 'bg-slate-50 border-slate-100'
                        }`}>
                          <div>
                            <div className="text-[9px] text-slate-400 font-mono font-bold uppercase tracking-wider">CHAMPION SQUAD</div>
                            <div className="font-extrabold text-base text-slate-900 leading-tight">
                              {trophy.team_name}
                            </div>
                          </div>
                          
                          <div className="flex flex-wrap gap-1.5 pt-1.5 border-t border-slate-200/50">
                            {trophy.trophy_position && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[9px] font-mono font-bold text-amber-700 uppercase">
                                ★ {trophy.trophy_position}
                              </span>
                            )}
                            {trophy.position && (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-[9px] font-mono font-bold text-slate-600 uppercase">
                                POS: #{trophy.position}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-100 flex justify-between items-center text-[9px] text-slate-400 font-mono">
                        <span>DATE: {formatDate(trophy.awarded_at)}</span>
                        <span className="bg-slate-100 text-slate-650 px-2 py-0.5 rounded font-bold">{trophy.season_id}</span>
                      </div>
                    </div>
                  </Wrapper>
                );
              })
            )}
          </div>
        )}

        {/* Empty State */}
        {filteredItems.length === 0 && (
          <div className="bg-white border border-slate-200/60 rounded-2xl p-12 text-center shadow-sm max-w-lg mx-auto">
            <Trophy className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-900 text-lg font-bold">No Records Found</p>
            <p className="text-xs text-slate-400 font-mono mt-1 uppercase">Awards or trophies will show here once recorded</p>
          </div>
        )}

      </div>
    </div>
  );
}
