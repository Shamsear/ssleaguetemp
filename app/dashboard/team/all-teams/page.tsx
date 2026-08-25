'use client';

import { SoccerBallIcon } from '@/components/ui/CustomIcons';
import { Star, User, RefreshCw, Copy, Check } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useCachedTeamSeasons, useCachedSeasons } from '@/hooks/useCachedFirebase';
import type { Season } from '@/types/season';
import AuthGuard from '@/components/auth/AuthGuard';

interface Team {
  id: string;
  name: string;
  logoUrl?: string;
  balance: number;
  // Dual currency fields
  currencySystem?: string;
  footballBudget?: number;
  realPlayerBudget?: number;
  footballSpent?: number;
  realPlayerSpent?: number;
  // Penalty fields
  skipped_seasons?: number;
  penalty_amount?: number;
  last_played_season?: string;
  is_auto_registered?: boolean;
}

interface TeamStats {
  team: Team;
  totalPlayers: number;
  footballPlayersCount: number;
  realPlayersCount: number;
  totalValue: number;
  avgRating: number;
  positionBreakdown: { [key: string]: number };
}

const POSITIONS = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'AMF', 'LMF', 'RMF', 'LWF', 'RWF', 'SS', 'CF'];

function CopyBalanceToggle({ teamId, eCoin, ssCoin }: { teamId: string; eCoin: number; ssCoin: number }) {
  const [selected, setSelected] = useState<'ecoin' | 'sscoin'>('ecoin');
  const [copied, setCopied] = useState(false);

  const value = selected === 'ecoin' ? eCoin : ssCoin;

  const handleCopy = () => {
    navigator.clipboard.writeText(String(value)).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <AuthGuard requiredRole="team">
    <div className="flex items-center gap-1.5">
      {/* Toggle */}
      <div className="flex rounded-lg border border-slate-200 overflow-hidden text-[10px] font-mono font-bold uppercase tracking-wider shrink-0">
        <button
          onClick={() => { setSelected('ecoin'); setCopied(false); }}
          className={`px-2.5 py-1.5 transition-all ${selected === 'ecoin' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
        >
          eCoin
        </button>
        <button
          onClick={() => { setSelected('sscoin'); setCopied(false); }}
          className={`px-2.5 py-1.5 transition-all border-l border-slate-200 ${selected === 'sscoin' ? 'bg-purple-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
        >
          SSCoin
        </button>
      </div>

      {/* Value + Copy */}
      <button
        onClick={handleCopy}
        className={`flex-1 inline-flex items-center justify-between gap-1.5 px-3 py-1.5 rounded-lg font-mono font-bold text-[10px] uppercase tracking-wider transition-all border ${
          copied
            ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
            : selected === 'ecoin'
              ? 'bg-indigo-50 border-indigo-200 text-indigo-700 hover:bg-indigo-100'
              : 'bg-purple-50 border-purple-200 text-purple-700 hover:bg-purple-100'
        }`}
      >
        <span className="tabular-nums">{value.toLocaleString()}</span>
        {copied ? <Check className="w-3 h-3 shrink-0" /> : <Copy className="w-3 h-3 shrink-0" />}
      </button>
    </div>
  
    </AuthGuard>
  );
}

function CopyAllBalances({ 
  teams, 
  isDual, 
  seasonName,
  selected,
  setSelected
}: { 
  teams: TeamStats[]; 
  isDual: boolean; 
  seasonName: string;
  selected: 'ecoin' | 'sscoin' | 'balance';
  setSelected: (val: 'ecoin' | 'sscoin' | 'balance') => void;
}) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const getVal = (t: TeamStats) => {
    if (selected === 'ecoin') return t.team.footballBudget || 0;
    if (selected === 'sscoin') return t.team.realPlayerBudget || 0;
    return t.team.balance || 0;
  };

  const sortedTeams = [...teams].sort((a, b) => getVal(b) - getVal(a));

  const currencyLabel = selected === 'ecoin' ? 'eCoin Balance' : selected === 'sscoin' ? 'SSCoin Balance' : 'Balance';
  const accentClass = selected === 'ecoin' ? 'text-indigo-600' : selected === 'sscoin' ? 'text-purple-600' : 'text-amber-600';
  const accentBg = selected === 'ecoin' ? 'bg-indigo-600' : selected === 'sscoin' ? 'bg-purple-600' : 'bg-amber-600';

  const handleCopyAll = () => {
    const header = `SS Super League — ${seasonName}\n${'='.repeat(36)}\n${currencyLabel} Sheet\n${'-'.repeat(36)}`;
    const rows = sortedTeams.map((t, i) => `${String(i + 1).padStart(2, ' ')}. ${t.team.name}: ${getVal(t).toLocaleString()}`);
    const text = [header, ...rows].join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  return (
    <div className="console-card bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm font-mono">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 bg-gradient-to-r from-slate-800 to-slate-700">
        <p className="text-[9px] uppercase tracking-widest text-slate-400 font-bold mb-0.5">SS Super League — {seasonName}</p>
        <h3 className="text-sm font-extrabold text-white uppercase tracking-wide">{currencyLabel} Sheet</h3>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex flex-wrap items-center gap-2">
        {/* Currency toggle */}
        {isDual && (
          <div className="flex rounded-lg border border-slate-200 overflow-hidden text-[10px] font-bold uppercase tracking-wider shrink-0">
            <button
              onClick={() => { setSelected('ecoin'); setCopied(false); }}
              className={`px-2.5 py-1.5 transition-all ${selected === 'ecoin' ? 'bg-indigo-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
            >eCoin</button>
            <button
              onClick={() => { setSelected('sscoin'); setCopied(false); }}
              className={`px-2.5 py-1.5 transition-all border-l border-slate-200 ${selected === 'sscoin' ? 'bg-purple-600 text-white' : 'bg-white text-slate-500 hover:bg-slate-50'}`}
            >SSCoin</button>
          </div>
        )}

        <div className="flex items-center gap-2 ml-auto">
          {/* Preview toggle */}
          <button
            onClick={() => setExpanded(p => !p)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500 hover:bg-slate-100 transition-all"
          >
            {expanded ? 'Hide List' : 'Preview'}
          </button>
          {/* Copy All */}
          <button
            onClick={handleCopyAll}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[10px] font-bold uppercase tracking-wider border transition-all ${
              copied
                ? 'bg-emerald-50 border-emerald-300 text-emerald-700'
                : 'bg-slate-800 border-slate-900 text-white hover:bg-slate-700 active:scale-95'
            }`}
          >
            {copied
              ? <><Check className="w-3 h-3" /> Copied!</>
              : <><Copy className="w-3 h-3" /> Copy All</>}
          </button>
        </div>
      </div>

      {/* Preview list */}
      {expanded && (
        <div className="max-h-72 overflow-y-auto">
          {/* Sticky subheader */}
          <div className="sticky top-0 flex items-center justify-between px-4 py-1.5 bg-slate-100/80 backdrop-blur border-b border-slate-200 text-[9px] font-bold uppercase tracking-widest text-slate-400">
            <span>#  Team</span>
            <span>{currencyLabel}</span>
          </div>
          {sortedTeams.map((t, i) => (
            <div
              key={t.team.id}
              className="flex items-center gap-3 px-4 py-2.5 border-b border-slate-50 hover:bg-slate-50/60 transition-colors"
            >
              <span className="text-[10px] font-extrabold text-slate-300 tabular-nums w-5 shrink-0 text-right">{i + 1}</span>
              <span className="text-xs font-bold text-slate-700 flex-1 truncate">{t.team.name}</span>
              <span className={`text-xs font-extrabold tabular-nums shrink-0 ${accentClass}`}>{getVal(t).toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function AllTeamsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [teams, setTeams] = useState<TeamStats[]>([]);
  const [seasonName, setSeasonName] = useState('');
  const [seasonId, setSeasonId] = useState<string | null>(null);
  const [maxPlayers, setMaxPlayers] = useState(25); // Default to 25
  const [seasonType, setSeasonType] = useState<'single' | 'multi'>('single');
  const [error, setError] = useState('');
  const [playerCounts, setPlayerCounts] = useState<{ [key: string]: { footballPlayersCount: number; realPlayersCount: number } }>({});
  const [updateCounter, setUpdateCounter] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [copiedTeam, setCopiedTeam] = useState<string | null>(null);
  const [selectedCurrency, setSelectedCurrency] = useState<'ecoin' | 'sscoin' | 'balance'>('balance');
  const [hasSetDefaultCurrency, setHasSetDefaultCurrency] = useState(false);

  useEffect(() => {
    if (teams.length > 0 && !hasSetDefaultCurrency) {
      const isDual = seasonType === 'multi' || teams.some(t => t.team.currencySystem === 'dual');
      setSelectedCurrency(isDual ? 'ecoin' : 'balance');
      setHasSetDefaultCurrency(true);
    }
  }, [teams, seasonType, hasSetDefaultCurrency]);

  const sortedTeams = useMemo(() => {
    const getVal = (t: TeamStats) => {
      if (selectedCurrency === 'ecoin') return t.team.footballBudget || 0;
      if (selectedCurrency === 'sscoin') return t.team.realPlayerBudget || 0;
      return t.team.balance || 0;
    };
    return [...teams].sort((a, b) => getVal(b) - getVal(a));
  }, [teams, selectedCurrency]);

  const handleCopyBalance = (teamId: string, label: string, value: number) => {
    navigator.clipboard.writeText(String(value)).then(() => {
      setCopiedTeam(`${teamId}_${label}`);
      setTimeout(() => setCopiedTeam(null), 2000);
    });
  };

  // Fetch all team seasons for the season (cached, only after we have seasonId)
  const { data: allTeamSeasons, loading: allTeamsLoading } = useCachedTeamSeasons(
    seasonId ? { seasonId } : undefined
  );

  useEffect(() => {
    const fetchActiveSeason = async () => {
      if (!user || user.role !== 'team') return;

      try {
        // Get all seasons from API
        const seasonsJson = await fetch('/api/seasons').then(r => r.json());
        const seasonsList: any[] = seasonsJson.data || [];
        const nonCompletedSeasonIds: string[] = [];
        const seasonsMap = new Map<string, { name: string; maxPlayers: number }>();
        
        seasonsList.forEach((season: any) => {
          seasonsMap.set(season.id, {
            name: season.name || `Season ${season.season_number || 'Unknown'}`,
            maxPlayers: season.football_base_slots || season.max_football_players || 25
          });
          
          if (season.status !== 'completed') {
            nonCompletedSeasonIds.push(season.id);
          }
        });
        
        const getSeasonType = (sid: string): 'single' | 'multi' => {
          const season = seasonsList.find((s: any) => s.id === sid);
          return season?.type || 'single';
        };

        let targetSeasonId = null;
        if (nonCompletedSeasonIds.length > 0) {
          targetSeasonId = nonCompletedSeasonIds[0];
          const seasonData = seasonsMap.get(targetSeasonId);
          setSeasonName(seasonData?.name || 'Current Season');
          setMaxPlayers(seasonData?.maxPlayers || 25);
          setSeasonType(getSeasonType(targetSeasonId));
        } else if (seasonsList.length > 0) {
          const firstActiveSeason = seasonsList.find((s: any) => s.is_active === true || s.isActive === true);
          if (firstActiveSeason) {
            targetSeasonId = firstActiveSeason.id;
            const seasonData = seasonsMap.get(targetSeasonId);
            setSeasonName(seasonData?.name || 'Current Season');
            setMaxPlayers(seasonData?.maxPlayers || 25);
            setSeasonType(getSeasonType(targetSeasonId));
          } else {
            const firstSeason = seasonsList[0];
            targetSeasonId = firstSeason.id;
            const seasonData = seasonsMap.get(targetSeasonId);
            setSeasonName(seasonData?.name || 'Season');
            setMaxPlayers(seasonData?.maxPlayers || 25);
            setSeasonType(getSeasonType(targetSeasonId));
          }
        }

        if (!targetSeasonId) {
          setError('No active season found');
          return;
        }

        setSeasonId(targetSeasonId);
      } catch (error) {
        console.error('Error fetching active season:', error);
        setError('Failed to load active season');
      }
    };

    fetchActiveSeason();
  }, [user]);

  useEffect(() => {
    const fetchPlayerCounts = async () => {
      if (!seasonId) return;
      const startTime = Date.now();
      setIsRefreshing(true);

      try {
        const response = await fetch(`/api/team/player-counts?seasonId=${seasonId}`);
        const result = await response.json();

        if (result.success) {
          setPlayerCounts(result.data);
        }
      } catch (error) {
        console.error('Error fetching player counts:', error);
      } finally {
        const elapsed = Date.now() - startTime;
        if (elapsed < 800) {
          await new Promise(resolve => setTimeout(resolve, 800 - elapsed));
        }
        setIsRefreshing(false);
      }
    };

    fetchPlayerCounts();
  }, [seasonId, updateCounter]);

  // Process all team seasons into TeamStats
  useEffect(() => {
    if (!allTeamSeasons || allTeamsLoading || !seasonId) return;

    console.log('[All Teams] Processing team seasons:', {
      totalTeamSeasons: allTeamSeasons.length,
      targetSeasonId: seasonId,
      sampleSeasonIds: allTeamSeasons.slice(0, 3).map((ts: any) => ts.season_id)
    });

    try {
      const teamsData: TeamStats[] = allTeamSeasons
        .filter((ts: any) => {
          const isRegistered = ts.status === 'registered';
          const isCorrectSeason = ts.season_id === seasonId;
          
          console.log('[All Teams] Filtering team:', {
            teamName: ts.team_name,
            seasonId: ts.season_id,
            targetSeasonId: seasonId,
            status: ts.status,
            passes: isRegistered && isCorrectSeason
          });
          
          return isRegistered && isCorrectSeason;
        })
        .map((teamSeasonData: any) => {
          const teamId = teamSeasonData.team_id;
          // Get actual player counts from Neon databases
          const footballPlayersCount = playerCounts[teamId]?.footballPlayersCount || 0;
          const realPlayersCount = playerCounts[teamId]?.realPlayersCount || 0;
          const totalPlayers = footballPlayersCount + realPlayersCount;
          const avgRating = teamSeasonData.average_rating || 0;

          return {
            team: {
              id: teamId,
              name: teamSeasonData.team_name || 'Unknown Team',
              logoUrl: teamSeasonData.team_logo || undefined,
              logo_position_x_circle: teamSeasonData.logo_position_x_circle,
              logo_position_y_circle: teamSeasonData.logo_position_y_circle,
              logo_scale_circle: teamSeasonData.logo_scale_circle,
              logo_position_x_square: teamSeasonData.logo_position_x_square,
              logo_position_y_square: teamSeasonData.logo_position_y_square,
              logo_scale_square: teamSeasonData.logo_scale_square,
              balance: teamSeasonData.budget || 0,
              // Dual currency fields
              currencySystem: teamSeasonData.currency_system || 'dual',
              footballBudget: teamSeasonData.football_budget || 0,
              realPlayerBudget: teamSeasonData.real_player_budget || 0,
              footballSpent: teamSeasonData.football_spent || 0,
              realPlayerSpent: teamSeasonData.real_player_spent || 0,
            },
            totalPlayers,
            footballPlayersCount,
            realPlayersCount,
            totalValue: teamSeasonData.currency_system === 'dual'
              ? (teamSeasonData.football_spent || 0) + (teamSeasonData.real_player_spent || 0)
              : (teamSeasonData.total_spent || 0),
            avgRating: Math.round(avgRating * 10) / 10,
            positionBreakdown: teamSeasonData.position_counts || {},
          };
        });

      // Sort teams by total value (descending)
      teamsData.sort((a, b) => b.totalValue - a.totalValue);

      console.log('[All Teams] Final filtered teams:', {
        count: teamsData.length,
        teams: teamsData.map(t => ({ name: t.team.name, id: t.team.id }))
      });

      setTeams(teamsData);
    } catch (err) {
      console.error('Error processing teams:', err);
      setError('An error occurred while loading teams');
    }
  }, [allTeamSeasons, allTeamsLoading, seasonId, playerCounts]);

  const getPositionColor = (position: string) => {
    const colors: { [key: string]: string } = {
      GK: 'bg-amber-50 text-amber-700 border border-amber-200/40',
      CB: 'bg-rose-50 text-rose-700 border border-rose-200/40',
      LB: 'bg-rose-50/60 text-rose-700 border border-rose-200/30',
      RB: 'bg-rose-50/60 text-rose-700 border border-rose-200/30',
      DMF: 'bg-indigo-50 text-indigo-700 border border-indigo-200/40',
      CMF: 'bg-sky-50 text-sky-700 border border-sky-200/40',
      AMF: 'bg-violet-50 text-violet-700 border border-violet-200/40',
      LMF: 'bg-sky-50/60 text-sky-700 border border-sky-200/30',
      RMF: 'bg-sky-50/60 text-sky-700 border border-sky-200/30',
      LWF: 'bg-emerald-50/60 text-emerald-700 border border-emerald-200/30',
      RWF: 'bg-emerald-50/60 text-emerald-700 border border-emerald-200/30',
      SS: 'bg-emerald-50 text-emerald-700 border border-emerald-200/40',
      CF: 'bg-emerald-50 text-emerald-700 border border-emerald-200/40',
    };
    return colors[position] || 'bg-slate-50 text-slate-700 border border-slate-200/40';
  };

  const isLoading = !seasonId || allTeamsLoading || isRefreshing;

  if (loading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative px-4">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-8 max-w-md w-full mx-auto text-center relative z-10 font-mono">
          <div className="text-rose-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider mb-2">Error Loading Teams</h2>
          <p className="text-xs text-slate-500 uppercase font-semibold mb-6">{error}</p>
          <Link 
            href="/dashboard" 
            className="inline-flex items-center justify-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl text-xs uppercase tracking-wider font-bold transition-all shadow-sm w-full"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="font-mono">
            <h1 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-wider text-slate-800">All Teams</h1>
            <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
              Season: <span className="font-extrabold text-amber-500">{seasonName}</span>
            </p>
          </div>
          <Link 
            href="/dashboard" 
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-bold"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Dashboard</span>
          </Link>
        </div>

        {/* Teams Count Badge */}
        <div className="flex items-center gap-2">
          {isLoading ? (
            <div className="h-8 bg-slate-200/80 rounded-xl w-40 animate-pulse border border-slate-200/60"></div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 border border-amber-200/60 rounded-xl font-mono text-xs uppercase tracking-wider font-bold shadow-sm">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <span>{teams.length} Team{teams.length !== 1 ? 's' : ''} Registered</span>
            </div>
          )}
        </div>

        {/* Copy All Balances Panel */}
        {isLoading ? (
          <div className="h-20 bg-slate-200/50 rounded-2xl w-full animate-pulse border border-slate-200/60"></div>
        ) : teams.length > 0 && (
          <CopyAllBalances 
            teams={teams} 
            isDual={seasonType === 'multi' || teams.some(t => t.team.currencySystem === 'dual')} 
            seasonName={seasonName} 
            selected={selectedCurrency}
            setSelected={setSelectedCurrency}
          />
        )}

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <div 
                key={i} 
                className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 font-mono flex flex-col justify-between animate-pulse h-80"
              >
                <div>
                  {/* Team Header Skeleton */}
                  <div className="flex items-center mb-6 gap-3">
                    <div className="h-14 w-14 bg-slate-200 rounded-xl flex-shrink-0"></div>
                    <div className="h-5 bg-slate-200 rounded-lg w-32"></div>
                  </div>

                  {/* Team Stats Grid Skeleton */}
                  <div className="grid grid-cols-2 gap-2 mb-6">
                    {[...Array(4)].map((_, j) => (
                      <div key={j} className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl h-12 flex flex-col justify-between">
                        <div className="h-2 bg-slate-200 rounded w-12 mb-2"></div>
                        <div className="h-3.5 bg-slate-200 rounded w-20"></div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Team Footer/Button Skeleton */}
                <div className="h-10 bg-slate-200 rounded-xl w-full"></div>
              </div>
            ))}
          </div>
        ) : sortedTeams.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {sortedTeams.map((teamData) => (
              <div 
                key={teamData.team.id} 
                className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 hover:border-amber-400/40 hover:shadow-md transition-all duration-200 font-mono flex flex-col justify-between"
              >
                <div>
                  {/* Team Header */}
                  <div className="flex items-center mb-4 gap-3">
                    <div className="h-14 w-14 flex-shrink-0 bg-slate-50 border border-slate-200/60 rounded-xl flex items-center justify-center p-0 relative overflow-hidden shadow-inner">
                      {teamData.team.logoUrl ? (
                        <img
                          src={teamData.team.logoUrl}
                          alt={teamData.team.name}
                          className="absolute inset-0 w-full h-full object-cover"
                          style={{
                            objectPosition: `${(teamData.team as any).logo_position_x_square ?? 50}% ${(teamData.team as any).logo_position_y_square ?? 50}%`,
                            transform: `scale(${(teamData.team as any).logo_scale_square ?? 1})`,
                            transformOrigin: `${(teamData.team as any).logo_position_x_square ?? 50}% ${(teamData.team as any).logo_position_y_square ?? 50}%`,
                          }}
                        />
                      ) : (
                        <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      )}
                    </div>
                    <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide leading-tight">{teamData.team.name}</h2>
                  </div>

                  {/* Team Stats Grid */}
                  <div className="grid grid-cols-2 gap-2 mb-4 text-[10px] uppercase font-bold tracking-wider">
                    {/* Players Count */}
                    <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between">
                      <span className="text-slate-400 text-[8px] mb-1">Squad Players</span>
                      <span className="text-slate-700 flex items-center gap-1 font-mono">
                        <SoccerBallIcon className="w-4 h-4" /> {teamData.footballPlayersCount} / {maxPlayers}
                      </span>
                    </div>

                    {seasonType === 'multi' && (
                      <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between">
                        <span className="text-slate-400 text-[8px] mb-1">Real Players</span>
                        <span className="text-slate-700 flex items-center gap-1 font-mono">
                          <User className="w-4 h-4 text-slate-500" /> {teamData.realPlayersCount}
                        </span>
                      </div>
                    )}

                    {/* Currencies */}
                    {seasonType === 'multi' || teamData.team.currencySystem === 'dual' ? (
                      <>
                        <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between col-span-1">
                          <span className="text-slate-400 text-[8px] mb-1">eCoin Spent</span>
                          <span className="text-blue-600 font-extrabold font-mono text-xs">
                            {(teamData.team.footballSpent || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between col-span-1">
                          <span className="text-slate-400 text-[8px] mb-1">SSCoin Spent</span>
                          <span className="text-purple-600 font-extrabold font-mono text-xs">
                            {(teamData.team.realPlayerSpent || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between col-span-1">
                          <span className="text-slate-400 text-[8px] mb-1">eCoin Left</span>
                          <span className="text-indigo-600 font-extrabold font-mono text-xs">
                            {(teamData.team.footballBudget || 0).toLocaleString()}
                          </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between col-span-1">
                          <span className="text-slate-400 text-[8px] mb-1">SSCoin Left</span>
                          <span className="text-amber-600 font-extrabold font-mono text-xs">
                            {(teamData.team.realPlayerBudget || 0).toLocaleString()}
                          </span>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between col-span-1">
                          <span className="text-slate-400 text-[8px] mb-1">Spent</span>
                          <span className="text-emerald-600 font-extrabold font-mono text-xs">
                            {teamData.totalValue.toLocaleString()}
                          </span>
                        </div>
                        <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between col-span-1">
                          <span className="text-slate-400 text-[8px] mb-1">Left</span>
                          <span className="text-amber-600 font-extrabold font-mono text-xs">
                            {teamData.team.balance.toLocaleString()}
                          </span>
                        </div>
                      </>
                    )}
                  </div>

                  {/* Average Rating */}
                  {teamData.avgRating > 0 && (
                    <div className="mb-4 p-3 bg-amber-50/50 border border-amber-200/50 rounded-xl">
                      <div className="flex items-center justify-between font-mono">
                        <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Squad Avg Rating</span>
                        <span className="text-lg font-black text-amber-500">
                          <Star className="w-4 h-4 text-amber-400 fill-amber-400" /> {teamData.avgRating.toFixed(1)}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Squad Composition */}
                  <div className="space-y-2 mb-4">
                    <h3 className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Squad Composition</h3>
                    <div className="grid grid-cols-4 gap-1 text-[9px] font-mono font-bold">
                      {POSITIONS.map((position) => {
                        const count = teamData.positionBreakdown[position] || 0;
                        return (

                          <div 
                            key={position} 
                            className={`rounded-lg py-1 px-1.5 flex justify-between items-center ${getPositionColor(position)} ${
                              count === 0 ? 'opacity-30' : ''
                            }`}
                          >
                            <span>{position}</span>
                            <span className="font-extrabold">{count}</span>
                          </div>

  );
                      })}
                    </div>
                  </div>
                </div>

                {/* View Squad + Copy Balance */}
                <div className="mt-auto pt-3 border-t border-slate-100 space-y-2">
                  {/* Copy Balance */}
                  {(seasonType === 'multi' || teamData.team.currencySystem === 'dual') ? (
                    <CopyBalanceToggle
                      teamId={teamData.team.id}
                      eCoin={teamData.team.footballBudget || 0}
                      ssCoin={teamData.team.realPlayerBudget || 0}
                    />
                  ) : (
                    <button
                      onClick={() => handleCopyBalance(teamData.team.id, 'balance', teamData.team.balance || 0)}
                      className={`w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl font-mono font-bold text-[10px] uppercase tracking-wider transition-all border ${
                        copiedTeam === `${teamData.team.id}_balance`
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          : 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                      }`}
                      title="Copy balance"
                    >
                      {copiedTeam === `${teamData.team.id}_balance` ? (
                        <><Check className="w-3 h-3" /> Copied!</>
                      ) : (
                        <><Copy className="w-3 h-3" /> Copy Balance</>
                      )}
                    </button>
                  )}

                  <Link
                    href={`/dashboard/team/squad/${teamData.team.id}`}
                    className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-sm"
                  >
                    View Squad
                  </Link>
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* No Teams Message */
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-12 text-center shadow-sm">
            <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            <h3 className="text-lg font-bold text-slate-800 uppercase tracking-wider mb-2">No Teams Found</h3>
            <p className="text-xs text-slate-500 font-semibold uppercase">No teams are registered for this season yet.</p>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={() => setUpdateCounter(prev => prev + 1)}
        disabled={isRefreshing}
        className="fixed right-6 bottom-24 z-[1002] w-12 h-12 flex items-center justify-center bg-amber-600 text-white rounded-full shadow-lg hover:bg-amber-500 active:scale-95 transition-all disabled:opacity-80 cursor-pointer border border-amber-500/20 shadow-amber-600/20"
        title="Refresh Data"
      >
        <RefreshCw className={`w-5 h-5 ${isRefreshing ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
}
