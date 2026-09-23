'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';
import { usePermissions } from '@/hooks/usePermissions';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { evaluateCandidate, CandidateEvaluation } from '@/lib/awards-ai-evaluator';
import { getWeekRanges, getWeekForRound, WeekRange } from '@/lib/week-ranges';
import {
  Trophy,
  Settings,
  ArrowLeft,
  Info,
  Calendar,
  Clock,
  Lock,
  Plus,
  Crown,
  Award,
  ChevronLeft,
  ChevronRight,
  Trash2,
  CheckCircle,
  AlertCircle,
  Copy,
  Check,
  Sparkles,
  Bot,
  Zap,
  ArrowUpDown
} from 'lucide-react';
import AuthGuard from '@/components/auth/AuthGuard';

type AwardTab = 'POTD' | 'POTW' | 'TOD' | 'TOW' | 'POTS' | 'TOTS';

interface Award {
  id: string;
  award_type: string;
  player_id?: string;
  player_name?: string;
  category?: string;
  team_id?: string;
  team_name?: string;
  opponent_player_id?: string;
  opponent_player_name?: string;
  opponent_category?: string;
  opponent_team_id?: string;
  opponent_team_name?: string;
  round_number?: number;
  week_number?: number;
  performance_stats: any;
  selected_by_name?: string;
  selected_at?: string;
  result?: string;
  home_team?: string;
  away_team?: string;
  home_score?: number;
  away_score?: number;
}

interface Candidate {
  player_id?: string;
  player_name?: string;
  category?: string;
  team_id?: string;
  team_name?: string;
  opponent_player_id?: string;
  opponent_player_name?: string;
  opponent_category?: string;
  opponent_team_id?: string;
  opponent_team_name?: string;
  performance_stats: any;
  fixture_id?: string;
  result?: string;
  matchup_result?: string;
  round_number?: number;
  aiEvaluation?: CandidateEvaluation;
}

function getCategoryBadgeStyle(category?: string) {
  if (!category) return 'bg-slate-100 text-slate-700 border border-slate-300';
  const c = category.toUpperCase().trim();
  if (c === 'RED') return 'bg-rose-100 text-rose-800 border border-rose-300';
  if (c === 'BLUE') return 'bg-blue-100 text-blue-800 border border-blue-300';
  if (c === 'BLACK') return 'bg-slate-900 text-slate-100 border border-slate-700';
  if (c === 'WHITE') return 'bg-slate-100 text-slate-800 border border-slate-300';
  return 'bg-purple-100 text-purple-800 border border-purple-300';
}

function formatCompactMatchup(
  candidate: Candidate,
  nomineeCategory?: string,
  opponentCategory?: string
): string {
  const nomName = candidate.player_name || '';
  const nomCat = nomineeCategory || candidate.category || '';
  const nomFormatted = nomCat ? `${nomName} (${nomCat.toUpperCase()})` : nomName;

  const oppName = candidate.opponent_player_name || candidate.opponent_team_name || '';
  const oppCat = opponentCategory || candidate.opponent_category || '';
  const oppFormatted = oppCat ? `${oppName} (${oppCat.toUpperCase()})` : oppName;

  const stats = candidate.performance_stats;
  if (stats && stats.goals !== undefined && stats.opponent_goals !== undefined && nomName && oppName) {
    return `${nomFormatted} ${stats.goals}-${stats.opponent_goals} ${oppFormatted}`;
  }

  // If matchup_result exists (e.g. "MUNEER 5-1 ALBIN")
  if (candidate.matchup_result) {
    let res = candidate.matchup_result;
    if (nomCat && nomName && !res.toUpperCase().includes(`(${nomCat.toUpperCase()})`)) {
      res = res.replace(new RegExp(nomName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `${nomName} (${nomCat.toUpperCase()})`);
    }
    if (oppCat && oppName && !res.toUpperCase().includes(`(${oppCat.toUpperCase()})`)) {
      res = res.replace(new RegExp(oppName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), `${oppName} (${oppCat.toUpperCase()})`);
    }
    return res;
  }

  if (candidate.result) {
    return candidate.result;
  }

  return '';
}

function formatCandidateStatsSummary(candidate: Candidate, tab: AwardTab): string {
  const stats = candidate.performance_stats;
  if (!stats) return '';

  const isWeeklyOrSeason = ['POTW', 'TOW', 'POTS', 'TOTS'].includes(tab);
  const isPlayer = ['POTD', 'POTW', 'POTS'].includes(tab);

  if (isWeeklyOrSeason) {
    const pts = stats.points ?? ((stats.wins ?? 0) * 3 + (stats.draws ?? 0));
    const w = stats.wins ?? 0;
    const d = stats.draws ?? 0;
    const l = stats.losses ?? 0;
    const mp = stats.matches_played ?? 0;
    const gf = stats.goals ?? stats.goals_for ?? stats.total_goals ?? 0;
    const ga = stats.goals_conceded ?? stats.goals_against ?? stats.opponent_goals ?? 0;
    const cs = stats.clean_sheets ?? (stats.clean_sheet ? 1 : 0);
    const gd = stats.goal_difference ?? (gf - ga);

    if (isPlayer) {
      const csStr = cs > 0 ? ` | 🧤 ${cs} CS` : '';
      return `${pts} pts | ${w}W ${d}D ${l}L | ⚽ ${gf} G | 🛡️ ${ga} GA${csStr} (${mp} matches)`;
    } else {
      const gdStr = gd >= 0 ? `+${gd}` : `${gd}`;
      return `${pts} pts | ${w}W ${d}D ${l}L | ⚽ ${gf} GF | 🛡️ ${ga} GA | GD ${gdStr} (${mp} matches)`;
    }
  }

  // Single match (POTD / TOD)
  const matchupStr = formatCompactMatchup(candidate);
  if (matchupStr) return matchupStr;

  if (stats.goals !== undefined && stats.opponent_goals !== undefined) {
    return `${stats.goals}-${stats.opponent_goals}`;
  }

  return '';
}

function generateNomineeWhatsAppMessage(
  candidate: Candidate,
  tab: AwardTab,
  tournamentName: string,
  round: number,
  week: number,
  category?: string,
  opponentCategory?: string,
  isWinner: boolean = false
): string {
  const isPlayerAward = ['POTD', 'POTW', 'POTS'].includes(tab);
  const isRoundAward = ['POTD', 'TOD'].includes(tab);
  const isWeekAward = ['POTW', 'TOW'].includes(tab);

  let periodStr = `Full Season`;
  if (isRoundAward) {
    periodStr = `Round ${round}`;
  } else if (isWeekAward) {
    const ranges = getWeekRanges(round > 0 ? round : 26);
    const found = ranges.find(r => r.week === week);
    const label = found ? found.label : `Week ${week}`;
    periodStr = `Week ${week} (${label})`;
  }

  let msg = isWinner 
    ? `🏆 *SS LEAGUE - OFFICIAL WINNER* 🏆\n`
    : `🏆 *SS LEAGUE - AWARD NOMINEE* 🏆\n`;
  msg += `🎖️ *${tab}* | 📅 *${periodStr}*\n`;
  if (tournamentName) {
    msg += `🏟️ ${tournamentName}\n`;
  }
  msg += `------------------------------\n`;

  if (isPlayerAward) {
    const nomCatStr = category ? ` (${category.toUpperCase()})` : '';
    const nomTitle = candidate.player_name ? `*${candidate.player_name}${nomCatStr}*` : '*N/A*';
    const teamSuffix = candidate.team_name ? ` - ${candidate.team_name}` : '';
    msg += `👤 ${nomTitle}${teamSuffix}\n`;
  } else {
    const teamTitle = candidate.team_name ? `*${candidate.team_name}*` : '*N/A*';
    msg += `👥 ${teamTitle}\n`;
  }

  const statsSummary = formatCandidateStatsSummary(candidate, tab);
  if (statsSummary) {
    msg += `📊 ${statsSummary}\n`;
  }

  msg += `------------------------------\n`;
  msg += `🎮 *SS League Awards Committee*`;

  return msg;
}

function generateRoundNomineesWhatsAppMessage(
  candidatesList: Candidate[],
  tab: AwardTab,
  tournamentName: string,
  round: number,
  week: number,
  getCat: (c: Candidate) => string,
  getOppCat: (c: Candidate) => string
): string {
  const isPlayerAward = ['POTD', 'POTW', 'POTS'].includes(tab);
  const isRoundAward = ['POTD', 'TOD'].includes(tab);
  const isWeekAward = ['POTW', 'TOW'].includes(tab);

  let periodStr = `Full Season`;
  if (isRoundAward) {
    periodStr = `Round ${round}`;
  } else if (isWeekAward) {
    const ranges = getWeekRanges(round > 0 ? round : 26);
    const found = ranges.find(r => r.week === week);
    const label = found ? found.label : `Week ${week}`;
    periodStr = `Week ${week} (${label})`;
  }

  let msg = `🏆 *SS LEAGUE - AWARD NOMINEES* 🏆\n`;
  msg += `🎖️ *${tab}* | 📅 *${periodStr}*\n`;
  if (tournamentName) {
    msg += `🏟️ ${tournamentName}\n`;
  }
  msg += `------------------------------\n`;

  const numberEmojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'];

  candidatesList.forEach((candidate, idx) => {
    const numPrefix = numberEmojis[idx] || `[${idx + 1}]`;
    const cat = getCat(candidate);

    msg += `\n${numPrefix} `;
    if (isPlayerAward) {
      const nomCatStr = cat ? ` (${cat.toUpperCase()})` : '';
      const nomTitle = candidate.player_name ? `*${candidate.player_name}${nomCatStr}*` : '*N/A*';
      const teamSuffix = candidate.team_name ? ` - ${candidate.team_name}` : '';
      msg += `${nomTitle}${teamSuffix}\n`;
    } else {
      const teamTitle = candidate.team_name ? `*${candidate.team_name}*` : '*N/A*';
      msg += `${teamTitle}\n`;
    }

    const statsSummary = formatCandidateStatsSummary(candidate, tab);
    if (statsSummary) {
      msg += `📊 ${statsSummary}\n`;
    }
  });

  msg += `\n------------------------------\n`;
  msg += `🎮 *SS League Awards Committee*`;

  return msg;
}

export default function AwardsManagementPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { isCommitteeAdmin, userSeasonId } = usePermissions();

  const [activeTab, setActiveTab] = useState<AwardTab>('POTD');
  const [currentRound, setCurrentRound] = useState(1);
  const [currentWeek, setCurrentWeek] = useState(1);
  const [maxRounds, setMaxRounds] = useState(0);

  const [awards, setAwards] = useState<Award[]>([]);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [selectedCandidate, setSelectedCandidate] = useState<string | null>(null);

  const [playerCategories, setPlayerCategories] = useState<Record<string, string>>({});
  const [copiedCandidateId, setCopiedCandidateId] = useState<string | null>(null);
  const [copiedAllNominees, setCopiedAllNominees] = useState(false);
  const [sortByAI, setSortByAI] = useState(false);

  const [loading_data, setLoadingData] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [tournamentId, setTournamentId] = useState<string>('');
  const [availableTournaments, setAvailableTournaments] = useState<Array<{ id: string, name: string }>>([]);

  useEffect(() => {
    const fetchTournaments = async () => {
      if (!userSeasonId) return;

      try {
        const response = await fetchWithTokenRefresh(`/api/tournaments?season_id=${userSeasonId}`);
        const result = await response.json();

        if (result.success && result.tournaments && result.tournaments.length > 0) {
          const tournaments = result.tournaments.map((t: any) => ({
            id: t.id,
            name: t.tournament_name || t.id
          }));
          setAvailableTournaments(tournaments);

          // Set first tournament as default
          setTournamentId(tournaments[0].id);
          console.log(`<Trophy className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Available tournaments:`, tournaments);
        }
      } catch (err: any) {
        console.error('Error fetching tournaments:', err);
      }
    };

    fetchTournaments();
  }, [userSeasonId]);

  // Fetch player categories for the season
  useEffect(() => {
    const fetchPlayerCategories = async () => {
      if (!userSeasonId) return;

      try {
        const response = await fetchWithTokenRefresh(`/api/player-seasons?season_id=${userSeasonId}`);
        const result = await response.json();

        if (result.players && Array.isArray(result.players)) {
          const map: Record<string, string> = {};
          result.players.forEach((p: any) => {
            if (p.player_id && p.category) {
              map[p.player_id] = p.category;
            }
            if (p.player_name && p.category) {
              map[p.player_name.trim().toLowerCase()] = p.category;
            }
          });
          setPlayerCategories(map);
        }
      } catch (err) {
        console.error('Error fetching player categories:', err);
      }
    };

    fetchPlayerCategories();
  }, [userSeasonId]);

  const getCandidateCategory = (candidate: Candidate) => {
    if (candidate.category) return candidate.category;
    if (candidate.player_id && playerCategories[candidate.player_id]) {
      return playerCategories[candidate.player_id];
    }
    if (candidate.player_name && playerCategories[candidate.player_name.trim().toLowerCase()]) {
      return playerCategories[candidate.player_name.trim().toLowerCase()];
    }
    return '';
  };

  const getCandidateOpponentCategory = (candidate: Candidate) => {
    if (candidate.opponent_category) return candidate.opponent_category;
    if (candidate.opponent_player_id && playerCategories[candidate.opponent_player_id]) {
      return playerCategories[candidate.opponent_player_id];
    }
    if (candidate.opponent_player_name && playerCategories[candidate.opponent_player_name.trim().toLowerCase()]) {
      return playerCategories[candidate.opponent_player_name.trim().toLowerCase()];
    }
    return '';
  };

  const getAwardCategory = (award: Award) => {
    if (award.category) return award.category;
    if (award.player_id && playerCategories[award.player_id]) {
      return playerCategories[award.player_id];
    }
    if (award.player_name && playerCategories[award.player_name.trim().toLowerCase()]) {
      return playerCategories[award.player_name.trim().toLowerCase()];
    }
    return '';
  };

  const getAwardOpponentCategory = (award: Award) => {
    if (award.opponent_category) return award.opponent_category;
    if (award.opponent_player_id && playerCategories[award.opponent_player_id]) {
      return playerCategories[award.opponent_player_id];
    }
    if (award.opponent_player_name && playerCategories[award.opponent_player_name.trim().toLowerCase()]) {
      return playerCategories[award.opponent_player_name.trim().toLowerCase()];
    }
    return '';
  };

  const handleCopyWhatsApp = (candidate: Candidate, e: React.MouseEvent) => {
    e.stopPropagation();
    const cat = getCandidateCategory(candidate);
    const oppCat = getCandidateOpponentCategory(candidate);
    const currentTournament = availableTournaments.find(t => t.id === tournamentId);
    const tournamentName = currentTournament ? currentTournament.name : tournamentId;

    const message = generateNomineeWhatsAppMessage(
      candidate,
      activeTab,
      tournamentName,
      currentRound,
      currentWeek,
      cat,
      oppCat,
      false
    );

    navigator.clipboard.writeText(message);
    const candidateId = candidate.player_id || candidate.team_id || '';
    setCopiedCandidateId(candidateId);
    setTimeout(() => {
      setCopiedCandidateId(null);
    }, 2000);
  };

  const handleCopyWinnerWhatsApp = (award: any) => {
    const cat = getAwardCategory(award);
    const oppCat = getAwardOpponentCategory(award);
    const currentTournament = availableTournaments.find(t => t.id === tournamentId);
    const tournamentName = currentTournament ? currentTournament.name : tournamentId;

    let result = award.result;
    if (!result && award.home_team && award.away_team && award.home_score !== undefined && award.away_score !== undefined) {
      result = `${award.home_team} ${award.home_score}-${award.away_score} ${award.away_team}`;
    }

    let opponentTeamName = award.opponent_team_name;
    if (!opponentTeamName && award.home_team && award.away_team) {
      opponentTeamName = award.team_name === award.home_team ? award.away_team : award.home_team;
    }

    const fakeCandidate: Candidate = {
      player_id: award.player_id,
      player_name: award.player_name,
      team_id: award.team_id,
      team_name: award.team_name,
      opponent_player_id: award.opponent_player_id,
      opponent_player_name: award.opponent_player_name,
      opponent_category: oppCat,
      opponent_team_id: award.opponent_team_id,
      opponent_team_name: opponentTeamName,
      category: cat,
      result: result,
      matchup_result: award.performance_stats?.matchup || award.matchup_result || (award.player_name && award.performance_stats?.goals !== undefined ? `${award.player_name} ${award.performance_stats.goals}-${award.performance_stats.opponent_goals || 0} ${award.opponent_player_name || opponentTeamName || ''}` : result),
      performance_stats: award.performance_stats,
    };

    const message = generateNomineeWhatsAppMessage(
      fakeCandidate,
      activeTab,
      tournamentName,
      award.round_number || currentRound,
      award.week_number || currentWeek,
      cat,
      oppCat,
      true
    );

    navigator.clipboard.writeText(message);
    setCopiedCandidateId(award.id);
    setTimeout(() => {
      setCopiedCandidateId(null);
    }, 2000);
  };

  // Memoize AI performance evaluations for all candidates
  const candidatesWithAI = useMemo(() => {
    return candidates.map(c => {
      const nomCat = getCandidateCategory(c);
      const oppCat = getCandidateOpponentCategory(c);
      const evaluation = evaluateCandidate(c, activeTab, nomCat, oppCat);
      return {
        ...c,
        aiEvaluation: evaluation,
      };
    });
  }, [candidates, activeTab, playerCategories]);

  // Sort candidates primarily by Points (highest to lowest), then by AI rating / Goal Diff / Goals / Clean Sheets
  const sortedCandidates = useMemo(() => {
    return [...candidatesWithAI].sort((a, b) => {
      const ptsA = Number(a.performance_stats?.points ?? 0);
      const ptsB = Number(b.performance_stats?.points ?? 0);
      if (ptsB !== ptsA) {
        return ptsB - ptsA;
      }

      if (sortByAI) {
        const scoreA = a.aiEvaluation?.score ?? 0;
        const scoreB = b.aiEvaluation?.score ?? 0;
        if (scoreB !== scoreA) {
          return scoreB - scoreA;
        }
      }

      const diffA = Number(a.performance_stats?.goal_difference ?? 0);
      const diffB = Number(b.performance_stats?.goal_difference ?? 0);
      if (diffB !== diffA) {
        return diffB - diffA;
      }

      const goalsA = Number(a.performance_stats?.total_goals ?? a.performance_stats?.goals ?? a.performance_stats?.goals_for ?? 0);
      const goalsB = Number(b.performance_stats?.total_goals ?? b.performance_stats?.goals ?? b.performance_stats?.goals_for ?? 0);
      if (goalsB !== goalsA) {
        return goalsB - goalsA;
      }

      const csA = Number(a.performance_stats?.clean_sheets ?? (a.performance_stats?.clean_sheet ? 1 : 0));
      const csB = Number(b.performance_stats?.clean_sheets ?? (b.performance_stats?.clean_sheet ? 1 : 0));
      return csB - csA;
    });
  }, [candidatesWithAI, sortByAI]);

  // Top AI recommended candidate
  const topAIPick = useMemo(() => {
    if (candidatesWithAI.length === 0) return null;
    return [...candidatesWithAI].sort((a, b) => (b.aiEvaluation?.score ?? 0) - (a.aiEvaluation?.score ?? 0))[0];
  }, [candidatesWithAI]);

  const handleCopyAllRoundNominees = () => {
    if (!sortedCandidates || sortedCandidates.length === 0) return;
    const currentTournament = availableTournaments.find(t => t.id === tournamentId);
    const tournamentName = currentTournament ? currentTournament.name : tournamentId;

    const message = generateRoundNomineesWhatsAppMessage(
      sortedCandidates,
      activeTab,
      tournamentName,
      currentRound,
      currentWeek,
      getCandidateCategory,
      getCandidateOpponentCategory
    );

    navigator.clipboard.writeText(message);
    setCopiedAllNominees(true);
    setTimeout(() => {
      setCopiedAllNominees(false);
    }, 2000);
  };

  // Fetch max rounds when tournament changes
  useEffect(() => {
    const fetchMaxRounds = async () => {
      if (!tournamentId) return;

      try {
        const response = await fetchWithTokenRefresh(`/api/fixtures/season?tournament_id=${tournamentId}`);
        const result = await response.json();

        if (result.fixtures && result.fixtures.length > 0) {
          const maxRound = Math.max(...result.fixtures.map((f: any) => f.round_number || 0));
          setMaxRounds(maxRound);
          console.log(`🎮 Found ${maxRound} rounds in tournament ${tournamentId}`);
        } else {
          setMaxRounds(14);
        }
      } catch (err: any) {
        console.error('Error fetching rounds:', err);
        setMaxRounds(14);
      }
    };

    fetchMaxRounds();
  }, [tournamentId]);

  const selectedTournament = useMemo(() => {
    return availableTournaments.find(t => t.id === tournamentId);
  }, [availableTournaments, tournamentId]);

  const availableWeekRanges = useMemo(() => {
    return getWeekRanges(maxRounds, (selectedTournament as any)?.week_ranges);
  }, [maxRounds, selectedTournament]);

  // Calculate current week from round
  useEffect(() => {
    setCurrentWeek(getWeekForRound(currentRound, availableWeekRanges));
  }, [currentRound, availableWeekRanges]);

  // Load awards and candidates when tab/round/week changes
  useEffect(() => {
    if (!userSeasonId || !tournamentId) return;
    loadData();
  }, [activeTab, currentRound, currentWeek, userSeasonId, tournamentId]);

  const loadData = async () => {
    if (!userSeasonId) return;

    setLoadingData(true);
    setError(null);

    try {
      // Load existing award for current context
      const awardParams = new URLSearchParams({
        tournament_id: tournamentId,
        season_id: userSeasonId,
        award_type: activeTab,
      });

      if (['POTD', 'TOD'].includes(activeTab)) {
        awardParams.append('round_number', currentRound.toString());
      } else if (['POTW', 'TOW'].includes(activeTab)) {
        awardParams.append('week_number', currentWeek.toString());
      }

      const awardsRes = await fetchWithTokenRefresh(`/api/awards?${awardParams}`);
      const awardsData = await awardsRes.json();
      setAwards(awardsData.success ? awardsData.data : []);

      // Load eligible candidates (pass skip_award_check=true so candidates are visible even if an award exists)
      const candidateParams = new URLSearchParams({
        tournament_id: tournamentId,
        season_id: userSeasonId,
        award_type: activeTab,
        skip_award_check: 'true',
      });

      if (['POTD', 'TOD'].includes(activeTab)) {
        candidateParams.append('round_number', currentRound.toString());
      } else if (['POTW', 'TOW'].includes(activeTab)) {
        candidateParams.append('week_number', currentWeek.toString());
      }

      const candidatesRes = await fetchWithTokenRefresh(`/api/awards/eligible?${candidateParams}`);
      const candidatesData = await candidatesRes.json();
      setCandidates(candidatesData.success ? candidatesData.data : []);

    } catch (err: any) {
      console.error('Error loading data:', err);
      setError('Failed to load awards data');
    } finally {
      setLoadingData(false);
    }
  };

  const handleSelectAward = async () => {
    if (!selectedCandidate || !userSeasonId || !user) return;

    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const candidate = candidates.find(c =>
        (c.player_id === selectedCandidate) || (c.team_id === selectedCandidate)
      );

      if (!candidate) throw new Error('Candidate not found');

      const payload = {
        award_type: activeTab,
        tournament_id: tournamentId,
        season_id: userSeasonId,
        round_number: ['POTD', 'TOD'].includes(activeTab) ? currentRound : null,
        week_number: ['POTW', 'TOW'].includes(activeTab) ? currentWeek : null,
        player_id: candidate.player_id || null,
        player_name: candidate.player_name || null,
        team_id: candidate.team_id || null,
        team_name: candidate.team_name || null,
        performance_stats: candidate.performance_stats,
        selected_by: user.uid,
        selected_by_name: (user as any).displayName || (user as any).email || '',
        notes: '',
      };

      const response = await fetchWithTokenRefresh('/api/awards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.success) {
        setSuccess(result.message);
        setSelectedCandidate(null);
        loadData(); // Reload to show updated award
      } else {
        setError(result.error);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save award');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteAward = async (awardId: string) => {
    if (!confirm('Are you sure you want to remove this award?')) return;

    try {
      const response = await fetchWithTokenRefresh(`/api/awards?id=${awardId}`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        setSuccess('Award removed successfully');
        loadData();
      } else {
        setError(result.error);
      }
    } catch (err: any) {
      setError('Failed to delete award');
    }
  };

  if (loading || !user || !isCommitteeAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono font-mono">Loading awards console...</p>
        </div>
      </div>
    );
  }

  const currentAward = awards.length > 0 ? awards[0] : null;
  const maxWeeks = Math.ceil(maxRounds / 7);

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Decorative glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/committee"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <Trophy className="w-6 h-6 text-amber-400 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">SYSTEM CONTROL</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Awards Management
              </h1>
              <p className="text-xs text-slate-500 font-mono mt-1">
                Select and manage tournament awards
              </p>
            </div>
          </div>
        </div>

        {/* Tournament Selector */}
        {availableTournaments.length > 0 && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
              Select Tournament
            </label>
            <select
              value={tournamentId}
              onChange={(e) => setTournamentId(e.target.value)}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all duration-200"
            >
              {availableTournaments.map((tournament) => (
                <option key={tournament.id} value={tournament.id}>
                  {tournament.name}
                </option>
              ))}
            </select>
            <p className="mt-2 text-[10px] text-slate-400 uppercase font-bold">
              💡 Awards are specific to each tournament. Select a tournament to view and manage its awards.
            </p>
          </div>
        )}

        {/* Messages */}
        {error && (
          <div className="console-card bg-rose-50 border border-rose-200 rounded-3xl p-5 shadow-sm flex items-center gap-3 text-rose-800">
            <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
            <p className="text-xs font-bold uppercase tracking-wide">{error}</p>
          </div>
        )}

        {success && (
          <div className="console-card bg-emerald-50/30 border border-emerald-200 rounded-3xl p-5 shadow-sm flex items-center gap-3 text-emerald-800">
            <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <p className="text-xs font-bold uppercase tracking-wide">{success}</p>
          </div>
        )}

        {/* Tabs */}
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {[
            { id: 'POTD' as AwardTab, label: 'POTD', icon: Award },
            { id: 'POTW' as AwardTab, label: 'POTW', icon: Trophy },
            { id: 'TOD' as AwardTab, label: 'TOD', icon: Award },
            { id: 'TOW' as AwardTab, label: 'TOW', icon: Trophy },
            { id: 'POTS' as AwardTab, label: 'POTS', icon: Crown },
            { id: 'TOTS' as AwardTab, label: 'TOTS', icon: Crown },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex flex-col sm:flex-row items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl border font-mono text-xs uppercase tracking-wider font-bold transition-all duration-200 cursor-pointer ${
                  activeTab === tab.id
                    ? 'bg-slate-800 border-slate-900 text-white shadow-sm'
                    : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main Content */}
        <div className="space-y-6">
          {/* Round/Week Navigator */}
          {['POTD', 'TOD'].includes(activeTab) && (
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                Select Round
              </label>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCurrentRound(Math.max(1, currentRound - 1))}
                  disabled={currentRound === 1}
                  className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed font-bold transition-all"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <div className="flex-1 overflow-x-auto scrollbar-none py-1">
                  <div className="flex gap-2">
                    {maxRounds > 0 && Array.from({ length: maxRounds }, (_, i) => i + 1).map((round) => (
                      <button
                        key={round}
                        onClick={() => setCurrentRound(round)}
                        className={`px-4 py-2 rounded-xl font-mono text-xs font-bold transition-all ${
                          currentRound === round
                            ? 'bg-slate-800 border-slate-900 text-white shadow-sm'
                            : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                        }`}
                      >
                        Round {round}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => setCurrentRound(Math.min(maxRounds, currentRound + 1))}
                  disabled={currentRound === maxRounds}
                  className="p-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed font-bold transition-all"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {['POTW', 'TOW'].includes(activeTab) && (
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                Select Week
              </label>
              <div className="flex gap-3 flex-wrap">
                {availableWeekRanges.map(({ week, label }) => (
                  <button
                    key={week}
                    onClick={() => setCurrentWeek(week)}
                    className={`px-5 py-2.5 rounded-xl font-mono text-xs font-bold transition-all border text-left flex flex-col justify-center cursor-pointer ${
                      currentWeek === week
                        ? 'bg-slate-800 border-slate-900 text-white shadow-sm'
                        : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                    }`}
                  >
                    <span>Week {week}</span>
                    <span className={`text-[9px] uppercase font-black mt-0.5 block ${
                      currentWeek === week ? 'text-amber-400' : 'text-slate-400'
                    }`}>{label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Current Award Display */}
          {currentAward && (
            <div className="console-card bg-emerald-50/35 border-2 border-emerald-300 rounded-3xl p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <span className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider font-mono">
                    CURRENT WINNER
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-xl font-extrabold text-emerald-800">
                      {currentAward.player_name || currentAward.team_name}
                    </h3>
                    {getAwardCategory(currentAward) && (
                      <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${getCategoryBadgeStyle(getAwardCategory(currentAward))}`}>
                        {getAwardCategory(currentAward)}
                      </span>
                    )}
                    {currentAward.team_name && currentAward.player_name && (
                      <span className="text-xs font-bold text-emerald-600 font-mono">
                        ({currentAward.team_name})
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-emerald-600 font-bold">
                    Selected by {currentAward.selected_by_name}
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                  <button
                    type="button"
                    onClick={() => handleCopyWinnerWhatsApp(currentAward)}
                    className={`px-3.5 py-2.5 rounded-xl font-mono text-xs uppercase font-extrabold shadow-sm transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer border ${
                      copiedCandidateId === currentAward.id
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300 ring-2 ring-emerald-500/20'
                        : 'bg-white hover:bg-emerald-50 text-emerald-700 border-emerald-300'
                    }`}
                    title="Copy Winner WhatsApp Message"
                  >
                    {copiedCandidateId === currentAward.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600" /> Copied Winner!
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 text-emerald-600" /> Copy Winner
                      </>
                    )}
                  </button>
                  <button
                    onClick={() => handleDeleteAward(currentAward.id)}
                    className="w-full sm:w-auto px-4 py-2.5 bg-rose-500 hover:bg-rose-600 text-white rounded-xl font-mono text-xs uppercase font-extrabold shadow-sm transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Remove Award
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Candidates List Section */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-extrabold text-slate-900 uppercase tracking-tight">
                    {['POTD', 'TOD'].includes(activeTab)
                      ? `Round ${currentRound} Nominees`
                      : ['POTW', 'TOW'].includes(activeTab)
                      ? `Week ${currentWeek} Nominees`
                      : 'Eligible Nominees'}{' '}
                    <span className="text-slate-400 font-normal">({candidates.length})</span>
                  </h3>
                  {candidates.length > 0 && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                      <Sparkles className="w-3 h-3 text-amber-500" /> AI Ranked
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-slate-500 font-mono">
                  {candidates.length > 0
                    ? `AI evaluates goals, clean defense, and category tier upset difficulty`
                    : 'No nominees found for this period'}
                </p>
              </div>

              {candidates.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setSortByAI(!sortByAI)}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl font-mono text-xs font-bold transition-all border cursor-pointer ${
                      sortByAI 
                        ? 'bg-amber-50 text-amber-800 border-amber-300 ring-1 ring-amber-400/30' 
                        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                    }`}
                    title="Toggle AI Score Ranking"
                  >
                    <ArrowUpDown className="w-3.5 h-3.5 text-amber-600" />
                    <span>{sortByAI ? 'AI Ranked' : 'Default Sort'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyAllRoundNominees}
                    className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl font-mono text-xs font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer border shadow-sm ${
                      copiedAllNominees
                        ? 'bg-emerald-600 text-white border-emerald-600 ring-2 ring-emerald-500/30'
                        : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300 hover:border-emerald-400'
                    }`}
                    title={`Copy all ${['POTD', 'TOD'].includes(activeTab) ? `Round ${currentRound}` : 'available'} nominees for WhatsApp`}
                  >
                    {copiedAllNominees ? (
                      <>
                        <Check className="w-4 h-4 text-white" />
                        <span>Copied Full Round!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 text-emerald-600" />
                        <span>Copy Broadcast (WhatsApp)</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* AI Top Pick Banner */}
            {topAIPick && topAIPick.aiEvaluation && !loading_data && sortedCandidates.length > 0 && (
              <div className="mb-5 p-4 rounded-2xl bg-gradient-to-r from-amber-500/10 via-amber-100/40 to-slate-50 border border-amber-300/80 shadow-sm relative overflow-hidden">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="space-y-1 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-900 text-amber-300 shadow-xs">
                        <Bot className="w-3 h-3 text-amber-400" /> #1 AI Pick
                      </span>
                      {topAIPick.aiEvaluation.categoryLabel && (
                        <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                          topAIPick.aiEvaluation.isUpset
                            ? 'bg-rose-100 text-rose-800 border border-rose-300'
                            : topAIPick.aiEvaluation.isTopTierClash
                            ? 'bg-purple-100 text-purple-800 border border-purple-300'
                            : 'bg-blue-100 text-blue-800 border border-blue-200'
                        }`}>
                          {topAIPick.aiEvaluation.categoryLabel}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap pt-0.5">
                      <h4 className="text-base font-extrabold text-slate-900">
                        {topAIPick.player_name || topAIPick.team_name}
                      </h4>
                      {getCandidateCategory(topAIPick) && (
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${getCategoryBadgeStyle(getCandidateCategory(topAIPick))}`}>
                          {getCandidateCategory(topAIPick)}
                        </span>
                      )}
                      {topAIPick.team_name && topAIPick.player_name && (
                        <span className="text-xs font-bold text-slate-600 font-mono">
                          ({topAIPick.team_name})
                        </span>
                      )}
                      {formatCandidateStatsSummary(topAIPick, activeTab) && (
                        <span className="text-xs font-mono font-bold text-slate-700 bg-white/80 px-2.5 py-0.5 rounded-md border border-slate-200">
                          📊 {formatCandidateStatsSummary(topAIPick, activeTab)}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-700 font-medium leading-relaxed">
                      💡 {topAIPick.aiEvaluation.reasoning}
                    </p>
                  </div>

                  {!currentAward && (
                    <button
                      type="button"
                      onClick={() => setSelectedCandidate(topAIPick.player_id || topAIPick.team_id || '')}
                      className="shrink-0 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-mono text-xs font-bold uppercase tracking-wider shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
                    >
                      <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                      <span>Select AI Pick</span>
                    </button>
                  )}
                </div>
              </div>
            )}

            {currentAward && (
              <div className="mb-6 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <Info className="w-4 h-4 text-amber-500 flex-shrink-0" />
                <p className="text-[10px] font-bold text-amber-850 uppercase tracking-wider leading-relaxed">
                  An award has already been given for this {['POTD', 'TOD'].includes(activeTab) ? 'round' : 'week'}.
                  You can view and copy nominees, or remove the current award to select a different winner.
                </p>
              </div>
            )}

            {loading_data ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mx-auto"></div>
                <p className="mt-3 text-xs text-slate-550 font-mono font-extrabold uppercase tracking-wider">Loading nominees...</p>
              </div>
            ) : sortedCandidates.length > 0 ? (
              <div className="space-y-3 max-h-[36rem] overflow-y-auto pr-1">
                {sortedCandidates.map((candidate, idx) => {
                  const candidateId = candidate.player_id || candidate.team_id || `candidate-${idx}`;
                  const isSelected = selectedCandidate === candidateId;
                  const category = getCandidateCategory(candidate);
                  const opponentCategory = getCandidateOpponentCategory(candidate);
                  const ai = candidate.aiEvaluation;
                  const statsSummary = formatCandidateStatsSummary(candidate, activeTab);

                  return (
                    <div
                      key={candidateId}
                      onClick={() => {
                        if (!currentAward) setSelectedCandidate(candidateId);
                      }}
                      className={`p-4 rounded-2xl transition-all border ${
                        isSelected
                          ? 'bg-amber-50/50 border-amber-500 ring-2 ring-amber-500/10'
                          : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                      } ${!currentAward ? 'cursor-pointer' : 'cursor-default'}`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex-1 min-w-0 space-y-1.5">
                          {/* Top Row: Rank number & Nominee details */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="w-5 h-5 rounded-full bg-slate-800 text-amber-400 font-mono font-black text-[10px] flex items-center justify-center shrink-0">
                              {idx + 1}
                            </span>
                            <span className="text-[10px] font-black uppercase text-amber-700 font-mono tracking-wider">
                              NOMINEE:
                            </span>
                            <p className="font-extrabold text-sm text-slate-900 truncate">
                              {candidate.player_name || candidate.team_name}
                            </p>
                            {category && (
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider ${getCategoryBadgeStyle(category)}`}>
                                {category}
                              </span>
                            )}
                            {candidate.team_name && candidate.player_name && (
                              <span className="text-[11px] font-bold text-slate-600 font-mono">
                                ({candidate.team_name})
                              </span>
                            )}
                            {ai?.categoryLabel && (
                              <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${
                                ai.isUpset
                                  ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                  : ai.isTopTierClash
                                  ? 'bg-purple-100 text-purple-800 border border-purple-300'
                                  : 'bg-slate-200 text-slate-700'
                              }`}>
                                {ai.categoryLabel}
                              </span>
                            )}
                          </div>

                          {/* Opponent row */}
                          {(candidate.opponent_player_name || candidate.opponent_team_name) && (
                            <div className="flex items-center gap-2 flex-wrap text-xs">
                              <span className="text-[10px] font-black uppercase text-slate-400 font-mono tracking-wider">
                                VS OPPONENT:
                              </span>
                              <span className="font-bold text-slate-700">
                                {candidate.opponent_player_name || candidate.opponent_team_name}
                              </span>
                              {opponentCategory && (
                                <span className={`px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider ${getCategoryBadgeStyle(opponentCategory)}`}>
                                  {opponentCategory}
                                </span>
                              )}
                              {candidate.opponent_team_name && candidate.opponent_player_name && (
                                <span className="text-[11px] font-medium text-slate-500 font-mono">
                                  ({candidate.opponent_team_name})
                                </span>
                              )}
                            </div>
                          )}

                          {statsSummary && (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-700 font-mono font-bold bg-white/70 px-2.5 py-1 rounded-lg border border-slate-200/80 w-fit">
                              <span className="text-[10px] font-black uppercase text-amber-700 font-mono">Stats:</span>
                              <span>{statsSummary}</span>
                            </div>
                          )}

                          {/* AI Reasoning Summary */}
                          {ai?.reasoning && (
                            <p className="text-[11px] text-slate-600 font-medium">
                              🤖 {ai.reasoning}
                            </p>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-2.5 self-start sm:self-center shrink-0">
                          <button
                            type="button"
                            onClick={(e) => handleCopyWhatsApp(candidate, e)}
                            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-mono text-xs font-extrabold uppercase tracking-wider transition-all duration-200 cursor-pointer border ${
                              copiedCandidateId === candidateId
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300 ring-2 ring-emerald-500/20'
                                : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 hover:border-emerald-300 shadow-sm'
                            }`}
                            title="Copy Nominee WhatsApp Message"
                          >
                            {copiedCandidateId === candidateId ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Copied!</span>
                              </>
                            ) : (
                              <>
                                <Copy className="w-3.5 h-3.5 text-emerald-600" />
                                <span>WhatsApp</span>
                              </>
                            )}
                          </button>

                          {isSelected && (
                            <span className="text-amber-700 bg-amber-100 border border-amber-300 px-2.5 py-1 rounded-lg text-[10px] font-black shrink-0 uppercase tracking-wider">
                              Selected
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400">
                <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-4">
                  <Info className="w-6 h-6 text-slate-400" />
                </div>
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-1">
                  No Nominees Available
                </h3>
                <p className="text-xs text-slate-500 font-mono">
                  No completed fixtures or eligible stats found for {['POTD', 'TOD'].includes(activeTab) ? `Round ${currentRound}` : `Week ${currentWeek}`}.
                </p>
                {error && (
                  <p className="text-[10px] text-rose-500 font-mono font-bold mt-2 uppercase">{error}</p>
                )}
              </div>
            )}
          </div>

          {/* Action Button */}
          {candidates.length > 0 && !currentAward && (
            <button
              onClick={handleSelectAward}
              disabled={!selectedCandidate || submitting}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-900 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Select Award Winner</span>
                </>
              )}
            </button>
          )}

          {currentAward && (
            <div className="w-full py-3 bg-slate-100 border border-slate-200 text-slate-400 font-extrabold rounded-xl text-xs uppercase tracking-wider text-center cursor-not-allowed flex items-center justify-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-slate-400" /> Award Already Given - Remove to Select Another
            </div>
          )}
        </div>
      </div>
    </div>
  
    </AuthGuard>
  );
}
