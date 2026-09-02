'use client';

import { SoccerBallIcon } from '@/components/ui/CustomIcons';
import { BarChart2, Calendar, Check, ClipboardList, Clock, Crown, Handshake, Home, Info, Pencil, Save, Search, Star, Trophy, XCircle, AlertTriangle, Plane, RotateCcw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/firebase/config';
import { doc, getDoc, collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { useModal } from '@/hooks/useModal';
import { useAutoLockLineups } from '@/hooks/useAutoLockLineups';
import { useRoundPhaseMonitor } from '@/hooks/useRoundPhaseMonitor';
import AlertModal from '@/components/modals/AlertModal';
import ConfirmModal from '@/components/modals/ConfirmModal';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import LineupDeadlineMonitor from '@/components/LineupDeadlineMonitor';
import BlindLineupSubmission from '@/components/BlindLineupSubmission';
import AuthGuard from '@/components/auth/AuthGuard';
import SearchablePlayerSelect from '@/components/SearchablePlayerSelect';
import PlayerPhoto from '@/components/PlayerPhoto';

const getCategoryPriority = (category?: string): number => {
  if (!category) return 99;
  const cat = category.toLowerCase().trim();
  if (cat.includes('red') || cat === 'r') return 1;
  if (cat.includes('black') || cat === 'bk' || cat === 'blk') return 2;
  if (cat.includes('blue') || cat === 'b') return 3;
  if (cat.includes('white') || cat === 'w') return 4;
  if (cat.includes('icon') || cat.includes('legend') || cat.includes('tier 1') || cat.includes('marquee')) return 1;
  if (cat.includes('tier 2') || cat.includes('classic') || cat.includes('gold')) return 2;
  if (cat.includes('tier 3') || cat.includes('silver')) return 3;
  if (cat.includes('uncapped') || cat.includes('local') || cat.includes('base') || cat.includes('realplayer')) return 5;
  return 10;
};

const getCategoryBadgeClass = (category?: string) => {
  if (!category) return 'bg-slate-100 text-slate-700 border-slate-200';
  const cat = category.toLowerCase().trim();
  if (cat.includes('red') || cat === 'r') {
    return 'bg-red-100 text-red-800 border-red-300 font-extrabold';
  }
  if (cat.includes('black') || cat === 'bk' || cat === 'blk') {
    return 'bg-slate-900 text-white border-slate-700 font-extrabold';
  }
  if (cat.includes('blue') || cat === 'b') {
    return 'bg-blue-100 text-blue-800 border-blue-200 font-bold';
  }
  if (cat.includes('white') || cat === 'w') {
    return 'bg-slate-100 text-slate-700 border-slate-300 font-semibold';
  }
  return 'bg-blue-100 text-blue-800 border-blue-200';
};

interface Matchup {
  home_player_id: string;
  home_player_name: string;
  away_player_id: string;
  away_player_name: string;
  position: number;
  match_duration?: number; // 6, 7, or 8 minutes (eFootball half length)
  home_goals?: number | null;
  away_goals?: number | null;
  result_entered_by?: string | null;
  result_entered_at?: string | null;
  is_null?: boolean; // If true, matchup doesn't count in player stats (but counts for salary & team stats)
  // Substitution tracking
  home_original_player_id?: string;
  home_original_player_name?: string;
  home_substituted?: boolean;
  home_sub_penalty?: number; // Penalty goals awarded to opponent (2 or 3)
  away_original_player_id?: string;
  away_original_player_name?: string;
  away_substituted?: boolean;
  away_sub_penalty?: number; // Penalty goals awarded to opponent (2 or 3)
}

interface Fixture {
  id: string;
  season_id: string;
  round_number: number;
  match_number: number;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  leg: string;
  status: string;
  scheduled_date?: Date;
  lineup_deadline?: string;
  motm_player_id?: string | null;
  motm_player_name?: string | null;
  // Penalty/Fine goals
  home_penalty_goals?: number;
  away_penalty_goals?: number;
  // Knockout fields
  knockout_round?: 'quarter_finals' | 'semi_finals' | 'finals' | 'third_place' | null;
  knockout_format?: 'round_robin' | 'single_matchup' | null;
  scoring_system?: 'goals' | 'wins' | null;
  matchup_mode?: 'manual' | 'blind_lineup' | null;
}

interface RoundDeadlines {
  id: string;
  tournament_id: string;
  round_number: number;
  leg: string;
  scheduled_date: string;
  round_start_time?: string;
  lineup_deadline_time?: string;
  home_fixture_deadline_time: string;
  away_fixture_deadline_time: string;
  home_substitution_deadline_time?: string;
  away_substitution_deadline_time?: string;
  home_substitution_deadline_day_offset?: number;
  away_substitution_deadline_day_offset?: number;
  result_entry_deadline_day_offset: number;
  result_entry_deadline_time: string;
  status: string;
  created_at?: string;
  updated_at?: string;
}

export default function FixturePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const fixtureId = params?.fixtureId as string;

  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [teamId, setTeamId] = useState<string>('');
  const [isHomeTeam, setIsHomeTeam] = useState(false);
  const [roundDeadlines, setRoundDeadlines] = useState<RoundDeadlines | null>(null);
  const [phase, setPhase] = useState<'draft' | 'home_fixture' | 'fixture_entry' | 'result_entry' | 'closed'>('closed');
  const [matchupMode, setMatchupMode] = useState<string>('manual');
  const [isLoading, setIsLoading] = useState(true);
  const [tournamentSystem, setTournamentSystem] = useState<string>('goals'); // 'goals' or 'wins'
  const [scoringSystem, setScoringSystem] = useState<string>('goals'); // Fixture-level scoring system

  // Player data
  const [homePlayers, setHomePlayers] = useState<any[]>([]);
  const [awayPlayers, setAwayPlayers] = useState<any[]>([]);
  const [homeStartingXI, setHomeStartingXI] = useState<any[]>([]);
  const [awayStartingXI, setAwayStartingXI] = useState<any[]>([]);
  // Squad maps state for photo and category lookups
  const [homeSquadById, setHomeSquadById] = useState<Map<string, any>>(new Map());
  const [homeSquadByName, setHomeSquadByName] = useState<Map<string, any>>(new Map());
  const [awaySquadById, setAwaySquadById] = useState<Map<string, any>>(new Map());
  const [awaySquadByName, setAwaySquadByName] = useState<Map<string, any>>(new Map());

  // Matchup state
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [selectedAwayPlayers, setSelectedAwayPlayers] = useState<{ [key: number]: string }>({});
  const [matchDurations, setMatchDurations] = useState<{ [key: number]: number }>({}); // Duration per matchup
  const [isSaving, setIsSaving] = useState(false);
  const [canCreateMatchups, setCanCreateMatchups] = useState(false);
  const [canEditMatchups, setCanEditMatchups] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);

  // Result entry state
  const [matchResults, setMatchResults] = useState<{ [key: number]: { home_goals: number, away_goals: number } }>({});
  const [motmPlayerId, setMotmPlayerId] = useState<string | null>(null);
  const [isResultMode, setIsResultMode] = useState(false);

  // Substitution state
  const [isSubModalOpen, setIsSubModalOpen] = useState(false);
  const [subMatchupIndex, setSubMatchupIndex] = useState<number | null>(null);
  const [subSide, setSubSide] = useState<'home' | 'away' | null>(null);
  const [subNewPlayerId, setSubNewPlayerId] = useState<string>('');
  const [subPenaltyAmount, setSubPenaltyAmount] = useState(2); // Penalty goals to award opponent

  // Swap state
  const [swapMode, setSwapMode] = useState(false);
  const [swapFirstIndex, setSwapFirstIndex] = useState<number | null>(null);

  // Penalty goals state
  const [homePenaltyGoals, setHomePenaltyGoals] = useState(0);
  const [awayPenaltyGoals, setAwayPenaltyGoals] = useState(0);

  // Lineup submission tracking
  const [homeLineupSubmitted, setHomeLineupSubmitted] = useState(false);
  const [awayLineupSubmitted, setAwayLineupSubmitted] = useState(false);
  const [lineupDeadline, setLineupDeadline] = useState<Date | null>(null);
  const [canSubmitLineup, setCanSubmitLineup] = useState(false);
  const [phaseUpdateTrigger, setPhaseUpdateTrigger] = useState(0);

  // Substitution deadline tracking
  const [substitutionDeadline, setSubstitutionDeadline] = useState<Date | null>(null);
  const [canMakeSubstitution, setCanMakeSubstitution] = useState(false);

  // Auto-calculate substitution penalty
  useEffect(() => {
    if (subMatchupIndex === null || !subSide || !subNewPlayerId) {
      return;
    }

    const matchup = matchups[subMatchupIndex];
    const isHome = subSide === 'home';
    const currentPlayerId = isHome ? matchup.home_player_id : matchup.away_player_id;
    
    const playersList = isHome ? homePlayers : awayPlayers;
    const currentPlayer = playersList.find(p => p.player_id === currentPlayerId);
    const newPlayer = playersList.find(p => p.player_id === subNewPlayerId);

    if (currentPlayer && newPlayer) {
      const outCategory = currentPlayer.category || 'classic';
      const inCategory = newPlayer.category || 'classic';

      const priorities: { [key: string]: number } = {
        '1st': 1,
        '2nd': 2,
        '3rd': 3,
        '4th': 4
      };

      const pOut = priorities[outCategory] || 0;
      const pIn = priorities[inCategory] || 0;
      let penalty = 2;

      if (pOut && pIn && pIn < pOut) {
        penalty = 2 + (pOut - pIn);
      }

      setSubPenaltyAmount(penalty);
    }
  }, [subNewPlayerId, subMatchupIndex, subSide, matchups, homePlayers, awayPlayers]);

  // Null matchups state
  const [nullMatchups, setNullMatchups] = useState<Set<number>>(new Set());
  const [isMarkingNull, setIsMarkingNull] = useState(false);

  // Monitor phase changes via WebSocket
  const { isConnected: wsConnected, lastCheck } = useRoundPhaseMonitor({
    seasonId: fixture?.season_id || '',
    enabled: !!fixture?.season_id && !isLoading,
    onPhaseChange: (roundNumber, newPhase) => {
      // Only refresh if this is our round
      if (fixture && roundNumber === fixture.round_number) {
        console.log(`🔄 Phase changed for current fixture: ${newPhase}`);
        setPhaseUpdateTrigger(prev => prev + 1);
      }
    },
  });

  // Auto-recalculate phase every 10 seconds to handle deadline transitions
  useEffect(() => {
    if (!fixture || !roundDeadlines || !roundDeadlines.scheduled_date) return;

    const recalculatePhase = () => {
      const now = new Date();

      // Use scheduled_date or default to today if null
      // scheduled_date might be a full timestamp or just a date string
      // IMPORTANT: Convert to IST date, not UTC date
      let scheduledDateStr = roundDeadlines.scheduled_date;
      if (scheduledDateStr) {
        // Parse the date and convert to IST
        const scheduledDate = new Date(scheduledDateStr);
        // Convert to IST by adding 5:30 hours
        const istDate = new Date(scheduledDate.getTime() + (5.5 * 60 * 60 * 1000));
        scheduledDateStr = istDate.toISOString().split('T')[0];
      } else {
        // Use current date in IST
        const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
        scheduledDateStr = istNow.toISOString().split('T')[0];
      }

      // Validate and default time fields
      const homeTime = roundDeadlines.home_fixture_deadline_time || '17:00';
      const awayTime = roundDeadlines.away_fixture_deadline_time || '17:00';
      const resultTime = roundDeadlines.result_entry_deadline_time || '00:30';

      // Parse all deadlines
      const homeDeadline = new Date(`${scheduledDateStr}T${homeTime}:00+05:30`);
      const awayDeadline = new Date(`${scheduledDateStr}T${awayTime}:00+05:30`);

      const resultDate = new Date(scheduledDateStr);
      resultDate.setDate(resultDate.getDate() + (roundDeadlines.result_entry_deadline_day_offset || 2));
      const resultDateStr = resultDate.toISOString().split('T')[0];
      const resultDeadline = new Date(`${resultDateStr}T${resultTime}:00+05:30`);

      // Calculate phase based on round status and deadlines
      let currentPhase: typeof phase = 'closed';

      // Check round status first
      if (roundDeadlines.status === 'pending' || roundDeadlines.status === 'scheduled') {
        // Round hasn't started yet - stay in draft mode
        currentPhase = 'draft';
      } else if (roundDeadlines.status === 'in_progress' || roundDeadlines.status === 'started' || roundDeadlines.status === 'active') {
        // Round is in progress - determine phase by deadlines
        if (now < homeDeadline) {
          currentPhase = 'home_fixture';     // Home team creates matchups
        } else if (now < awayDeadline) {
          currentPhase = 'fixture_entry';    // Away team reviews, both can finalize
        } else if (now < resultDeadline) {
          currentPhase = 'result_entry';     // Enter results
        } else {
          currentPhase = 'closed';           // Read-only
        }
      } else if (roundDeadlines.status === 'completed' || roundDeadlines.status === 'finalized') {
        // Round is completed
        currentPhase = 'closed';
      } else {
        // Unknown status - default to closed
        currentPhase = 'closed';
      }

      if (currentPhase !== phase) {
        console.log(`⏰ Phase auto-transition: ${phase} {"->"} ${currentPhase} (status: ${roundDeadlines.status})`);
        setPhase(currentPhase);
      }
    };

    // Check immediately
    recalculatePhase();

    // Then check every 10 seconds
    const interval = setInterval(recalculatePhase, 10000);
    return () => clearInterval(interval);
  }, [fixture, roundDeadlines, phase]);

  // Modal system
  const {
    alertState,
    showAlert,
    closeAlert,
    confirmState,
    showConfirm,
    closeConfirm,
    handleConfirm,
  } = useModal();

  // Auto-lock lineups when deadline passes
  useAutoLockLineups(fixtureId, fixture?.lineup_deadline);

  // Function to generate WhatsApp share text
  const generateWhatsAppText = () => {
    if (!fixture || matchups.length === 0) return '';

    const homePlayerGoals = matchups.reduce((sum, m) => sum + (m.home_goals ?? 0), 0);
    const awayPlayerGoals = matchups.reduce((sum, m) => sum + (m.away_goals ?? 0), 0);

    // Calculate substitution penalties (awarded TO opponent)
    const homeSubPenalties = matchups.reduce((sum, m) => sum + (m.home_sub_penalty ?? 0), 0);
    const awaySubPenalties = matchups.reduce((sum, m) => sum + (m.away_sub_penalty ?? 0), 0);

    // Calculate scores based on tournament system
    let homeTotalScore, awayTotalScore, homePlayerScore, awayPlayerScore;
    
    // Use fixture-level scoring_system if available, otherwise fall back to tournament system
    const activeScoring = scoringSystem || tournamentSystem;
    
    if (activeScoring === 'wins') {
      // Win-based scoring: 3 points for win, 1 for draw, 0 for loss
      // Substitution penalties are added to MATCHUP score to determine winner
      let homePoints = 0;
      let awayPoints = 0;
      
      matchups.forEach(m => {
        if (m.home_goals !== null && m.away_goals !== null) {
          // Add substitution penalties to matchup scores
          // home_sub_penalty = penalty awarded TO away (when home subs)
          // away_sub_penalty = penalty awarded TO home (when away subs)
          const homeMatchupScore = (m.home_goals ?? 0) + (m.away_sub_penalty ?? 0);
          const awayMatchupScore = (m.away_goals ?? 0) + (m.home_sub_penalty ?? 0);
          
          if (homeMatchupScore > awayMatchupScore) {
            homePoints += 3; // Home wins this matchup
          } else if (awayMatchupScore > homeMatchupScore) {
            awayPoints += 3; // Away wins this matchup
          } else {
            homePoints += 1; // Draw
            awayPoints += 1; // Draw
          }
        }
      });
      
      homePlayerScore = homePoints;
      awayPlayerScore = awayPoints;
      
      // Add fine/violation penalties to total (these affect final result)
      homeTotalScore = homePoints + homePenaltyGoals;
      awayTotalScore = awayPoints + awayPenaltyGoals;
    } else {
      // Goal-based scoring: sum of all goals
      homePlayerScore = homePlayerGoals;
      awayPlayerScore = awayPlayerGoals;
      homeTotalScore = homePlayerGoals + awaySubPenalties + homePenaltyGoals;
      awayTotalScore = awayPlayerGoals + homeSubPenalties + awayPenaltyGoals;
    }

    const hasResults = matchups.some(m => m.home_goals !== null);
    const winner = hasResults
      ? homeTotalScore > awayTotalScore
        ? fixture.home_team_name
        : awayTotalScore > homeTotalScore
          ? fixture.away_team_name
          : 'DRAW'
      : '';

    // Build Score Breakdown details
    let homeDetails = '';
    if (hasResults) {
      if (activeScoring === 'wins') {
        if (homePenaltyGoals > 0) {
          homeDetails = `\n   - Fine/Violation Goals: +${homePenaltyGoals}`;
        }
      } else {
        const details = [];
        if (awaySubPenalties > 0) {
          details.push(`   - Opponent Sub Penalties: +${awaySubPenalties}`);
        }
        if (homePenaltyGoals > 0) {
          details.push(`   - Fine/Violation Goals: +${homePenaltyGoals}`);
        }
        if (details.length > 0) {
          homeDetails = '\n' + details.join('\n');
        }
      }
    }

    let awayDetails = '';
    if (hasResults) {
      if (activeScoring === 'wins') {
        if (awayPenaltyGoals > 0) {
          awayDetails = `\n   - Fine/Violation Goals: +${awayPenaltyGoals}`;
        }
      } else {
        const details = [];
        if (homeSubPenalties > 0) {
          details.push(`   - Opponent Sub Penalties: +${homeSubPenalties}`);
        }
        if (awayPenaltyGoals > 0) {
          details.push(`   - Fine/Violation Goals: +${awayPenaltyGoals}`);
        }
        if (details.length > 0) {
          awayDetails = '\n' + details.join('\n');
        }
      }
    }

    const motmName = fixture.motm_player_name ? fixture.motm_player_name.toUpperCase() : 'Not selected';

    // Extract season number from season_id (e.g., SSPSLS16 {"->"} 16)
    const seasonMatch = fixture.season_id.match(/\d+$/);
    const seasonNumber = seasonMatch ? seasonMatch[0] : '15';

    // Get knockout round display name
    const knockoutRoundName = fixture.knockout_round
      ? fixture.knockout_round === 'quarter_finals' ? 'QUARTER FINALS'
        : fixture.knockout_round === 'semi_finals' ? 'SEMI FINALS'
          : fixture.knockout_round === 'finals' ? 'FINALS'
            : fixture.knockout_round === 'third_place' ? 'THIRD PLACE PLAYOFF'
              : ''
      : '';

    // Get substitution details
    const substitutions = matchups.filter(m => m.home_substituted || m.away_substituted);
    const hasSubstitutions = substitutions.length > 0;

    // Get substitute players (all players beyond the first 5)
    const homeSubstitutes = homeStartingXI.length > 5 ? homeStartingXI.slice(5) : [];
    const awaySubstitutes = awayStartingXI.length > 5 ? awayStartingXI.slice(5) : [];
    const hasAnySubstitutes = homeSubstitutes.length > 0 || awaySubstitutes.length > 0;

    const text = `*SS PES SUPER LEAGUE - S${seasonNumber}*
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${knockoutRoundName ? `*${knockoutRoundName}* 🏆\n` : `*MATCHDAY ${fixture.round_number}* - ${fixture.leg === 'first' ? '1st' : '2nd'} Leg\n`}*${fixture.home_team_name}*  vs  *${fixture.away_team_name}*
${scoringSystem && scoringSystem !== tournamentSystem ? `⚡ *${scoringSystem === 'wins' ? 'WIN-BASED' : 'GOAL-BASED'} SCORING*\n` : ''}━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*MATCHUPS:*
${matchups.map((m, idx) => {
      // Format player names - show substitute name only (not original)
      const homePlayerDisplay = (m.home_player_name || '').toUpperCase();
      const awayPlayerDisplay = (m.away_player_name || '').toUpperCase();

      let line = '';
      if (hasResults && m.home_goals !== null && m.away_goals !== null) {
        line = `${homePlayerDisplay} *${m.home_goals}-${m.away_goals}* ${awayPlayerDisplay}`;
      } else {
        line = `${homePlayerDisplay} vs ${awayPlayerDisplay}`;
      }
      line += ` (${m.match_duration || 6}min)`;

      return line;
    }).join('\n')}
${hasAnySubstitutes ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*SUBSTITUTES:*
${homeSubstitutes.length > 0 ? `*${fixture.home_team_name}:*\n${homeSubstitutes.map((sub, idx) => `   ${idx + 1}. ${(sub.player_name || '').toUpperCase()}`).join('\n')}` : ''}${homeSubstitutes.length > 0 && awaySubstitutes.length > 0 ? '\n\n' : ''}${awaySubstitutes.length > 0 ? `*${fixture.away_team_name}:*\n${awaySubstitutes.map((sub, idx) => `   ${idx + 1}. ${(sub.player_name || '').toUpperCase()}`).join('\n')}` : ''}
` : ''}${hasSubstitutions ? `━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*SUBSTITUTIONS MADE:*
${substitutions.map(m => {
      let subText = [];
      if (m.home_substituted) {
        subText.push(`⚠️ ${fixture.home_team_name}: ${(m.home_original_player_name || '').toUpperCase()} -> ${(m.home_player_name || '').toUpperCase()} (+${m.home_sub_penalty || 0} penalty to opponent)`);
      }
      if (m.away_substituted) {
        subText.push(`⚠️ ${fixture.away_team_name}: ${(m.away_original_player_name || '').toUpperCase()} -> ${(m.away_player_name || '').toUpperCase()} (+${m.away_sub_penalty || 0} penalty to opponent)`);
      }
      return subText.join('\n');
    }).join('\n')}
` : ''}━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*SCORE BREAKDOWN:*

*${fixture.home_team_name}*
Total: *${hasResults ? homeTotalScore : 0}* ${activeScoring === 'wins' ? 'points' : 'goals'}${homeDetails}

*${fixture.away_team_name}*
Total: *${hasResults ? awayTotalScore : 0}* ${activeScoring === 'wins' ? 'points' : 'goals'}${awayDetails}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
*MAN OF THE MATCH*
${hasResults ? `${motmName}` : 'To be announced'}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${hasResults ? `*RESULT*
${winner === 'DRAW' ? '*MATCH DRAWN*' : `*${winner.toUpperCase()} WON!*`}` : `*Match yet to be played*`}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
_Powered by SS Super League S${seasonNumber} Committee_`;

    return text;
  };

  const handleWhatsAppShare = () => {
    const text = generateWhatsAppText();
    const encodedText = encodeURIComponent(text);
    const whatsappUrl = `https://wa.me/?text=${encodedText}`;
    window.open(whatsappUrl, '_blank');
  };

  // Initial fixture loading effect
  useEffect(() => {
    if (!fixtureId || !user) return;

    const loadFixtureData = async () => {
      try {
        setIsLoading(true);
        console.log('Fetching fixture details for ID:', fixtureId);

        // Fetch fixture data
        const fixtureResponse = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}`);
        if (!fixtureResponse.ok) {
          console.error('Failed to fetch fixture:', fixtureResponse.status);
          setIsLoading(false);
          return;
        }

        const fixtureDataJson = await fixtureResponse.json();
        const f = fixtureDataJson.fixture;
        if (!f) {
          console.error('Fixture data empty');
          setIsLoading(false);
          return;
        }

        setFixture(f);

        // Fallback logo resolution if fixture API returned null logos
        if (!f.home_team_logo || !f.away_team_logo) {
          try {
            const [allTeamsRes, regTeamsRes] = await Promise.all([
              fetch('/api/teams/all-teams'),
              fetch(`/api/teams/registered?season_id=${f.season_id}`)
            ]);

            let teamsList: any[] = [];
            if (allTeamsRes.ok) {
              const j = await allTeamsRes.json();
              teamsList = teamsList.concat(j.data || j.teams || []);
            }
            if (regTeamsRes.ok) {
              const j = await regTeamsRes.json();
              teamsList = teamsList.concat(j.teams || []);
            }

            const homeMatch = teamsList.find((t: any) =>
              t.team_id === f.home_team_id || t.id === f.home_team_id ||
              (t.team_name && f.home_team_name && t.team_name.toLowerCase() === f.home_team_name.toLowerCase()) ||
              (t.name && f.home_team_name && t.name.toLowerCase() === f.home_team_name.toLowerCase())
            );
            const awayMatch = teamsList.find((t: any) =>
              t.team_id === f.away_team_id || t.id === f.away_team_id ||
              (t.team_name && f.away_team_name && t.team_name.toLowerCase() === f.away_team_name.toLowerCase()) ||
              (t.name && f.away_team_name && t.name.toLowerCase() === f.away_team_name.toLowerCase())
            );

            if (homeMatch && !f.home_team_logo) {
              f.home_team_logo = homeMatch.team_logo || homeMatch.logo_url || homeMatch.logoUrl || homeMatch.logoURL || null;
            }
            if (awayMatch && !f.away_team_logo) {
              f.away_team_logo = awayMatch.team_logo || awayMatch.logo_url || awayMatch.logoUrl || awayMatch.logoURL || null;
            }
            setFixture({ ...f });
          } catch (logoErr) {
            console.error('Error resolving fallback team logos:', logoErr);
          }
        }

        // Set team ID & home/away team status
        const currentTeamId = (user as any)?.team_id || (user as any)?.teamId || (user as any)?.team || user?.uid || '';
        const currentTeamName = (user as any)?.team_name || (user as any)?.teamName || (user as any)?.displayName || '';
        const userRole = (user as any)?.role || '';
        const isAdmin = userRole === 'committee_admin' || userRole === 'superadmin' || userRole === 'admin';

        const isHome = f.home_team_id === currentTeamId ||
          (currentTeamName && f.home_team_name && currentTeamName.toLowerCase() === f.home_team_name.toLowerCase()) ||
          isAdmin;

        setTeamId(currentTeamId);
        setIsHomeTeam(isHome);

        if (f.scoring_system) {
          setScoringSystem(f.scoring_system);
        }
        if (f.matchup_mode) {
          setMatchupMode(f.matchup_mode);
        }

        // Fetch round deadlines
        try {
          const deadlinesRes = await fetchWithTokenRefresh(
            `/api/round-deadlines?tournament_id=${f.tournament_id || ''}&round_number=${f.round_number}&leg=${f.leg || 'first'}`
          );
          if (deadlinesRes.ok) {
            const deadlinesJson = await deadlinesRes.json();
            if (deadlinesJson.roundDeadline) {
              setRoundDeadlines(deadlinesJson.roundDeadline);
            }
          }
        } catch (deadlineErr) {
          console.error('Error fetching round deadlines:', deadlineErr);
        }

        // Fetch lineups & matchups in parallel
        try {
          const [homeLineupRes, awayLineupRes, matchupsRes] = await Promise.all([
            fetch(`/api/lineups?fixture_id=${fixtureId}&team_id=${f.home_team_id}`),
            fetch(`/api/lineups?fixture_id=${fixtureId}&team_id=${f.away_team_id}`),
            fetch(`/api/fixtures/${fixtureId}/matchups`)
          ]);

          let homeStarting: any[] = [];
          if (homeLineupRes.ok) {
            const hData = await homeLineupRes.json();
            if (hData.success && hData.lineups && hData.lineups.starting_xi?.length > 0) {
              homeStarting = hData.lineups.starting_xi;
            }
          }

          let awayStarting: any[] = [];
          if (awayLineupRes.ok) {
            const aData = await awayLineupRes.json();
            if (aData.success && aData.lineups && aData.lineups.starting_xi?.length > 0) {
              awayStarting = aData.lineups.starting_xi;
            }
          }

          // Fetch full squad details for Home and Away teams to guarantee player_name, category, and photo_url
          let homeSquadById = new Map();
          let homeSquadByName = new Map();
          if (f.home_team_id) {
            try {
              const hSquadRes = await fetch(`/api/team/${f.home_team_id}/players?seasonId=${f.season_id}`);
              if (hSquadRes.ok) {
                const hSquadJson = await hSquadRes.json();
                const squad = hSquadJson.realplayers || hSquadJson.data || [];
                squad.forEach((p: any) => {
                  const pid = String(p.player_id || p.id);
                  const pname = p.name || p.player_name || '';
                  const item = {
                    player_id: pid,
                    player_name: pname,
                    category: p.category || 'realplayer',
                    photo_url: p.photo_url || p.photoUrl || p.photo || null,
                    photo_position_x_circle: p.photo_position_x_circle ?? null,
                    photo_position_y_circle: p.photo_position_y_circle ?? null,
                    photo_scale_circle: p.photo_scale_circle ?? null
                  };
                  if (pid) homeSquadById.set(pid, item);
                  if (pname) homeSquadByName.set(pname.toLowerCase(), item);
                });
              }
            } catch (hErr) {
              console.error('Error fetching home squad players:', hErr);
            }
          }

          let awaySquadById = new Map();
          let awaySquadByName = new Map();
          if (f.away_team_id) {
            try {
              const aSquadRes = await fetch(`/api/team/${f.away_team_id}/players?seasonId=${f.season_id}`);
              if (aSquadRes.ok) {
                const aSquadJson = await aSquadRes.json();
                const squad = aSquadJson.realplayers || aSquadJson.data || [];
                squad.forEach((p: any) => {
                  const pid = String(p.player_id || p.id);
                  const pname = p.name || p.player_name || '';
                  const item = {
                    player_id: pid,
                    player_name: pname,
                    category: p.category || 'realplayer',
                    photo_url: p.photo_url || p.photoUrl || p.photo || null,
                    photo_position_x_circle: p.photo_position_x_circle ?? null,
                    photo_position_y_circle: p.photo_position_y_circle ?? null,
                    photo_scale_circle: p.photo_scale_circle ?? null
                  };
                  if (pid) awaySquadById.set(pid, item);
                  if (pname) awaySquadByName.set(pname.toLowerCase(), item);
                });
              }
            } catch (aErr) {
              console.error('Error fetching away squad players:', aErr);
            }
          }

          setHomeSquadById(homeSquadById);
          setHomeSquadByName(homeSquadByName);
          setAwaySquadById(awaySquadById);
          setAwaySquadByName(awaySquadByName);

          // Normalize & deduplicate homeStarting XI
          const homeMap = new Map();
          if (homeStarting.length > 0) {
            homeStarting.forEach((item: any) => {
              const pid = typeof item === 'string' ? item : String(item.player_id || item.id || '');
              const pname = typeof item === 'object' ? (item.player_name || item.name) : null;
              const squadMatch = homeSquadById.get(pid) || (pname ? homeSquadByName.get(pname.toLowerCase()) : null);
              const normalized = {
                player_id: pid || squadMatch?.player_id || '',
                player_name: pname || squadMatch?.player_name || 'Unknown Player',
                category: (typeof item === 'object' && item.category) || squadMatch?.category || 'realplayer',
                photo_url: (typeof item === 'object' && item.photo_url) || squadMatch?.photo_url || null,
                photo_position_x_circle: (typeof item === 'object' && item.photo_position_x_circle != null) ? item.photo_position_x_circle : (squadMatch?.photo_position_x_circle ?? null),
                photo_position_y_circle: (typeof item === 'object' && item.photo_position_y_circle != null) ? item.photo_position_y_circle : (squadMatch?.photo_position_y_circle ?? null),
                photo_scale_circle: (typeof item === 'object' && item.photo_scale_circle != null) ? item.photo_scale_circle : (squadMatch?.photo_scale_circle ?? null)
              };
              if (normalized.player_id && !homeMap.has(normalized.player_id)) {
                homeMap.set(normalized.player_id, normalized);
              }
            });
            homeStarting = Array.from(homeMap.values());
          } else {
            homeStarting = Array.from(homeSquadById.values());
          }

          // Normalize & deduplicate awayStarting XI
          const awayMap = new Map();
          if (awayStarting.length > 0) {
            awayStarting.forEach((item: any) => {
              const pid = typeof item === 'string' ? item : String(item.player_id || item.id || '');
              const pname = typeof item === 'object' ? (item.player_name || item.name) : null;
              const squadMatch = awaySquadById.get(pid) || (pname ? awaySquadByName.get(pname.toLowerCase()) : null);
              const normalized = {
                player_id: pid || squadMatch?.player_id || '',
                player_name: pname || squadMatch?.player_name || 'Unknown Player',
                category: (typeof item === 'object' && item.category) || squadMatch?.category || 'realplayer',
                photo_url: (typeof item === 'object' && item.photo_url) || squadMatch?.photo_url || null,
                photo_position_x_circle: (typeof item === 'object' && item.photo_position_x_circle != null) ? item.photo_position_x_circle : (squadMatch?.photo_position_x_circle ?? null),
                photo_position_y_circle: (typeof item === 'object' && item.photo_position_y_circle != null) ? item.photo_position_y_circle : (squadMatch?.photo_position_y_circle ?? null),
                photo_scale_circle: (typeof item === 'object' && item.photo_scale_circle != null) ? item.photo_scale_circle : (squadMatch?.photo_scale_circle ?? null)
              };
              if (normalized.player_id && !awayMap.has(normalized.player_id)) {
                awayMap.set(normalized.player_id, normalized);
              }
            });
            awayStarting = Array.from(awayMap.values());
          } else {
            awayStarting = Array.from(awaySquadById.values());
          }

          // Sort Home & Away players by Category Priority (Tier 1 -> Tier 2 -> Tier 3 -> Tier 4 -> Uncapped)
          homeStarting.sort((a: any, b: any) => {
            const pA = getCategoryPriority(a.category);
            const pB = getCategoryPriority(b.category);
            if (pA !== pB) return pA - pB;
            return (a.player_name || a.name || '').localeCompare(b.player_name || b.name || '');
          });

          awayStarting.sort((a: any, b: any) => {
            const pA = getCategoryPriority(a.category);
            const pB = getCategoryPriority(b.category);
            if (pA !== pB) return pA - pB;
            return (a.player_name || a.name || '').localeCompare(b.player_name || b.name || '');
          });

          setHomeStartingXI(homeStarting);
          setHomePlayers(homeStarting);
          setHomeLineupSubmitted(true);

          setAwayStartingXI(awayStarting);
          setAwayPlayers(awayStarting);
          setAwayLineupSubmitted(true);

          if (matchupsRes.ok) {
            const mData = await matchupsRes.json();
            if (mData.matchups && mData.matchups.length > 0) {
              setMatchups(mData.matchups);
              const resultsInit: { [key: number]: { home_goals: number, away_goals: number } } = {};
              mData.matchups.forEach((m: Matchup) => {
                resultsInit[m.position] = {
                  home_goals: m.home_goals ?? 0,
                  away_goals: m.away_goals ?? 0
                };
              });
              setMatchResults(resultsInit);
            }
          }
        } catch (dataErr) {
          console.error('Error fetching lineups and matchups:', dataErr);
        }

      } catch (error) {
        console.error('Error loading fixture:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadFixtureData();
  }, [fixtureId, user]);

  // Auto-calculate canCreateMatchups state dynamically
  useEffect(() => {
    if (!fixture || !user) return;
    const currentTeamId = (user as any)?.team_id || (user as any)?.teamId || (user as any)?.team || user?.uid || '';
    const currentTeamName = (user as any)?.team_name || (user as any)?.teamName || (user as any)?.displayName || '';
    const userRole = (user as any)?.role || '';
    const isAdmin = userRole === 'committee_admin' || userRole === 'superadmin' || userRole === 'admin';

    const isHome = fixture.home_team_id === currentTeamId ||
      (currentTeamName && fixture.home_team_name && currentTeamName.toLowerCase() === fixture.home_team_name.toLowerCase()) ||
      isAdmin;
    const isAway = fixture.away_team_id === currentTeamId ||
      (currentTeamName && fixture.away_team_name && currentTeamName.toLowerCase() === fixture.away_team_name.toLowerCase());

    setIsHomeTeam(isHome);
    setCanCreateMatchups((isHome || isAway || isAdmin) && matchups.length === 0);

    const hasResultsEntered = matchups.some(m => m.home_goals !== null && m.away_goals !== null);
    const canEdit = (isHome || isAway || isAdmin) && matchups.length > 0 && !hasResultsEntered && phase !== 'closed';
    setCanEditMatchups(canEdit);
  }, [fixture, user, matchups, phase]);

  useEffect(() => {
    if (!fixtureId || !fixture) return;

    // Don't poll when in edit mode or result mode to avoid overwriting user changes
    if (isEditMode || isResultMode) return;

    const pollStatus = async () => {
      try {
        const [homeLineupResponse, awayLineupResponse, matchupsResponse] = await Promise.all([
          fetch(`/api/lineups?fixture_id=${fixtureId}&team_id=${fixture.home_team_id}`),
          fetch(`/api/lineups?fixture_id=${fixtureId}&team_id=${fixture.away_team_id}`),
          fetch(`/api/fixtures/${fixtureId}/matchups`)
        ]);

        if (homeLineupResponse.ok) {
          const homeLineupData = await homeLineupResponse.json();
          const hasHomeLineup = homeLineupData.success && homeLineupData.lineups && homeLineupData.lineups.starting_xi && homeLineupData.lineups.starting_xi.length > 0;
          if (hasHomeLineup) {
            setHomeLineupSubmitted(true);
          } else {
            setHomeLineupSubmitted(true);
          }
        }

        if (awayLineupResponse.ok) {
          const awayLineupData = await awayLineupResponse.json();
          const hasAwayLineup = awayLineupData.success && awayLineupData.lineups && awayLineupData.lineups.starting_xi && awayLineupData.lineups.starting_xi.length > 0;
          if (hasAwayLineup) {
            setAwayLineupSubmitted(true);
          } else {
            setAwayLineupSubmitted(true);
          }
        }

        // Poll matchups - auto-update when created
        if (matchupsResponse.ok) {
          const matchupsData = await matchupsResponse.json();
          if (matchupsData.matchups && matchupsData.matchups.length > 0) {
            // Only update if matchups changed (avoid unnecessary re-renders)
            if (JSON.stringify(matchupsData.matchups) !== JSON.stringify(matchups)) {
              console.log('✨ Matchups updated in real-time');
              setMatchups(matchupsData.matchups);

              // Initialize results if needed
              const resultsInit: { [key: number]: { home_goals: number, away_goals: number } } = {};
              matchupsData.matchups.forEach((m: Matchup) => {
                resultsInit[m.position] = {
                  home_goals: m.home_goals ?? 0,
                  away_goals: m.away_goals ?? 0
                };
              });
              setMatchResults(resultsInit);
            }
          }
        }
      } catch (error) {
        console.error('Error polling status:', error);
      }
    };

    // Poll every 3 seconds for real-time updates
    const interval = setInterval(pollStatus, 3000);
    // Also poll immediately
    pollStatus();

    return () => clearInterval(interval);
  }, [fixtureId, fixture, matchups, isEditMode, isResultMode]);

  const handleCreateMatchups = async () => {
    let hXI = [...homeStartingXI];
    let aXI = [...awayStartingXI];

    if ((hXI.length === 0 || aXI.length === 0) && fixture) {
      if (hXI.length === 0 && fixture.home_team_id) {
        try {
          const hRes = await fetch(`/api/team/${fixture.home_team_id}/players?seasonId=${fixture.season_id}`);
          if (hRes.ok) {
            const hJson = await hRes.json();
            const squad = hJson.realplayers || hJson.data || [];
            hXI = squad.map((p: any) => ({
              player_id: p.player_id || p.id,
              player_name: p.name || p.player_name,
              category: p.category || 'realplayer'
            }));
            setHomeStartingXI(hXI);
            setHomePlayers(hXI);
          }
        } catch (e) {
          console.error('Error auto-loading home team players:', e);
        }
      }

      if (aXI.length === 0 && fixture.away_team_id) {
        try {
          const aRes = await fetch(`/api/team/${fixture.away_team_id}/players?seasonId=${fixture.season_id}`);
          if (aRes.ok) {
            const aJson = await aRes.json();
            const squad = aJson.realplayers || aJson.data || [];
            aXI = squad.map((p: any) => ({
              player_id: p.player_id || p.id,
              player_name: p.name || p.player_name,
              category: p.category || 'realplayer'
            }));
            setAwayStartingXI(aXI);
            setAwayPlayers(aXI);
          }
        } catch (e) {
          console.error('Error auto-loading away team players:', e);
        }
      }
    }

    if (hXI.length === 0 || aXI.length === 0) {
      showAlert({
        type: 'error',
        title: 'Team Players Required',
        message: 'Could not load team players for creating matchups. Please check team registration.'
      });
      return;
    }

    // Validate all matchups are selected
    if (Object.keys(selectedAwayPlayers).length !== hXI.length) {
      showAlert({
        type: 'warning',
        title: 'Incomplete Selection',
        message: 'Please select an away player for each home player'
      });
      return;
    }

    console.log('🏠 Home starting XI:', homeStartingXI.length, 'players');
    console.log('✈️ Away starting XI:', awayStartingXI.length, 'players');
    console.log('🔗 Selected away players:', selectedAwayPlayers);

    setIsSaving(true);
    try {
      // Create matchups from starting XI
      const matchupsToSave: Matchup[] = hXI.map((homePlayer, idx) => ({
        home_player_id: homePlayer.player_id,
        home_player_name: homePlayer.player_name,
        away_player_id: selectedAwayPlayers[idx],
        away_player_name: aXI.find(p => p.player_id === selectedAwayPlayers[idx])?.player_name || '',
        position: idx + 1,
        match_duration: matchDurations[idx] || 6, // Use individual match duration (default 6)
      }));

      console.log('📤 Sending matchups:', {
        count: matchupsToSave.length,
        created_by: user!.uid,
        firstMatchup: matchupsToSave[0]
      });

      const response = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/matchups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchups: matchupsToSave,
          created_by: user!.uid,
          allow_overwrite: false, // Don't allow overwrite - first come first served
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        console.error('Server error:', errorData);

        // Handle race condition - opponent created fixture first
        if (response.status === 409 && errorData.error === 'MATCHUPS_ALREADY_EXIST') {
          showAlert({
            type: 'warning',
            title: 'Fixture Already Created',
            message: 'The opponent has already created the fixture. Refreshing to show their matchups...'
          });

          // Refresh page after 2 seconds to show the created matchups
          setTimeout(() => {
            window.location.reload();
          }, 2000);
          return;
        }

        throw new Error(errorData.details || errorData.error || 'Failed to create matchups');
      }

      showAlert({
        type: 'success',
        title: 'Success',
        message: 'Matchups created successfully from starting XI!'
      });
      window.location.reload();
    } catch (error: any) {
      console.error('Error creating matchups:', error);
      showAlert({
        type: 'error',
        title: 'Creation Failed',
        message: error.message || 'Failed to create matchups'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSwapOpponents = async (position1: number, position2: number) => {
    const newMatchups = [...matchups];
    const temp = newMatchups[position1].away_player_id;
    const tempName = newMatchups[position1].away_player_name;

    newMatchups[position1].away_player_id = newMatchups[position2].away_player_id;
    newMatchups[position1].away_player_name = newMatchups[position2].away_player_name;
    newMatchups[position2].away_player_id = temp;
    newMatchups[position2].away_player_name = tempName;

    try {
      const response = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/matchups`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchups: newMatchups,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to swap opponents');
      }

      setMatchups(newMatchups);
      showAlert({
        type: 'success',
        title: 'Swapped',
        message: 'Opponents swapped successfully!'
      });
    } catch (error) {
      console.error('Error swapping opponents:', error);
      showAlert({
        type: 'error',
        title: 'Swap Failed',
        message: 'Failed to swap opponents'
      });
    }
  };

  const handleSwapMatchups = async (index1: number, index2: number) => {
    setIsSaving(true);
    try {
      const newMatchups = [...matchups];

      // Swap away players
      const tempAwayId = newMatchups[index1].away_player_id;
      const tempAwayName = newMatchups[index1].away_player_name;

      newMatchups[index1].away_player_id = newMatchups[index2].away_player_id;
      newMatchups[index1].away_player_name = newMatchups[index2].away_player_name;
      newMatchups[index2].away_player_id = tempAwayId;
      newMatchups[index2].away_player_name = tempAwayName;

      const response = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/matchups`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchups: newMatchups }),
      });

      if (!response.ok) throw new Error('Failed to swap matchups');

      setMatchups(newMatchups);
      setSwapMode(false);
      setSwapFirstIndex(null);

      showAlert({
        type: 'success',
        title: 'Swapped!',
        message: 'Matchups swapped successfully!'
      });
    } catch (error) {
      console.error('Error swapping:', error);
      showAlert({
        type: 'error',
        title: 'Swap Failed',
        message: 'Failed to swap matchups'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleSubstitution = async () => {
    if (subMatchupIndex === null || !subSide || !subNewPlayerId) return;

    const matchup = matchups[subMatchupIndex];
    const isHome = subSide === 'home';
    const currentPlayerId = isHome ? matchup.home_player_id : matchup.away_player_id;
    const currentPlayerName = isHome ? matchup.home_player_name : matchup.away_player_name;

    // Get new player details
    const playersList = isHome ? homePlayers : awayPlayers;
    const newPlayer = playersList.find(p => p.player_id === subNewPlayerId);
    if (!newPlayer) {
      showAlert({
        type: 'error',
        title: 'Player Not Found',
        message: 'Selected player not found'
      });
      return;
    }

    // Get category as number (1=legend/best, 2=classic/mid, 3=default)
    const getCategoryValue = (player: any): number => {
      // Check category_id first (primary field)
      if (player.category_id?.toUpperCase() === 'LEGEND') return 1;
      if (player.category_id?.toUpperCase() === 'CLASSIC') return 2;

      // Fallback to category field
      if (typeof player.category === 'number') return player.category;
      if (player.category?.toUpperCase() === 'LEGEND') return 1;
      if (player.category?.toUpperCase() === 'CLASSIC') return 2;

      // Check category_name as last resort
      if (player.category_name?.toLowerCase().includes('legend')) return 1;
      if (player.category_name?.toLowerCase().includes('classic')) return 2;

      return 3; // default
    };

    // Use the penalty amount entered by the team (stored in subPenaltyAmount state)
    const totalPenalty = subPenaltyAmount;

    // No separate confirm modal - button in main modal handles confirmation
    setIsSaving(true);
    try {
      const newMatchups = [...matchups];
      if (isHome) {
        newMatchups[subMatchupIndex].home_original_player_id = currentPlayerId;
        newMatchups[subMatchupIndex].home_original_player_name = currentPlayerName;
        newMatchups[subMatchupIndex].home_player_id = subNewPlayerId;
        newMatchups[subMatchupIndex].home_player_name = newPlayer.player_name;
        newMatchups[subMatchupIndex].home_substituted = true;
        newMatchups[subMatchupIndex].home_sub_penalty = totalPenalty;
      } else {
        newMatchups[subMatchupIndex].away_original_player_id = currentPlayerId;
        newMatchups[subMatchupIndex].away_original_player_name = currentPlayerName;
        newMatchups[subMatchupIndex].away_player_id = subNewPlayerId;
        newMatchups[subMatchupIndex].away_player_name = newPlayer.player_name;
        newMatchups[subMatchupIndex].away_substituted = true;
        newMatchups[subMatchupIndex].away_sub_penalty = totalPenalty;
      }

      const response = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/matchups`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchups: newMatchups }),
      });

      if (!response.ok) throw new Error('Failed to substitute');

      setMatchups(newMatchups);
      setIsSubModalOpen(false);
      setSubMatchupIndex(null);
      setSubSide(null);
      setSubNewPlayerId('');

      showAlert({
        type: 'success',
        title: 'Substitution Complete',
        message: `${newPlayer.player_name} substituted in successfully!\n+${totalPenalty} penalty goals awarded to opponent.`
      });
    } catch (error) {
      console.error('Error substituting:', error);
      showAlert({
        type: 'error',
        title: 'Substitution Failed',
        message: 'Failed to substitute player'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleNullMatchup = async (position: number) => {
    if (!user || !fixtureId) return;

    const isCurrentlyNull = nullMatchups.has(position);
    const newIsNull = !isCurrentlyNull;

    try {
      setIsMarkingNull(true);

      const response = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/matchups/mark-null`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchup_positions: [position],
          is_null: newIsNull,
          updated_by: user.uid,
          updated_by_name: (user as any).displayName || user.email
        })
      });

      // Check if response is ok first
      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Failed to toggle null status';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.error || errorData.details || errorMessage;
        } catch {
          // If not JSON, use the text as error message
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }

      // Parse successful response
      const data = await response.json();

      // Update local state
      const newNullMatchups = new Set(nullMatchups);
      if (newIsNull) {
        newNullMatchups.add(position);
      } else {
        newNullMatchups.delete(position);
      }
      setNullMatchups(newNullMatchups);

      // Update matchups array
      setMatchups(prev => prev.map(m =>
        m.position === position ? { ...m, is_null: newIsNull } : m
      ));

      showAlert({
        type: 'success',
        title: newIsNull ? 'Matchup Marked as NULL' : 'Matchup Unmarked',
        message: newIsNull
          ? 'This matchup will not count in player stats but will count for salary and team stats'
          : 'This matchup will now count in player stats'
      });
    } catch (error) {
      console.error('Error toggling null status:', error);
      showAlert({
        type: 'error',
        title: 'Failed',
        message: error instanceof Error ? error.message : 'Failed to toggle null status'
      });
    } finally {
      setIsMarkingNull(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading fixture...</p>
        </div>
      </div>
    );
  }

  if (!user || !fixture) {
    return null;
  }

  const getPhaseInfo = () => {
    switch (phase) {
      case 'draft':
        return {
          label: 'Draft Mode',
          color: 'yellow',
          description: 'Match not scheduled yet. You can prepare and save draft lineups.',
        };
      case 'home_fixture':
        return {
          label: 'Home Fixture Phase',
          color: 'blue',
          description: 'Home team creates match fixtures',
        };
      case 'fixture_entry':
        return {
          label: 'Fixture Entry Phase',
          color: 'purple',
          description: 'Both teams can create match fixtures',
        };
      case 'result_entry':
        return {
          label: 'Result Entry Phase',
          color: 'green',
          description: 'Enter match results',
        };
      case 'closed':
        return {
          label: 'Closed',
          color: 'gray',
          description: 'This fixture is closed',
        };
    }
  };

  const phaseInfo = getPhaseInfo();

  const getSectionDeadlineInfo = () => {
    if (!roundDeadlines) return null;
    const now = new Date();

    let scheduledDateStr = roundDeadlines.scheduled_date;
    if (scheduledDateStr) {
      const scheduledDate = new Date(scheduledDateStr);
      const istDate = new Date(scheduledDate.getTime() + (5.5 * 60 * 60 * 1000));
      scheduledDateStr = istDate.toISOString().split('T')[0];
    } else {
      const istNow = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
      scheduledDateStr = istNow.toISOString().split('T')[0];
    }

    const homeTime = roundDeadlines.home_fixture_deadline_time || '17:00';
    const resultTime = roundDeadlines.result_entry_deadline_time || '00:30';

    const homeDeadline = new Date(`${scheduledDateStr}T${homeTime}:00+05:30`);

    const resultDate = new Date(scheduledDateStr);
    resultDate.setDate(resultDate.getDate() + (roundDeadlines.result_entry_deadline_day_offset || 2));
    const resultDateStr = resultDate.toISOString().split('T')[0];
    const resultDeadline = new Date(`${resultDateStr}T${resultTime}:00+05:30`);

    const isHomeFixtureSet = matchups.length > 0;
    const isPastHomeDeadline = now >= homeDeadline;

    if (!isHomeFixtureSet && !isPastHomeDeadline) {
      return {
        type: 'home_fixture',
        label: 'Home Fixture Deadline',
        deadline: homeDeadline,
        formattedDate: `${scheduledDateStr} at ${homeTime} IST`,
        description: 'Home team must create player matchups before this deadline'
      };
    } else {
      return {
        type: 'result_entry',
        label: 'Final Result Entry Deadline',
        deadline: resultDeadline,
        formattedDate: `${resultDateStr} at ${resultTime} IST`,
        description: isHomeFixtureSet
          ? 'Home matchups submitted! Enter match results before final deadline.'
          : 'Home deadline passed. Enter match results before final deadline.'
      };
    }
  };

  return (
    <AuthGuard requiredRole="team">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>
      <div className="max-w-7xl mx-auto relative z-10 space-y-6">


        {/* Mobile Header (< sm) */}
        <div className="sm:hidden mb-4 space-y-3 font-mono">
          <div className="flex items-center justify-between">
            <Link
              href="/dashboard/team/matches"
              className="inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-[10px] uppercase tracking-wider shadow-sm transition-all"
            >
              {"<-"} Back
            </Link>

            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
              phaseInfo.color === 'yellow' ? 'bg-amber-50 text-amber-700 border-amber-200' :
              phaseInfo.color === 'blue' ? 'bg-blue-50 text-blue-700 border-blue-200' :
              phaseInfo.color === 'purple' ? 'bg-purple-50 text-purple-700 border-purple-200' :
              phaseInfo.color === 'green' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
              'bg-slate-50 text-slate-700 border-slate-200'
            }`}>
              <span className="w-1.5 h-1.5 bg-current rounded-full animate-pulse"></span>
              {phaseInfo.label}
            </span>
          </div>

          {/* Compact Mobile Scoreboard Card */}
          <div className="console-card bg-slate-900 text-white border border-slate-800 rounded-2xl p-3.5 shadow-md">
            {/* Meta Row */}
            <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2.5 pb-2 border-b border-slate-800">
              <span className="text-amber-400">
                {fixture.knockout_round ? fixture.knockout_round.replace('_', ' ').toUpperCase() : `ROUND ${fixture.round_number}`}
              </span>
              <div className="flex items-center gap-2">
                <span>{fixture.leg === 'first' ? '1st' : '2nd'} Leg</span>
                <span>•</span>
                <span>Match #{fixture.match_number}</span>
              </div>
            </div>

            {/* Teams VS Grid */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              {/* Home Team */}
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0">
                  {fixture.home_team_logo ? (
                    <img src={fixture.home_team_logo} alt={fixture.home_team_name} className="w-full h-full object-contain p-0.5" />
                  ) : (
                    <Home className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block leading-none mb-0.5">HOME</span>
                  <span className="text-xs font-black uppercase text-white truncate block">{fixture.home_team_name}</span>
                </div>
              </div>

              {/* VS Badge */}
              <div className="px-2 py-0.5 bg-slate-800 border border-slate-700 text-amber-400 text-[10px] font-black rounded-full">
                VS
              </div>

              {/* Away Team */}
              <div className="flex items-center gap-2 min-w-0 flex-row-reverse text-right">
                <div className="w-8 h-8 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden flex items-center justify-center flex-shrink-0">
                  {fixture.away_team_logo ? (
                    <img src={fixture.away_team_logo} alt={fixture.away_team_name} className="w-full h-full object-contain p-0.5" />
                  ) : (
                    <Plane className="w-4 h-4 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider block leading-none mb-0.5">AWAY</span>
                  <span className="text-xs font-black uppercase text-white truncate block">{fixture.away_team_name}</span>
                </div>
              </div>
            </div>

            {/* Mobile Deadline Summary */}
            {(() => {
              const deadlineInfo = getSectionDeadlineInfo();
              if (!deadlineInfo) return null;
              return (
                <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400 font-medium truncate">{deadlineInfo.label}:</span>
                  <span className="font-extrabold text-amber-300 ml-1 whitespace-nowrap">{deadlineInfo.formattedDate}</span>
                </div>
              );
            })()}
          </div>
        </div>

        {/* Header - Desktop (hidden sm:block) */}
        <div className="hidden sm:block mb-4 sm:mb-6">
          <Link
            href="/dashboard/team/matches"
            className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all mb-4"
          >
            {"<-"} Back to Matches
          </Link>

          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 sm:p-8 shadow-sm overflow-hidden relative">

            {/* Title and Phase Badge */}
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-6 sm:mb-8">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-purple-500 rounded-2xl flex items-center justify-center shadow-lg">
                    <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div>
                    <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">FIXTURE</span>
                    <h1 className="text-2xl font-mono font-bold text-slate-800 uppercase tracking-wide">
                      {fixture.knockout_round ? (
                        <>
                          {fixture.knockout_round === 'quarter_finals' && '<Swords className="w-4 h-4 text-rose-500" /> Quarter Finals'}
                          {fixture.knockout_round === 'semi_finals' && '<Trophy className="w-4 h-4 text-amber-500 fill-amber-500" /> Semi Finals'}
                          {fixture.knockout_round === 'finals' && '<Crown className="w-4 h-4 text-amber-500 fill-amber-500" /> Finals'}
                          {fixture.knockout_round === 'third_place' && '<Trophy className="w-4 h-4 text-amber-700 fill-amber-700" /> Third Place'}
                        </>
                      ) : (
                        `Round ${fixture.round_number}`
                      )}
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                      {fixture.knockout_round && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold rounded-full shadow-sm">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                          </svg>
                          KNOCKOUT
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-bold font-mono uppercase tracking-wider border border-indigo-200 rounded-full">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                        </svg>
                        {fixture.leg === 'first' ? '1st' : '2nd'} Leg
                      </span>
                      {scoringSystem && scoringSystem !== tournamentSystem && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 text-[10px] font-bold font-mono uppercase tracking-wider border border-amber-200 rounded-full">
                          <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clipRule="evenodd" />
                          </svg>
                          {scoringSystem === 'wins' ? 'Win-Based' : 'Goal-Based'} Scoring
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-purple-50 text-purple-700 text-[10px] font-bold font-mono uppercase tracking-wider border border-purple-200 rounded-full">
                        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z" />
                          <path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm3 0a1 1 0 000 2h3a1 1 0 100-2h-3zm-3 4a1 1 0 100 2h.01a1 1 0 100-2H7zm3 0a1 1 0 100 2h3a1 1 0 100-2h-3z" clipRule="evenodd" />
                        </svg>
                        Match #{fixture.match_number}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider border whitespace-nowrap ${
                  phaseInfo.color === 'yellow' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                  phaseInfo.color === 'blue' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                  phaseInfo.color === 'purple' ? 'bg-purple-50 text-purple-700 border-purple-200' :
                  phaseInfo.color === 'green' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                  'bg-slate-50 text-slate-700 border-slate-200'
                }`}>
                  <span className="w-2 h-2 bg-white rounded-full animate-pulse"></span>
                  {phaseInfo.label}
                </span>
              </div>
            </div>

            {/* Teams VS */}
            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-4 sm:gap-6 items-center mb-6 sm:mb-8 font-mono">
              {/* Home Team */}
              <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 hover:border-amber-400/40 transition-all duration-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden flex items-center justify-center shadow-sm flex-shrink-0">
                    {fixture.home_team_logo ? (
                      <img src={fixture.home_team_logo} alt={fixture.home_team_name} className="w-full h-full object-contain p-1" />
                    ) : (
                      <Home className="w-6 h-6 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Home Team</div>
                    <div className="text-lg sm:text-xl font-bold text-slate-800 uppercase tracking-wide truncate">
                      {fixture.home_team_name}
                    </div>
                  </div>
                </div>
              </div>

              {/* VS Badge */}
              <div className="flex justify-center items-center">
                <div className="relative bg-slate-800 text-white rounded-full w-12 h-12 sm:w-16 sm:h-16 flex items-center justify-center text-sm sm:text-base font-black shadow-md border-4 border-slate-200">
                  <span>VS</span>
                </div>
              </div>

              {/* Away Team */}
              <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 hover:border-amber-400/40 transition-all duration-200">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 bg-slate-50 border border-slate-200 rounded-2xl overflow-hidden flex items-center justify-center shadow-sm flex-shrink-0">
                    {fixture.away_team_logo ? (
                      <img src={fixture.away_team_logo} alt={fixture.away_team_name} className="w-full h-full object-contain p-1" />
                    ) : (
                      <Plane className="w-6 h-6 text-slate-400" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Away Team</div>
                    <div className="text-lg sm:text-xl font-bold text-slate-800 uppercase tracking-wide truncate">
                      {fixture.away_team_name}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Phase Info & Section Deadlines Banner */}
            {(() => {
              const deadlineInfo = getSectionDeadlineInfo();
              if (!deadlineInfo) return null;

              return (
                <div className={`hidden sm:block console-card rounded-2xl p-4 sm:p-5 font-mono mb-6 relative overflow-hidden border shadow-sm ${
                  deadlineInfo.type === 'home_fixture'
                    ? 'bg-gradient-to-r from-blue-500/10 via-indigo-500/5 to-transparent border-blue-200'
                    : 'bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border-emerald-200'
                }`}>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-start gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm ${
                        deadlineInfo.type === 'home_fixture'
                          ? 'bg-blue-600 text-white'
                          : 'bg-emerald-600 text-white'
                      }`}>
                        <Clock className="w-5 h-5 animate-pulse" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full ${
                            deadlineInfo.type === 'home_fixture'
                              ? 'bg-blue-100 text-blue-800 border border-blue-200'
                              : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          }`}>
                            {deadlineInfo.label}
                          </span>
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-slate-800 uppercase tracking-wide">
                          ⏰ {deadlineInfo.formattedDate}
                        </h3>
                        <p className="text-xs text-slate-500 font-semibold mt-1">
                          {deadlineInfo.description}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })()}


          </div>
        </div>

        {/* Matchups Section */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 sm:p-8 shadow-sm overflow-hidden relative">
          {/* Decorative elements */}
          <div className="absolute top-0 right-0 w-48 h-48 bg-gradient-to-br from-blue-100 to-indigo-100 rounded-full blur-3xl opacity-20 -z-10"></div>

          <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-slate-800 text-white rounded-xl flex items-center justify-center shadow-sm">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
              <div className="font-mono">
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Player Matchups</h2>
                {matchups.length > 0 && (
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mt-0.5">{matchups.length} matches configured</p>
                )}
              </div>
            </div>
          </div>

          {/* Blind Lineup Submission */}
          {matchupMode === 'blind_lineup' && phase === 'home_fixture' && matchups.length === 0 && (
            <div className="space-y-4">
              <BlindLineupSubmission
                fixtureId={fixtureId}
                teamId={teamId}
                seasonId={fixture?.season_id || ''}
                isHomeTeam={isHomeTeam}
                onSubmitSuccess={() => {
                  // Reload fixture data
                  window.location.reload();
                }}
              />
            </div>
          )}

          {/* Create Matchups (Manual Mode) */}
          {(!matchupMode || matchupMode === 'manual') && canCreateMatchups && matchups.length === 0 && (
            <div className="space-y-3 sm:space-y-4">
              <div className="bg-gradient-to-r from-blue-50 to-blue-100 border border-blue-200 rounded-lg sm:rounded-xl p-3 sm:p-4">
                <div className="flex items-start gap-2 sm:gap-3">
                  <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="text-xs sm:text-sm text-blue-800">
                    <strong className="font-semibold">Create Matchups:</strong> Pair each home player with an away player to set up the match
                  </p>
                </div>
              </div>

              <div className="space-y-3 sm:space-y-4">
                {homeStartingXI.map((homePlayer, idx) => (
                  <div key={idx} className="bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-2xl p-4 shadow-sm hover:shadow-md transition-all font-mono">
                    <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Match #{idx + 1}</span>
                      {homePlayer.category && (
                        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full border ${getCategoryBadgeClass(homePlayer.category)}`}>
                          {homePlayer.category}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4 items-center">
                      {/* Home Player Card */}
                      <div>
                        <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          <Home className="w-3 h-3 text-blue-600" />
                          <span>Home Player</span>
                        </label>
                        <div className="flex items-center gap-3 p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
                          <PlayerPhoto
                            photoUrl={homePlayer.photo_url}
                            playerName={homePlayer.player_name || homePlayer.name || 'Player'}
                            size={40}
                            shape="circle"
                            posXCircle={homePlayer.photo_position_x_circle}
                            posYCircle={homePlayer.photo_position_y_circle}
                            scaleCircle={homePlayer.photo_scale_circle}
                            className="border border-blue-300 flex-shrink-0"
                          />
                          <div className="flex flex-col truncate">
                            <span className="font-extrabold text-sm text-slate-900 truncate">
                              {homePlayer.player_name || homePlayer.name || 'Unknown Player'}
                            </span>
                            {homePlayer.category && (
                              <span className={`inline-block text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border self-start mt-0.5 ${getCategoryBadgeClass(homePlayer.category)}`}>
                                {homePlayer.category}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* VS Badge */}
                      <div className="hidden sm:flex justify-center">
                        <div className="bg-slate-800 text-white rounded-full px-3 py-1 text-xs font-extrabold shadow-sm">VS</div>
                      </div>
                      <div className="sm:hidden text-center">
                        <div className="inline-block bg-slate-200 text-slate-700 rounded-full px-4 py-1 text-xs font-bold">VS</div>
                      </div>

                      {/* Away Player Custom Searchable Select */}
                      <div>
                        <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                          <Plane className="w-3 h-3 text-slate-600" />
                          <span>Away Player</span>
                        </label>
                        <SearchablePlayerSelect
                          players={awayStartingXI
                            .filter(p => !Object.values(selectedAwayPlayers).includes(p.player_id) || selectedAwayPlayers[idx] === p.player_id)
                            .map(p => ({
                              player_id: p.player_id,
                              player_name: p.player_name,
                              category: p.category,
                              photo_url: p.photo_url,
                              photo_position_x_circle: p.photo_position_x_circle,
                              photo_position_y_circle: p.photo_position_y_circle,
                              photo_scale_circle: p.photo_scale_circle,
                            }))
                          }
                          value={selectedAwayPlayers[idx] || ''}
                          onChange={(val) => setSelectedAwayPlayers({ ...selectedAwayPlayers, [idx]: val })}
                          placeholder="Search & select away player..."
                        />
                      </div>
                    </div>

                    {/* Match Duration for this matchup */}
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-2">
                        <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        eFootball Match Duration
                      </label>
                      <select
                        value={matchDurations[idx] || 6}
                        onChange={(e) => setMatchDurations({ ...matchDurations, [idx]: Number(e.target.value) })}
                        className="w-full px-3 py-2 text-sm border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
                      >
                        <option value={6}>6 minutes (3 min per half)</option>
                        <option value={7}>7 minutes (3.5 min per half)</option>
                        <option value={8}>8 minutes (4 min per half)</option>
                        <option value={9}>9 minutes (4.5 min per half)</option>
                        <option value={10}>10 minutes (5 min per half)</option>
                        <option value={11}>11 minutes (5.5 min per half)</option>
                        <option value={12}>12 minutes (6 min per half)</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              <button
                onClick={handleCreateMatchups}
                disabled={isSaving}
                className="w-full inline-flex items-center justify-center px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Creating...
                  </span>
                ) : (
                  'Create Matchups'
                )}
              </button>
            </div>
          )}

          {/* Display/Edit Existing Matchups */}
          {matchups.length > 0 && (
            <div className="space-y-4">

              {/* Share Buttons */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {/* WhatsApp Share Button */}
                <button
                  onClick={handleWhatsAppShare}
                  className="relative overflow-hidden w-full inline-flex items-center justify-center px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/60 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all"
                >
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                    </svg>
                    <span>Share via WhatsApp</span>
                  </div>
                </button>

                {/* Copy to Clipboard Button */}
                <button
                  onClick={() => {
                    const text = generateWhatsAppText();
                    navigator.clipboard.writeText(text).then(() => {
                      showAlert({
                        type: 'success',
                        title: 'Copied!',
                        message: 'Match details copied to clipboard'
                      });
                    }).catch(() => {
                      showAlert({
                        type: 'error',
                        title: 'Copy Failed',
                        message: 'Failed to copy to clipboard'
                      });
                    });
                  }}
                  className="relative overflow-hidden w-full inline-flex items-center justify-center px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/60 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all"
                >
                  <div className="flex items-center gap-3">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>Copy Match Details</span>
                  </div>
                </button>
              </div>

              {/* Edit Button */}
              {canEditMatchups && !isEditMode && (
                <button
                  onClick={() => setIsEditMode(true)}
                  className="relative overflow-hidden w-full inline-flex items-center justify-center px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all"
                >
                  <div className="flex items-center gap-2">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <span>Edit Matchups</span>
                  </div>
                </button>
              )}

              {canEditMatchups && isEditMode ? (
                // Edit Mode
                <>
                  <div className="console-card bg-slate-50 border border-slate-200/60 rounded-2xl p-5 mb-4 shadow-sm font-mono relative overflow-hidden">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-slate-800 text-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs text-slate-800 font-bold uppercase tracking-wider mb-1">📝 Edit Mode Active</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Change away player assignments and match durations</p>
                      </div>
                    </div>
                  </div>

                  {matchups.map((matchup, idx) => (
                    <div key={idx} className="group relative p-5 bg-gradient-to-br from-white to-gray-50 border-2 border-gray-200 rounded-2xl space-y-4 hover:shadow-xl hover:border-indigo-300 transition-all font-mono">
                      <div className="flex items-center justify-between mb-2">
                        <span className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-700 text-xs font-bold rounded-full">
                          Match #{matchup.position}
                        </span>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
                        {/* Home Player */}
                        <div>
                          <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            <Home className="w-3 h-3 text-blue-600" />
                            <span>Home Player</span>
                          </label>
                          {(() => {
                            const homeMatch = homeSquadById.get(matchup.home_player_id) || homeSquadByName.get(matchup.home_player_name?.toLowerCase());
                            const homeCategory = matchup.home_category || homeMatch?.category;
                            return (
                              <div className="flex items-center gap-3 p-3 bg-blue-50/70 border border-blue-200 rounded-xl">
                                <PlayerPhoto
                                  photoUrl={homeMatch?.photo_url || matchup.home_photo_url}
                                  playerName={matchup.home_player_name}
                                  size={40}
                                  shape="circle"
                                  posXCircle={homeMatch?.photo_position_x_circle}
                                  posYCircle={homeMatch?.photo_position_y_circle}
                                  scaleCircle={homeMatch?.photo_scale_circle}
                                  className="border border-blue-300 flex-shrink-0"
                                />
                                <div className="flex flex-col truncate">
                                  <span className="font-extrabold text-sm text-slate-900 truncate">
                                    {matchup.home_player_name}
                                  </span>
                                  {homeCategory && (
                                    <span className={`inline-block text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border self-start mt-0.5 ${getCategoryBadgeClass(homeCategory)}`}>
                                      {homeCategory}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>

                        {/* VS */}
                        <div className="flex justify-center">
                          <div className="bg-slate-800 text-white rounded-full px-3 py-1 text-xs font-black shadow-sm">VS</div>
                        </div>

                        {/* Away Player Dropdown */}
                        <div className="md:col-span-2">
                          <label className="flex items-center gap-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                            <Plane className="w-3 h-3 text-slate-600" />
                            <span>Away Player</span>
                          </label>
                          <SearchablePlayerSelect
                            players={awayStartingXI
                              .filter(p => !matchups.some((m, mIdx) => mIdx !== idx && m.away_player_id === p.player_id))
                              .map(p => ({
                                player_id: p.player_id,
                                player_name: p.player_name,
                                category: p.category,
                                photo_url: p.photo_url,
                                photo_position_x_circle: p.photo_position_x_circle,
                                photo_position_y_circle: p.photo_position_y_circle,
                                photo_scale_circle: p.photo_scale_circle,
                              }))
                            }
                            value={matchup.away_player_id || ''}
                            onChange={(val) => {
                              const newMatchups = [...matchups];
                              const selectedPlayer = awayStartingXI.find(p => p.player_id === val);
                              newMatchups[idx].away_player_id = val;
                              newMatchups[idx].away_player_name = selectedPlayer?.player_name || '';
                              setMatchups(newMatchups);
                            }}
                            placeholder="Search & select away player..."
                          />
                        </div>
                      </div>

                      {/* Match Duration */}
                      <div className="pt-3 border-t border-gray-200">
                        <label className="block text-xs font-medium text-gray-600 mb-1.5 flex items-center gap-2">
                          <svg className="w-4 h-4 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          eFootball Match Duration
                        </label>
                        <select
                          value={matchup.match_duration ?? 6}
                          onChange={(e) => {
                            const newMatchups = [...matchups];
                            newMatchups[idx].match_duration = Number(e.target.value);
                            setMatchups(newMatchups);
                          }}
                          className="w-full px-3 py-2 text-sm border border-green-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white"
                        >
                          <option value={6}>6 minutes (3 min per half)</option>
                          <option value={7}>7 minutes (3.5 min per half)</option>
                          <option value={8}>8 minutes (4 min per half)</option>
                          <option value={9}>9 minutes (4.5 min per half)</option>
                          <option value={10}>10 minutes (5 min per half)</option>
                          <option value={11}>11 minutes (5.5 min per half)</option>
                          <option value={12}>12 minutes (6 min per half)</option>
                        </select>
                      </div>
                    </div>
                  ))}

                  <div className="flex gap-3">
                    <button
                      onClick={() => setIsEditMode(false)}
                      disabled={isSaving}
                      className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="flex items-center justify-center gap-2">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                        </svg>
                        Cancel
                      </span>
                    </button>
                    <button
                      onClick={async () => {
                        setIsSaving(true);
                        try {
                          const response = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/matchups`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ matchups }),
                          });
                          if (!response.ok) throw new Error('Failed to update matchups');
                          showAlert({
                            type: 'success',
                            title: 'Updated',
                            message: 'Matchups updated successfully!'
                          });
                          setIsEditMode(false);
                          window.location.reload();
                        } catch (error) {
                          console.error('Error updating matchups:', error);
                          showAlert({
                            type: 'error',
                            title: 'Update Failed',
                            message: 'Failed to update matchups'
                          });
                        } finally {
                          setIsSaving(false);
                        }
                      }}
                      disabled={isSaving}
                      className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="flex items-center justify-center gap-2">
                        {isSaving ? (
                          <>
                            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Saving...
                          </>
                        ) : (
                          <>
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            Save Changes
                          </>
                        )}
                      </span>
                    </button>
                  </div>
                </>
              ) : phase === 'result_entry' && !isResultMode ? (
                // View Mode with Results + Enter Results Button
                <div className="space-y-4">
                  {/* Team Totals & Winner */}
                  {matchups.some(m => m.home_goals !== null) && (() => {
                    // Calculate player goals from matchups
                    const homePlayerGoals = matchups.reduce((sum, m) => sum + (m.home_goals ?? 0), 0);
                    const awayPlayerGoals = matchups.reduce((sum, m) => sum + (m.away_goals ?? 0), 0);

                    // Calculate substitution penalties (awarded TO opponent)
                    const homeSubPenalties = matchups.reduce((sum, m) => sum + (m.home_sub_penalty ?? 0), 0);
                    const awaySubPenalties = matchups.reduce((sum, m) => sum + (m.away_sub_penalty ?? 0), 0);

                    // Calculate scores based on tournament system
                    let homeTotalScore, awayTotalScore;
                    
                    if (tournamentSystem === 'wins') {
                      // Win-based scoring: 3 points for win, 1 for draw, 0 for loss
                      // Substitution penalties are added to MATCHUP score to determine winner
                      let homePoints = 0;
                      let awayPoints = 0;
                      
                      matchups.forEach(m => {
                        if (m.home_goals !== null && m.away_goals !== null) {
                          // Add substitution penalties to matchup scores
                          // home_sub_penalty = penalty awarded TO away (when home subs)
                          // away_sub_penalty = penalty awarded TO home (when away subs)
                          const homeMatchupScore = (m.home_goals ?? 0) + (m.away_sub_penalty ?? 0);
                          const awayMatchupScore = (m.away_goals ?? 0) + (m.home_sub_penalty ?? 0);
                          
                          if (homeMatchupScore > awayMatchupScore) {
                            homePoints += 3; // Home wins this matchup
                          } else if (awayMatchupScore > homeMatchupScore) {
                            awayPoints += 3; // Away wins this matchup
                          } else {
                            homePoints += 1; // Draw
                            awayPoints += 1; // Draw
                          }
                        }
                      });
                      
                      homeTotalScore = homePoints;
                      awayTotalScore = awayPoints;
                    } else {
                      // Goal-based scoring (default): Sum of goals + opponent's sub penalties + fines
                      const homeFinePenalties = (fixture?.home_fine_goals || 0);
                      const awayFinePenalties = (fixture?.away_fine_goals || 0);

                      homeTotalScore = homePlayerGoals + awaySubPenalties + homeFinePenalties;
                      awayTotalScore = awayPlayerGoals + homeSubPenalties + awayFinePenalties;
                    }

                    const homeWonFixture = homeTotalScore > awayTotalScore;
                    const awayWonFixture = awayTotalScore > homeTotalScore;
                    const isDrawFixture = homeTotalScore === awayTotalScore;

                    const homeFineGoals = (fixture?.home_fine_goals || 0);
                    const awayPenaltyGoals = (fixture?.away_fine_goals || 0);

                    return (
                      <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm font-mono relative overflow-hidden">
                        <div className="text-center text-xs font-extrabold text-slate-400 uppercase tracking-widest mb-4">
                          🏆 {tournamentSystem === 'wins' ? 'Points Summary (Win-Based System)' : 'Final Score Summary (Goal-Based System)'}
                        </div>
                        <div className="flex items-center justify-center gap-6 sm:gap-12">
                          {/* Home Score */}
                          <div className="text-center">
                            <div className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                              {fixture.home_team_name}
                            </div>
                            <div className={`text-4xl sm:text-5xl font-black ${
                              homeWonFixture ? 'text-emerald-600' : isDrawFixture ? 'text-amber-600' : 'text-slate-400'
                            }`}>
                              {homeTotalScore}
                            </div>
                            {tournamentSystem === 'goals' && (
                              (awaySubPenalties > 0 || homeFineGoals > 0) && (
                                <div className="text-xs mt-2 opacity-90">
                                  ({homePlayerGoals}
                                  {awaySubPenalties > 0 && ` +${awaySubPenalties}s`}
                                  {homeFineGoals > 0 && ` +${homeFineGoals}f`})
                                </div>
                              )
                            )}
                          </div>

                          <div className="text-2xl font-black text-slate-300 font-sans">
                            -
                          </div>

                          {/* Away Score */}
                          <div className="text-center">
                            <div className="text-xs font-extrabold text-slate-500 uppercase tracking-wider mb-1">
                              {fixture.away_team_name}
                            </div>
                            <div className={`text-4xl sm:text-5xl font-black ${
                              awayWonFixture ? 'text-emerald-600' : isDrawFixture ? 'text-amber-600' : 'text-slate-400'
                            }`}>
                              {awayTotalScore}
                            </div>
                            {tournamentSystem === 'goals' && (
                              (homeSubPenalties > 0 || awayPenaltyGoals > 0) && (
                                <div className="text-xs mt-2 opacity-90">
                                  ({awayPlayerGoals}
                                  {homeSubPenalties > 0 && ` +${homeSubPenalties}s`}
                                  {awayPenaltyGoals > 0 && ` +${awayPenaltyGoals}f`})
                                </div>
                              )
                            )}
                          </div>
                        </div>
                        {/* Legend - only show for goal-based system */}
                        {tournamentSystem === 'goals' && (homeSubPenalties > 0 || awaySubPenalties > 0 || homeFineGoals > 0 || awayPenaltyGoals > 0) && (
                          <div className="text-center text-xs text-gray-600 pt-2 border-t border-gray-300">
                            s = sub penalty, f = fine
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Man of the Match Display */}
                  {fixture.motm_player_name && (
                    <div className="console-card bg-white border border-amber-300 rounded-2xl p-4 font-mono shadow-sm bg-gradient-to-r from-amber-500/5 to-amber-500/10">
                      <div className="flex items-center justify-center gap-3">
                        <div>
                          <div className="text-[10px] font-bold text-amber-600 uppercase tracking-wider text-center"><Trophy className="w-4 h-4 text-amber-500 fill-amber-500 inline" /> Man of the Match</div>
                          <div className="text-base font-bold text-slate-800 uppercase tracking-wide text-center mt-0.5">{fixture.motm_player_name}</div>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {matchups.map((matchup, idx) => {
                      const hasResult = matchup.home_goals !== null && matchup.away_goals !== null;
                      const homeWon = hasResult && matchup.home_goals! > matchup.away_goals!;
                      const awayWon = hasResult && matchup.away_goals! > matchup.home_goals!;
                      const isDraw = hasResult && matchup.home_goals === matchup.away_goals;
                      const isPOTD = fixture.motm_player_id && (fixture.motm_player_id === matchup.home_player_id || fixture.motm_player_id === matchup.away_player_id);
                      const homePOTD = fixture.motm_player_id === matchup.home_player_id;
                      const awayPOTD = fixture.motm_player_id === matchup.away_player_id;

                      const homeMatch = homeSquadById.get(matchup.home_player_id) || homeSquadByName.get(matchup.home_player_name?.toLowerCase());
                      const awayMatch = awaySquadById.get(matchup.away_player_id) || awaySquadByName.get(matchup.away_player_name?.toLowerCase());

                      const homeCategory = matchup.home_category || homeMatch?.category;
                      const awayCategory = matchup.away_category || awayMatch?.category;

                      return (
                        <div key={idx} className={`console-card bg-white border rounded-2xl p-4 transition-all font-mono hover:border-amber-400/40 duration-200 ${isPOTD ? 'border-amber-300 shadow-sm bg-gradient-to-r from-amber-500/5 to-amber-500/10' : 'border-slate-200/60 shadow-sm'
                          }`}>
                          {/* Match Header */}
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2.5 py-1 bg-gray-800 text-white text-xs font-bold rounded-lg">
                                Match #{matchup.position}
                              </span>
                              {matchup.match_duration && (
                                <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-md">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                                  </svg>
                                  {matchup.match_duration} min
                                </span>
                              )}
                            </div>
                            {isPOTD && (
                              <div className="flex items-center gap-1 px-3 py-1 bg-yellow-400 text-yellow-900 rounded-full text-xs font-bold shadow-md">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                </svg>
                                MOTM
                              </div>
                            )}
                          </div>

                          {/* Substitution Warnings */}
                          {(matchup.home_substituted || matchup.away_substituted) && (
                            <div className="mb-3 p-3 bg-orange-50/20 border border-orange-200 rounded-xl font-mono">
                              <div className="flex items-start gap-2">
                                <svg className="w-5 h-5 text-orange-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                                <div className="flex-1 text-xs">
                                  <p className="font-semibold text-orange-900 mb-1"><AlertTriangle className="w-3 h-3 inline text-orange-500 mr-1" /> Substitution Penalties Applied</p>
                                  {matchup.home_substituted && (
                                    <p className="text-orange-700 mb-0.5">
                                      <RotateCcw className="w-3 h-3 inline text-orange-500 mr-1" /> Home: {matchup.home_original_player_name} {"->"} {matchup.home_player_name}
                                      <span className="font-bold ml-1">(+{matchup.home_sub_penalty || 0} goals to {fixture.away_team_name})</span>
                                    </p>
                                  )}
                                  {matchup.away_substituted && (
                                    <p className="text-orange-700">
                                      🔁 Away: {matchup.away_original_player_name} {"->"} {matchup.away_player_name}
                                      <span className="font-bold ml-1">(+{matchup.away_sub_penalty || 0} goals to {fixture.home_team_name})</span>
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Main Matchup Display */}
                          <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-3 sm:gap-4 items-center">
                            {/* Home Player */}
                            <div className={`p-3 rounded-xl border transition-all ${homePOTD ? 'bg-amber-50/60 border-amber-300' :
                              homeWon ? 'bg-emerald-50/30 border-emerald-200' :
                                isDraw ? 'bg-slate-50 border-slate-200' :
                                  awayWon ? 'bg-red-50/20 border-red-200' :
                                    'bg-slate-50 border-slate-200'
                              }`}>
                              <div className="flex items-center gap-3">
                                <PlayerPhoto
                                  photoUrl={homeMatch?.photo_url || matchup.home_photo_url}
                                  playerName={matchup.home_player_name}
                                  size={40}
                                  shape="circle"
                                  posXCircle={homeMatch?.photo_position_x_circle}
                                  posYCircle={homeMatch?.photo_position_y_circle}
                                  scaleCircle={homeMatch?.photo_scale_circle}
                                  className="border border-blue-300 flex-shrink-0"
                                />
                                <div className="flex flex-col min-w-0 text-left">
                                  <div className="flex items-center gap-1">
                                    {homePOTD && (
                                      <svg className="w-3 h-3 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                      </svg>
                                    )}
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{fixture.home_team_name}</span>
                                  </div>
                                  <span className={`font-extrabold text-sm text-slate-900 truncate ${homePOTD ? 'text-amber-900' : ''}`}>
                                    {matchup.home_player_name}
                                  </span>
                                  {homeCategory && (
                                    <span className={`inline-block text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border self-start mt-0.5 ${getCategoryBadgeClass(homeCategory)}`}>
                                      {homeCategory}
                                    </span>
                                  )}
                                  {hasResult && (
                                    <div className="mt-1.5">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-xs ${
                                        homeWon ? 'bg-emerald-500 text-white' : isDraw ? 'bg-slate-400 text-white' : 'bg-red-100 text-red-700'
                                      }`}>
                                        {homeWon ? '🎉 Won' : isDraw ? '◆ Draw' : '✗ Lost'} ({matchup.home_goals} goals)
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Score Badge */}
                            <div className="flex flex-col items-center gap-1 sm:gap-2 order-first sm:order-none">
                              {hasResult ? (
                                <>
                                  <div className={`px-3.5 py-1.5 rounded-xl font-bold text-base font-mono shadow-sm border ${isDraw ? 'bg-amber-500 text-white border-amber-600' :
                                    'bg-slate-800 text-white border-slate-900'
                                    }`}>
                                    {matchup.home_goals} - {matchup.away_goals}
                                  </div>
                                  {!isDraw && (
                                    <div className="hidden sm:flex items-center gap-1 text-xs font-semibold text-gray-600">
                                      <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-8.707l-3-3a1 1 0 00-1.414 1.414L10.586 9H7a1 1 0 100 2h3.586l-1.293 1.293a1 1 0 101.414 1.414l3-3a1 1 0 000-1.414z" clipRule="evenodd" />
                                      </svg>
                                      {matchup.home_player_name} {homeWon ? 'beat' : 'lost to'} {matchup.away_player_name}
                                    </div>
                                  )}
                                </>
                              ) : (
                                <div className="bg-slate-800 text-white rounded-full px-3.5 py-1 text-xs font-black shadow-sm">VS</div>
                              )}
                            </div>

                            {/* Away Player */}
                            <div className={`p-3 rounded-xl border transition-all ${awayPOTD ? 'bg-amber-50/60 border-amber-300' :
                              awayWon ? 'bg-emerald-50/30 border-emerald-200' :
                                isDraw ? 'bg-slate-50 border-slate-200' :
                                  homeWon ? 'bg-red-50/20 border-red-200' :
                                    'bg-slate-50 border-slate-200'
                              }`}>
                              <div className="flex items-center gap-3 flex-row-reverse sm:flex-row">
                                <PlayerPhoto
                                  photoUrl={awayMatch?.photo_url || matchup.away_photo_url}
                                  playerName={matchup.away_player_name}
                                  size={40}
                                  shape="circle"
                                  posXCircle={awayMatch?.photo_position_x_circle}
                                  posYCircle={awayMatch?.photo_position_y_circle}
                                  scaleCircle={awayMatch?.photo_scale_circle}
                                  className="border border-slate-300 flex-shrink-0"
                                />
                                <div className="flex flex-col min-w-0 text-right sm:text-left">
                                  <div className="flex items-center justify-end sm:justify-start gap-1">
                                    {awayPOTD && (
                                      <svg className="w-3 h-3 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                                        <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                      </svg>
                                    )}
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{fixture.away_team_name}</span>
                                  </div>
                                  <span className={`font-extrabold text-sm text-slate-900 truncate ${awayPOTD ? 'text-amber-900' : ''}`}>
                                    {matchup.away_player_name}
                                  </span>
                                  {awayCategory && (
                                    <span className={`inline-block text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border self-end sm:self-start mt-0.5 ${getCategoryBadgeClass(awayCategory)}`}>
                                      {awayCategory}
                                    </span>
                                  )}
                                  {hasResult && (
                                    <div className="mt-1.5">
                                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-bold text-xs ${
                                        awayWon ? 'bg-emerald-500 text-white' : isDraw ? 'bg-slate-400 text-white' : 'bg-red-100 text-red-700'
                                      }`}>
                                        {awayWon ? '🎉 Won' : isDraw ? '◆ Draw' : '✗ Lost'} ({matchup.away_goals} goals)
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>

                          {/* Match Stats Summary - Hidden on mobile */}
                          {hasResult && (
                            <div className="hidden sm:block mt-3 pt-3 border-t border-gray-200">
                              <div className="flex items-center justify-center gap-4 text-xs text-gray-600">
                                <div className="flex items-center gap-1">
                                  <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                  </svg>
                                  <span><strong>Goal Diff:</strong> {matchup.home_player_name} {matchup.home_goals! > matchup.away_goals! ? '+' : ''}{matchup.home_goals! - matchup.away_goals!}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                  <svg className="w-4 h-4 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                  </svg>
                                  <span><strong>Goal Diff:</strong> {matchup.away_player_name} {matchup.away_goals! > matchup.home_goals! ? '+' : ''}{matchup.away_goals! - matchup.home_goals!}</span>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Enter/Edit Results Button - Only visible during result_entry phase */}
                  {phase === 'result_entry' && (
                    <button
                      onClick={() => {
                        // Initialize results from existing data
                        const initialResults: any = {};
                        matchups.forEach((m, idx) => {
                          initialResults[idx] = {
                            home_goals: m.home_goals ?? 0,
                            away_goals: m.away_goals ?? 0
                          };
                        });
                        setMatchResults(initialResults);
                        setMotmPlayerId(fixture.motm_player_id || null);
                        setIsResultMode(true);
                      }}
                      className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all"
                    >
                      {matchups.some(m => m.home_goals !== null) ? '<Pencil className="w-4 h-4 text-slate-500" /> Edit Results' : '✅ Enter Results'}
                    </button>
                  )}

                  {/* WhatsApp Share Button (with results) */}
                  {matchups.some(m => m.home_goals !== null) && (
                    <button
                      onClick={handleWhatsAppShare}
                      className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200/60 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                      </svg>
                      Share Results on WhatsApp
                    </button>
                  )}
                </div>
              ) : phase === 'result_entry' && isResultMode ? (
                // Result Entry Mode
                <div className="space-y-4">
                  <div className="console-card bg-slate-50 border border-slate-200/60 rounded-2xl p-5 mb-4 shadow-sm font-mono relative overflow-hidden">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 bg-slate-800 text-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                      <div>
                        <p className="text-xs text-slate-800 font-bold uppercase tracking-wider mb-1"><SoccerBallIcon className="w-4 h-4" /> Result Entry Mode</p>
                        <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Enter goals scored by each player and select Man of the Match</p>
                      </div>
                    </div>
                  </div>

                  {/* Live Team Totals Preview */}
                  {(() => {
                    const homePlayerGoals = Object.values(matchResults).reduce((sum: number, m: any) => sum + (m?.home_goals ?? 0), 0);
                    const awayPlayerGoals = Object.values(matchResults).reduce((sum: number, m: any) => sum + (m?.away_goals ?? 0), 0);

                    // Calculate sub penalties
                    const homeSubPenalties = matchups.reduce((sum, m) => sum + (m.home_sub_penalty ?? 0), 0);
                    const awaySubPenalties = matchups.reduce((sum, m) => sum + (m.away_sub_penalty ?? 0), 0);

                    // Calculate scores based on tournament system
                    let homeTotalScore, awayTotalScore;
                    
                    if (tournamentSystem === 'wins') {
                      // Win-based scoring: 3 points for win, 1 for draw, 0 for loss
                      // Substitution penalties are added to MATCHUP score to determine winner
                      let homePoints = 0;
                      let awayPoints = 0;
                      
                      // Use matchResults state for live updates
                      Object.entries(matchResults).forEach(([positionStr, result]: [string, any]) => {
                        const position = parseInt(positionStr);
                        const matchup = matchups[position];
                        
                        if (matchup && result) {
                          // Add substitution penalties to matchup scores
                          // home_sub_penalty = penalty awarded TO away (when home subs)
                          // away_sub_penalty = penalty awarded TO home (when away subs)
                          const homeMatchupScore = (result?.home_goals ?? 0) + (matchup.away_sub_penalty ?? 0);
                          const awayMatchupScore = (result?.away_goals ?? 0) + (matchup.home_sub_penalty ?? 0);
                          
                          if (homeMatchupScore > awayMatchupScore) {
                            homePoints += 3; // Home wins this matchup
                          } else if (awayMatchupScore > homeMatchupScore) {
                            awayPoints += 3; // Away wins this matchup
                          } else if (homeMatchupScore === awayMatchupScore && homeMatchupScore > 0) {
                            homePoints += 1; // Draw (only if both scored)
                            awayPoints += 1; // Draw
                          }
                        }
                      });
                      
                      // Add fine/violation penalties to total (these affect final result)
                      homeTotalScore = homePoints + homePenaltyGoals;
                      awayTotalScore = awayPoints + awayPenaltyGoals;
                    } else {
                      // Goal-based scoring: sum of all goals
                      homeTotalScore = homePlayerGoals + awaySubPenalties + homePenaltyGoals;
                      awayTotalScore = awayPlayerGoals + homeSubPenalties + awayPenaltyGoals;
                    }
                    
                    const winner = homeTotalScore > awayTotalScore ? 'home' : awayTotalScore > homeTotalScore ? 'away' : 'draw';

                    return (
                      <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm font-mono">
                        <div className="text-center text-xs font-semibold text-gray-600 mb-2">
                          Current Score {tournamentSystem === 'wins' && '(Points)'}
                        </div>
                        <div className="grid grid-cols-3 gap-3 items-center">
                          <div className="text-center">
                            <div className="text-xs text-gray-600 mb-1">{fixture.home_team_name}</div>
                            <div className={`text-2xl font-bold ${winner === 'home' ? 'text-green-600' : 'text-gray-700'
                              }`}>{homeTotalScore}</div>
                            {tournamentSystem === 'wins' ? (
                              // Show matchup wins for win-based system
                              <div className="text-xs text-gray-500 mt-1">
                                {Object.values(matchResults).filter((m: any) => (m?.home_goals ?? 0) > (m?.away_goals ?? 0)).length}W-
                                {Object.values(matchResults).filter((m: any) => (m?.home_goals ?? 0) === (m?.away_goals ?? 0) && (m?.home_goals ?? 0) > 0).length}D-
                                {Object.values(matchResults).filter((m: any) => (m?.home_goals ?? 0) < (m?.away_goals ?? 0)).length}L
                              </div>
                            ) : (
                              // Show goal breakdown for goal-based system
                              (awaySubPenalties > 0 || homePenaltyGoals > 0) && (
                                <div className="text-xs text-gray-500 mt-1">
                                  ({homePlayerGoals}
                                  {awaySubPenalties > 0 && ` +${awaySubPenalties}s`}
                                  {homePenaltyGoals > 0 && ` +${homePenaltyGoals}f`})
                                </div>
                              )
                            )}
                          </div>
                          <div className="text-center text-gray-400 font-bold">-</div>
                          <div className="text-center">
                            <div className="text-xs text-gray-600 mb-1">{fixture.away_team_name}</div>
                            <div className={`text-2xl font-bold ${winner === 'away' ? 'text-green-600' : 'text-gray-700'
                              }`}>{awayTotalScore}</div>
                            {tournamentSystem === 'wins' ? (
                              // Show matchup wins for win-based system
                              <div className="text-xs text-gray-500 mt-1">
                                {Object.values(matchResults).filter((m: any) => (m?.away_goals ?? 0) > (m?.home_goals ?? 0)).length}W-
                                {Object.values(matchResults).filter((m: any) => (m?.home_goals ?? 0) === (m?.away_goals ?? 0) && (m?.away_goals ?? 0) > 0).length}D-
                                {Object.values(matchResults).filter((m: any) => (m?.away_goals ?? 0) < (m?.home_goals ?? 0)).length}L
                              </div>
                            ) : (
                              // Show goal breakdown for goal-based system
                              (homeSubPenalties > 0 || awayPenaltyGoals > 0) && (
                                <div className="text-xs text-gray-500 mt-1">
                                  ({awayPlayerGoals}
                                  {homeSubPenalties > 0 && ` +${homeSubPenalties}s`}
                                  {awayPenaltyGoals > 0 && ` +${awayPenaltyGoals}f`})
                                </div>
                              )
                            )}
                          </div>
                        </div>
                        {winner === 'draw' && (
                          <div className="text-center mt-2">
                            <span className="text-xs bg-yellow-200 text-yellow-800 px-3 py-1 rounded-full font-semibold">Draw</span>
                          </div>
                        )}
                        {tournamentSystem === 'goals' && (
                          <div className="text-center mt-2 text-xs text-gray-500">
                            s = sub penalty, f = fine
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Swap Mode Toggle */}
                  <div className="relative overflow-hidden mb-4 p-4 bg-gradient-to-r from-cyan-50 via-blue-50 to-indigo-50 border-2 border-cyan-300 rounded-2xl shadow-lg">
                    <div className="absolute top-0 left-0 w-32 h-32 bg-gradient-to-br from-cyan-200 to-blue-200 rounded-full blur-2xl opacity-20"></div>
                    <div className="relative flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1">
                        <div className="w-10 h-10 bg-slate-800 text-white rounded-xl flex items-center justify-center flex-shrink-0 shadow-sm">
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                          </svg>
                        </div>
                        <div className="flex-1">
                          <p className="text-sm font-bold text-gray-900">
                            {swapMode ? '🔄 Swap Mode Active' : 'Swap Matchups'}
                          </p>
                          <p className="text-xs text-gray-600 mt-0.5">
                            {swapMode ? 'Click two matchups to swap away players' : 'Rearrange player matchups'}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => {
                          setSwapMode(!swapMode);
                          setSwapFirstIndex(null);
                        }}
                        className={`px-4 py-2 text-xs font-mono font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm whitespace-nowrap ${swapMode
                          ? 'bg-red-50 hover:bg-red-100 text-red-700 border border-red-200/60'
                          : 'bg-slate-800 hover:bg-slate-700 text-white'
                          }`}
                      >
                        {swapMode ? '<XCircle className="w-4 h-4 text-rose-500" /> Cancel' : '🔄 Enable'}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {matchups.map((matchup, idx) => (
                      <div
                        key={idx}
                        className={`bg-gradient-to-br from-gray-50 to-white border-2 rounded-xl p-4 transition-all ${swapMode && swapFirstIndex === idx
                          ? 'border-cyan-500 bg-cyan-50 shadow-lg'
                          : swapMode
                            ? 'border-cyan-200 hover:border-cyan-400 cursor-pointer'
                            : 'border-gray-200'
                          }`}
                        onClick={() => {
                          if (swapMode) {
                            if (swapFirstIndex === null) {
                              setSwapFirstIndex(idx);
                            } else if (swapFirstIndex === idx) {
                              setSwapFirstIndex(null);
                            } else {
                              handleSwapMatchups(swapFirstIndex, idx);
                            }
                          }
                        }}
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-gray-700">
                              Match #{matchup.position}
                              {swapMode && swapFirstIndex === idx && <span className="ml-2 text-cyan-600">(Selected)</span>}
                            </span>
                            {nullMatchups.has(matchup.position) && (
                              <span className="px-2 py-0.5 bg-red-100 text-red-700 text-xs font-bold rounded border border-red-300">
                                NULL
                              </span>
                            )}
                          </div>
                          {!swapMode && (
                            <div className="flex gap-2 items-center">
                              {/* NULL Matchup Checkbox */}
                              <label
                                className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg cursor-pointer transition-colors group"
                                title="Mark as NULL: Won't count in player stats but will count for salary & team stats"
                              >
                                <input
                                  type="checkbox"
                                  checked={nullMatchups.has(matchup.position)}
                                  onChange={() => handleToggleNullMatchup(matchup.position)}
                                  disabled={isMarkingNull}
                                  className="w-4 h-4 text-red-600 border-gray-300 rounded focus:ring-red-500 cursor-pointer"
                                />
                                <span className="text-xs font-semibold text-gray-700 group-hover:text-gray-900">
                                  NULL
                                </span>
                              </label>

                              {/* Substitute Home Button */}
                              <button
                                onClick={() => {
                                  setSubMatchupIndex(idx);
                                  setSubSide('home');
                                  setSubNewPlayerId('');
                                  setSubPenaltyAmount(2); // Reset to default
                                  setIsSubModalOpen(true);
                                }}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all shadow-sm"
                                title="Substitute Home Player"
                              >
                                <span className="relative flex items-center gap-1">
                                  <svg className="w-3 h-3 group-hover:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                  </svg>
                                  H
                                </span>
                              </button>
                              {/* Substitute Away Button */}
                              <button
                                onClick={() => {
                                  setSubMatchupIndex(idx);
                                  setSubSide('away');
                                  setSubNewPlayerId('');
                                  setSubPenaltyAmount(2); // Reset to default
                                  setIsSubModalOpen(true);
                                }}
                                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-white text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg transition-all shadow-sm"
                                title="Substitute Away Player"
                              >
                                <span className="relative flex items-center gap-1">
                                  <svg className="w-3 h-3 group-hover:rotate-180 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
                                  </svg>
                                  A
                                </span>
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Show substitution indicator */}
                        {(matchup.home_substituted || matchup.away_substituted) && (
                          <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs">
                            {matchup.home_substituted && (
                              <div className="text-yellow-800">
                                🔁 Home: {matchup.home_original_player_name} {"->"} {matchup.home_player_name} (+{matchup.home_sub_penalty} to away)
                              </div>
                            )}
                            {matchup.away_substituted && (
                              <div className="text-yellow-800">
                                🔁 Away: {matchup.away_original_player_name} {"->"} {matchup.away_player_name} (+{matchup.away_sub_penalty} to home)
                              </div>
                            )}
                          </div>
                        )}

                        <div className="grid grid-cols-[1fr_auto_1fr] gap-2 sm:gap-4 items-center">
                          {/* Home Player */}
                          {(() => {
                            const homeMatch = homeSquadById.get(matchup.home_player_id) || homeSquadByName.get(matchup.home_player_name?.toLowerCase());
                            const homeCategory = matchup.home_category || homeMatch?.category;
                            return (
                              <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 bg-blue-50/60 border border-blue-200/80 rounded-xl min-w-0">
                                <PlayerPhoto
                                  photoUrl={homeMatch?.photo_url || matchup.home_photo_url}
                                  playerName={matchup.home_player_name}
                                  size={36}
                                  shape="circle"
                                  posXCircle={homeMatch?.photo_position_x_circle}
                                  posYCircle={homeMatch?.photo_position_y_circle}
                                  scaleCircle={homeMatch?.photo_scale_circle}
                                  className="border border-blue-300 flex-shrink-0"
                                />
                                <div className="flex flex-col min-w-0">
                                  <span className="font-extrabold text-xs sm:text-sm text-slate-900 truncate">
                                    {matchup.home_player_name}
                                  </span>
                                  {homeCategory && (
                                    <span className={`inline-block text-[8px] sm:text-[9px] uppercase tracking-wider px-1 py-0.2 rounded border self-start mt-0.5 ${getCategoryBadgeClass(homeCategory)}`}>
                                      {homeCategory}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}

                          {/* VS Badge */}
                          <div className="flex flex-col items-center gap-0.5">
                            <span className="bg-slate-800 text-white rounded-full px-2.5 py-0.5 text-[10px] font-black shadow-sm">VS</span>
                            <span className="text-[9px] font-bold text-slate-400 font-mono">({matchup.match_duration || 6}m)</span>
                          </div>

                          {/* Away Player */}
                          {(() => {
                            const awayMatch = awaySquadById.get(matchup.away_player_id) || awaySquadByName.get(matchup.away_player_name?.toLowerCase());
                            const awayCategory = matchup.away_category || awayMatch?.category;
                            return (
                              <div className="flex items-center gap-2 sm:gap-3 p-2 sm:p-2.5 bg-slate-50 border border-slate-200 rounded-xl min-w-0 flex-row-reverse sm:flex-row text-right sm:text-left">
                                <PlayerPhoto
                                  photoUrl={awayMatch?.photo_url || matchup.away_photo_url}
                                  playerName={matchup.away_player_name}
                                  size={36}
                                  shape="circle"
                                  posXCircle={awayMatch?.photo_position_x_circle}
                                  posYCircle={awayMatch?.photo_position_y_circle}
                                  scaleCircle={awayMatch?.photo_scale_circle}
                                  className="border border-slate-300 flex-shrink-0"
                                />
                                <div className="flex flex-col min-w-0">
                                  <span className="font-extrabold text-xs sm:text-sm text-slate-900 truncate">
                                    {matchup.away_player_name}
                                  </span>
                                  {awayCategory && (
                                    <span className={`inline-block text-[8px] sm:text-[9px] uppercase tracking-wider px-1 py-0.2 rounded border self-end sm:self-start mt-0.5 ${getCategoryBadgeClass(awayCategory)}`}>
                                      {awayCategory}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })()}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Penalty/Fine Goals Section */}
                  <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm font-mono">
                    <div className="flex items-center gap-2 mb-3">
                      <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Penalty / Fine Goals</h3>
                    </div>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-3">Add extra goals for rule violations (not counted for player stats or POTM)</p>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-2">
                          {fixture.home_team_name}
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={homePenaltyGoals}
                          onChange={(e) => setHomePenaltyGoals(parseInt(e.target.value) || 0)}
                          className="w-full px-3 py-2 text-center text-base font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-slate-50 focus:bg-white outline-none font-mono"
                          placeholder="0"
                        />
                        <p className="text-xs text-gray-500 mt-1 text-center">Fine Goals</p>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-2">
                          {fixture.away_team_name}
                        </label>
                        <input
                          type="number"
                          min="0"
                          value={awayPenaltyGoals}
                          onChange={(e) => setAwayPenaltyGoals(parseInt(e.target.value) || 0)}
                          className="w-full px-3 py-2 text-center text-base font-bold border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-slate-50 focus:bg-white outline-none font-mono"
                          placeholder="0"
                        />
                        <p className="text-xs text-gray-500 mt-1 text-center">Fine Goals</p>
                      </div>
                    </div>
                  </div>

                  {/* Man of the Match Selector (Fixture Level) */}
                  <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm font-mono">
                    <div className="flex items-center justify-between mb-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-slate-800 uppercase tracking-wider">
                        <span className="uppercase tracking-wide">Man of the Match</span>
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          const isRoundRobin = fixture.knockout_format === 'round_robin';
                          
                          if (isRoundRobin) {
                            // For round robin, calculate combined stats per player
                            const playerScores = new Map<string, { 
                              id: string; 
                              name: string; 
                              goals: number; 
                              conceded: number; 
                              wins: number;
                              draws: number;
                              losses: number;
                              score: number;
                            }>();
                            
                            matchups.forEach((m, idx) => {
                              const homeGoals = matchResults[idx]?.home_goals ?? 0;
                              const awayGoals = matchResults[idx]?.away_goals ?? 0;
                              
                              // Process home player
                              const homeId = m.home_player_id;
                              if (!playerScores.has(homeId)) {
                                playerScores.set(homeId, {
                                  id: homeId,
                                  name: m.home_player_name,
                                  goals: 0,
                                  conceded: 0,
                                  wins: 0,
                                  draws: 0,
                                  losses: 0,
                                  score: 0
                                });
                              }
                              const homePlayer = playerScores.get(homeId)!;
                              homePlayer.goals += homeGoals;
                              homePlayer.conceded += awayGoals;
                              if (homeGoals > awayGoals) homePlayer.wins++;
                              else if (homeGoals === awayGoals) homePlayer.draws++;
                              else homePlayer.losses++;
                              
                              // Process away player
                              const awayId = m.away_player_id;
                              if (!playerScores.has(awayId)) {
                                playerScores.set(awayId, {
                                  id: awayId,
                                  name: m.away_player_name,
                                  goals: 0,
                                  conceded: 0,
                                  wins: 0,
                                  draws: 0,
                                  losses: 0,
                                  score: 0
                                });
                              }
                              const awayPlayer = playerScores.get(awayId)!;
                              awayPlayer.goals += awayGoals;
                              awayPlayer.conceded += homeGoals;
                              if (awayGoals > homeGoals) awayPlayer.wins++;
                              else if (awayGoals === homeGoals) awayPlayer.draws++;
                              else awayPlayer.losses++;
                            });
                            
                            // Calculate scores for each player
                            type BestPlayerType = { 
                              id: string; 
                              name: string; 
                              goals: number; 
                              conceded: number; 
                              wins: number;
                              draws: number;
                              losses: number;
                              score: number;
                            };
                            let bestPlayer: BestPlayerType | null = null;
                            let bestScore = -999;
                            
                            playerScores.forEach((player) => {
                              player.score = (player.goals * 10) + // 10 points per goal
                                (player.wins * 5) +    // 5 points per win
                                (player.draws * 2) -   // 2 points per draw
                                (player.conceded * 2); // -2 per goal conceded
                              
                              if (player.score > bestScore) {
                                bestScore = player.score;
                                bestPlayer = {
                                  id: player.id,
                                  name: player.name,
                                  goals: player.goals,
                                  conceded: player.conceded,
                                  wins: player.wins,
                                  draws: player.draws,
                                  losses: player.losses,
                                  score: player.score
                                };
                              }
                            });
                            
                            if (bestPlayer === null) return;
                            
                            setMotmPlayerId(bestPlayer.id);
                            showAlert({
                              type: 'info',
                              title: '✨ MOTM Suggested',
                              message: `${bestPlayer.name} selected\n${bestPlayer.goals} goals, ${bestPlayer.conceded} conceded\nRecord: ${bestPlayer.wins}W-${bestPlayer.draws}D-${bestPlayer.losses}L`
                            });
                          } else {
                            // Regular matchup - calculate best player from individual matches
                            type BestPlayerType = { id: string; name: string; goals: number; conceded: number; result: string };
                            let bestPlayer: BestPlayerType | null = null;
                            let bestScore = -999;

                            matchups.forEach((m, idx) => {
                              const homeGoals = matchResults[idx]?.home_goals ?? 0;
                              const awayGoals = matchResults[idx]?.away_goals ?? 0;

                              // Score for home player
                              const homeWon = homeGoals > awayGoals;
                              const homeDraw = homeGoals === awayGoals;
                              const homeScore = (homeGoals * 10) + (homeWon ? 5 : 0) + (homeDraw ? 2 : 0) - (awayGoals * 2);

                              // Score for away player
                              const awayWon = awayGoals > homeGoals;
                              const awayDraw = homeGoals === awayGoals;
                              const awayScore = (awayGoals * 10) + (awayWon ? 5 : 0) + (awayDraw ? 2 : 0) - (homeGoals * 2);

                              if (homeScore > bestScore) {
                                bestScore = homeScore;
                                bestPlayer = {
                                  id: m.home_player_id,
                                  name: m.home_player_name,
                                  goals: homeGoals,
                                  conceded: awayGoals,
                                  result: homeWon ? 'W' : homeDraw ? 'D' : 'L'
                                };
                              }

                              if (awayScore > bestScore) {
                                bestScore = awayScore;
                                bestPlayer = {
                                  id: m.away_player_id,
                                  name: m.away_player_name,
                                  goals: awayGoals,
                                  conceded: homeGoals,
                                  result: awayWon ? 'W' : awayDraw ? 'D' : 'L'
                                };
                              }
                            });

                            if (bestPlayer === null) return;
                            
                            setMotmPlayerId(bestPlayer.id);
                            showAlert({
                              type: 'info',
                              title: '✨ MOTM Suggested',
                              message: `${bestPlayer.name}\n${bestPlayer.goals} goals, ${bestPlayer.conceded} conceded, Result: ${bestPlayer.result}`
                            });
                          }
                        }}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all flex items-center gap-1"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
                        </svg>
                        Auto-Suggest
                      </button>
                    </div>

                    <select
                      value={motmPlayerId || ''}
                      onChange={(e) => setMotmPlayerId(e.target.value || null)}
                      className="w-full px-3 py-2.5 text-xs font-mono font-bold uppercase tracking-wider border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-slate-50 focus:bg-white outline-none transition-all cursor-pointer"
                    >
                      <option value="">-- Select Player --</option>
                      <optgroup label={`Home Team (${fixture.home_team_name})`}>
                        {(() => {
                          // For round robin, combine stats for each unique player
                          const isRoundRobin = fixture.knockout_format === 'round_robin';
                          
                          if (isRoundRobin) {
                            // Group by player_id and sum their stats
                            const playerStats = new Map<string, { name: string; goals: number; conceded: number }>();
                            
                            matchups.forEach((m, idx) => {
                              const playerId = m.home_player_id;
                              const goals = matchResults[idx]?.home_goals ?? 0;
                              const conceded = matchResults[idx]?.away_goals ?? 0;
                              
                              if (playerStats.has(playerId)) {
                                const existing = playerStats.get(playerId)!;
                                existing.goals += goals;
                                existing.conceded += conceded;
                              } else {
                                playerStats.set(playerId, {
                                  name: m.home_player_name,
                                  goals,
                                  conceded
                                });
                              }
                            });
                            
                            return Array.from(playerStats.entries()).map(([playerId, stats]) => (
                              <option key={`home-${playerId}`} value={playerId}>
                                {stats.name} ({stats.goals}G, {stats.conceded}C)
                              </option>
                            ));
                          } else {
                            // Regular matchup - show each matchup separately
                            return matchups.map((m, idx) => {
                              const goals = matchResults[idx]?.home_goals ?? 0;
                              const conceded = matchResults[idx]?.away_goals ?? 0;
                              return (
                                <option key={`home-${idx}-${m.home_player_id}`} value={m.home_player_id}>
                                  {m.home_player_name} ({goals}G, {conceded}C)
                                </option>
                              );
                            });
                          }
                        })()}
                      </optgroup>
                      <optgroup label={`Away Team (${fixture.away_team_name})`}>
                        {(() => {
                          // For round robin, combine stats for each unique player
                          const isRoundRobin = fixture.knockout_format === 'round_robin';
                          
                          if (isRoundRobin) {
                            // Group by player_id and sum their stats
                            const playerStats = new Map<string, { name: string; goals: number; conceded: number }>();
                            
                            matchups.forEach((m, idx) => {
                              const playerId = m.away_player_id;
                              const goals = matchResults[idx]?.away_goals ?? 0;
                              const conceded = matchResults[idx]?.home_goals ?? 0;
                              
                              if (playerStats.has(playerId)) {
                                const existing = playerStats.get(playerId)!;
                                existing.goals += goals;
                                existing.conceded += conceded;
                              } else {
                                playerStats.set(playerId, {
                                  name: m.away_player_name,
                                  goals,
                                  conceded
                                });
                              }
                            });
                            
                            return Array.from(playerStats.entries()).map(([playerId, stats]) => (
                              <option key={`away-${playerId}`} value={playerId}>
                                {stats.name} ({stats.goals}G, {stats.conceded}C)
                              </option>
                            ));
                          } else {
                            // Regular matchup - show each matchup separately
                            return matchups.map((m, idx) => {
                              const goals = matchResults[idx]?.away_goals ?? 0;
                              const conceded = matchResults[idx]?.home_goals ?? 0;
                              return (
                                <option key={`away-${idx}-${m.away_player_id}`} value={m.away_player_id}>
                                  {m.away_player_name} ({goals}G, {conceded}C)
                                </option>
                              );
                            });
                          }
                        })()}
                      </optgroup>
                    </select>

                    {motmPlayerId && (() => {
                      const isRoundRobin = fixture.knockout_format === 'round_robin';
                      
                      if (isRoundRobin) {
                        // For round robin, sum all stats for this player
                        let totalGoals = 0;
                        let totalConceded = 0;
                        let wins = 0;
                        let draws = 0;
                        let losses = 0;
                        let playerName = '';
                        
                        matchups.forEach((m, idx) => {
                          const isHome = m.home_player_id === motmPlayerId;
                          const isAway = m.away_player_id === motmPlayerId;
                          
                          if (isHome) {
                            playerName = m.home_player_name;
                            const goals = matchResults[idx]?.home_goals ?? 0;
                            const conceded = matchResults[idx]?.away_goals ?? 0;
                            totalGoals += goals;
                            totalConceded += conceded;
                            if (goals > conceded) wins++;
                            else if (goals === conceded) draws++;
                            else losses++;
                          } else if (isAway) {
                            playerName = m.away_player_name;
                            const goals = matchResults[idx]?.away_goals ?? 0;
                            const conceded = matchResults[idx]?.home_goals ?? 0;
                            totalGoals += goals;
                            totalConceded += conceded;
                            if (goals > conceded) wins++;
                            else if (goals === conceded) draws++;
                            else losses++;
                          }
                        });
                        
                        return (
                          <div className="mt-3 p-3 bg-yellow-100 border border-yellow-400 rounded-lg">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-semibold text-yellow-900">
                                  {playerName}
                                </p>
                                <p className="text-xs text-yellow-700 mt-1">
                                  {totalGoals} goals scored • {totalConceded} conceded • {wins}W-{draws}D-{losses}L
                                </p>
                              </div>
                              <span className="text-2xl"><Star className="w-4 h-4 text-amber-400 fill-amber-400" /></span>
                            </div>
                          </div>
                        );
                      } else {
                        // Regular matchup - single match stats
                        const selectedPlayer = matchups.find(m => m.home_player_id === motmPlayerId || m.away_player_id === motmPlayerId);
                        const idx = matchups.indexOf(selectedPlayer!);
                        const isHome = selectedPlayer?.home_player_id === motmPlayerId;
                        const goals = isHome ? (matchResults[idx]?.home_goals ?? 0) : (matchResults[idx]?.away_goals ?? 0);
                        const conceded = isHome ? (matchResults[idx]?.away_goals ?? 0) : (matchResults[idx]?.home_goals ?? 0);
                        const won = goals > conceded;
                        const draw = goals === conceded;

                        return (
                          <div className="mt-3 p-3 bg-yellow-100 border border-yellow-400 rounded-lg">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="text-sm font-semibold text-yellow-900">
                                  {isHome ? selectedPlayer?.home_player_name : selectedPlayer?.away_player_name}
                                </p>
                                <p className="text-xs text-yellow-700 mt-1">
                                  {goals} goals scored • {conceded} conceded • {won ? '<Check className="w-4 h-4 text-emerald-500" /> Won' : draw ? '◆ Draw' : '✗ Lost'}
                                </p>
                              </div>
                              <span className="text-2xl"><Star className="w-4 h-4 text-amber-400 fill-amber-400" /></span>
                            </div>
                          </div>
                        );
                      }
                    })()}

                    <p className="text-xs text-yellow-700 mt-2">Select or auto-suggest the best player from the entire fixture</p>
                  </div>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        setIsResultMode(false);
                      }}
                      disabled={isSaving}
                      className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        // Validate MOTM is selected
                        if (!motmPlayerId) {
                          showAlert({
                            type: 'warning',
                            title: 'MOTM Required',
                            message: '⚠️ Please select Man of the Match before saving results!'
                          });
                          return;
                        }

                        setIsSaving(true);
                        try {
                          // Save matchup results (goals only)
                          const results = matchups.map((m, idx) => ({
                            position: m.position,
                            home_goals: matchResults[idx]?.home_goals ?? 0,
                            away_goals: matchResults[idx]?.away_goals ?? 0,
                          }));

                          const response = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/matchups`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              results,
                              entered_by: user!.uid,
                            }),
                          });

                          if (!response.ok) {
                            const errorData = await response.json();
                            if (response.status === 403) {
                              // Deadline passed
                              showAlert({
                                type: 'error',
                                title: 'Deadline Passed',
                                message: `<XCircle className="w-4 h-4 text-rose-500" /> ${errorData.error}. Results can no longer be submitted.`
                              });
                              setIsSaving(false);
                              setIsResultMode(false);
                              return;
                            }
                            throw new Error(errorData.error || 'Failed to save results');
                          }

                          const resultData = await response.json();
                          console.log('Result submission response:', resultData);

                          // Save MOTM and penalty goals at fixture level
                          const motmPlayerName = motmPlayerId ?
                            matchups.find(m => m.home_player_id === motmPlayerId)?.home_player_name ||
                            matchups.find(m => m.away_player_id === motmPlayerId)?.away_player_name || null
                            : null;

                          console.log('Saving MOTM and penalty goals:', { motmPlayerId, motmPlayerName, homePenaltyGoals, awayPenaltyGoals });

                          const motmResponse = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}`, {
                            method: 'PATCH',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              motm_player_id: motmPlayerId,
                              motm_player_name: motmPlayerName,
                              home_penalty_goals: homePenaltyGoals,
                              away_penalty_goals: awayPenaltyGoals,
                            }),
                          });

                          if (!motmResponse.ok) {
                            const errorData = await motmResponse.json();
                            if (motmResponse.status === 403) {
                              // Deadline passed for MOTM as well
                              console.error('MOTM deadline passed:', errorData);
                              showAlert({
                                type: 'error',
                                title: 'Deadline Passed',
                                message: `<XCircle className="w-4 h-4 text-rose-500" /> ${errorData.error}. MOTM can no longer be saved.`
                              });
                              setIsSaving(false);
                              setIsResultMode(false);
                              return;
                            }
                            console.error('Failed to save MOTM:', errorData);
                            showAlert({
                              type: 'warning',
                              title: 'MOTM Warning',
                              message: `Warning: MOTM not saved - ${errorData.error || 'Unknown error'}`
                            });
                          } else {
                            console.log('MOTM saved successfully:', motmPlayerName);
                          }

                          // Update player points and star ratings
                          const pointsPayload = matchups.map((m, idx) => ({
                            position: m.position,
                            home_player_id: m.home_player_id,
                            away_player_id: m.away_player_id,
                            home_goals: matchResults[idx]?.home_goals ?? 0,
                            away_goals: matchResults[idx]?.away_goals ?? 0,
                            is_null: m.is_null || false, // Include null status
                          }));

                          const pointsResponse = await fetchWithTokenRefresh('/api/realplayers/update-points', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              fixture_id: fixtureId,
                              season_id: fixture.season_id,
                              matchups: pointsPayload,
                            }),
                          });

                          if (pointsResponse.ok) {
                            const pointsData = await pointsResponse.json();
                            console.log('Player points updated:', pointsData.updates);
                            if (pointsData.categoryUpdate) {
                              console.log(`✅ Categories recalculated: ${pointsData.categoryUpdate.legendCount} Legend / ${pointsData.categoryUpdate.totalPlayers - pointsData.categoryUpdate.legendCount} Classic`);
                            }
                          } else {
                            const errorData = await pointsResponse.json();
                            console.error('Failed to update player points:', errorData);
                            showAlert({
                              type: 'warning',
                              title: 'Points Warning',
                              message: `Warning: Player points not updated - ${errorData.error || 'Unknown error'}`
                            });
                          }

                          // Update player stats (goals, wins/draws/losses, MOTM)
                          const statsPayload = matchups.map((m, idx) => ({
                            position: m.position,
                            home_player_id: m.home_player_id,
                            home_player_name: m.home_player_name,
                            away_player_id: m.away_player_id,
                            away_player_name: m.away_player_name,
                            home_goals: matchResults[idx]?.home_goals ?? 0,
                            away_goals: matchResults[idx]?.away_goals ?? 0,
                            is_null: m.is_null || false, // Include null status
                          }));

                          const statsResponse = await fetchWithTokenRefresh('/api/realplayers/update-stats', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              season_id: fixture.season_id,
                              fixture_id: fixtureId,
                              matchups: statsPayload,
                              motm_player_id: motmPlayerId, // Pass fixture-level MOTM
                            }),
                          });

                          if (statsResponse.ok) {
                            const statsData = await statsResponse.json();
                            console.log('Player stats updated:', statsData.updates);
                          }

                          // Update team stats (wins, draws, losses, goals)
                          const teamStatsResponse = await fetchWithTokenRefresh('/api/teamstats/update-stats', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              season_id: fixture.season_id,
                              fixture_id: fixtureId,
                              home_team_id: fixture.home_team_id,
                              away_team_id: fixture.away_team_id,
                              matchups: statsPayload,
                            }),
                          });

                          if (teamStatsResponse.ok) {
                            const teamStatsData = await teamStatsResponse.json();
                            console.log('<Check className="w-4 h-4 text-emerald-500" /> Team stats updated:', teamStatsData.updates);
                          } else {
                            const errorData = await teamStatsResponse.json();
                            console.error('<XCircle className="w-4 h-4 text-rose-500" /> Team stats update failed:', errorData);
                            showAlert({
                              type: 'warning',
                              title: 'Team Stats Warning',
                              message: `⚠️ Warning: Team stats may not have been updated. Error: ${errorData.error || 'Unknown error'}`
                            });
                          }

                          // Calculate fantasy points (auto-trigger)
                          try {
                            console.log('<Trophy className="w-4 h-4 text-amber-500 fill-amber-500" /> Calculating fantasy points...');
                            const fantasyResponse = await fetchWithTokenRefresh('/api/fantasy/calculate-points', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                fixture_id: fixtureId,
                                season_id: fixture.season_id,
                                round_number: fixture.round_number,
                              }),
                            });

                            if (fantasyResponse.ok) {
                              const fantasyData = await fantasyResponse.json();
                              console.log('✅ Fantasy points calculated:', fantasyData);
                            } else {
                              console.log('<Info className="w-4 h-4 text-blue-500" /> No fantasy league active or fantasy calculation skipped');
                            }
                          } catch (fantasyError) {
                            console.error('Fantasy points calculation error (non-critical):', fantasyError);
                            // Don't show error to user - fantasy is optional
                          }

                          // Generate match result news (auto-trigger)
                          try {
                            console.log('📰 Generating match result news...');
                            const newsResponse = await fetchWithTokenRefresh('/api/news/trigger', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({
                                event_type: 'match_result',
                                event_data: {
                                  season_id: fixture.season_id,
                                  fixture_id: fixtureId,
                                  home_team_name: fixture.home_team_name,
                                  away_team_name: fixture.away_team_name,
                                  home_score: resultData.fixture.home_score,
                                  away_score: resultData.fixture.away_score,
                                  result: resultData.fixture.result,
                                  motm_player_name: motmPlayerName,
                                }
                              }),
                            });

                            if (newsResponse.ok) {
                              const newsData = await newsResponse.json();
                              console.log('✅ Match result news generated:', newsData);
                            } else {
                              console.log('<Info className="w-4 h-4 text-blue-500" /> News generation skipped or failed');
                            }
                          } catch (newsError) {
                            console.error('News generation error (non-critical):', newsError);
                            // Don't show error to user - news is optional
                          }

                          // Record player participation from lineups (auto-trigger)
                          try {
                            console.log('<ClipboardList className="w-4 h-4 text-slate-500" /> Recording player participation...');
                            const participationResponse = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/record-participation`, {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                            });

                            if (participationResponse.ok) {
                              const participationData = await participationResponse.json();
                              console.log('✅ Player participation recorded:', participationData.message);
                            } else {
                              console.log('<Info className="w-4 h-4 text-blue-500" /> Player participation recording skipped');
                            }
                          } catch (participationError) {
                            console.error('Participation recording error (non-critical):', participationError);
                            // Don't show error to user - participation is optional
                          }

                          showAlert({
                            type: 'success',
                            title: 'Success!',
                            message: '<Check className="w-4 h-4 text-emerald-500" /> Results submitted successfully!\n\nFixture marked as COMPLETED.\nPlayer and team stats have been updated.'
                          });

                          setIsResultMode(false);
                          window.location.reload();
                        } catch (error) {
                          console.error('Error saving results:', error);
                          showAlert({
                            type: 'error',
                            title: 'Save Failed',
                            message: 'Failed to save results'
                          });
                        } finally {
                          setIsSaving(false);
                        }
                      }}
                      disabled={isSaving}
                      className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : 'Save Results'}
                    </button>

                    {/* Save as Draft Button */}
                    <button
                      onClick={async () => {
                        // Validate all results are entered
                        const allResultsEntered = Object.values(matchResults).every(
                          (r: any) => r.home_goals !== null && r.away_goals !== null
                        );

                        if (!allResultsEntered) {
                          showAlert({
                            type: 'error',
                            title: 'Incomplete Results',
                            message: '<XCircle className="w-4 h-4 text-rose-500" /> Please enter goals for all matches before saving as draft.'
                          });
                          return;
                        }

                        setIsSaving(true);
                        try {
                          // Save as draft (no calculations)
                          const results = matchups.map((m, idx) => ({
                            position: m.position,
                            home_goals: matchResults[idx]?.home_goals ?? 0,
                            away_goals: matchResults[idx]?.away_goals ?? 0,
                          }));

                          const motmPlayerName = motmPlayerId ?
                            matchups.find(m => m.home_player_id === motmPlayerId)?.home_player_name ||
                            matchups.find(m => m.away_player_id === motmPlayerId)?.away_player_name || null
                            : null;

                          const response = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/draft-results`, {
                            method: 'PUT',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              results,
                              entered_by: user!.uid,
                              motm_player_id: motmPlayerId,
                              motm_player_name: motmPlayerName,
                              home_penalty_goals: homePenaltyGoals,
                              away_penalty_goals: awayPenaltyGoals,
                            }),
                          });

                          if (!response.ok) {
                            const errorData = await response.json();
                            throw new Error(errorData.error || 'Failed to save draft');
                          }

                          const draftData = await response.json();
                          console.log('Draft saved:', draftData);

                          showAlert({
                            type: 'success',
                            title: 'Draft Saved',
                            message: `✅ Results saved as draft. You can submit them later.`
                          });

                          // Exit result mode
                          setIsResultMode(false);
                          // Reload page to show updated data
                          window.location.reload();
                        } catch (error) {
                          console.error('Failed to save draft:', error);
                          showAlert({
                            type: 'error',
                            title: 'Save Failed',
                            message: 'Failed to save draft'
                          });
                        } finally {
                          setIsSaving(false);
                        }
                      }}
                      disabled={isSaving}
                      className="flex-1 px-4 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200/60 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50"
                    >
                      {isSaving ? 'Saving...' : '<Save className="w-4 h-4 text-slate-500" /> Save as Draft'}
                    </button>
                  </div>
                </div>
              ) : (
                // View Only Mode (non result_entry phase OR closed with results)
                <div className="space-y-3">
                  {/* Show results if they exist (even in closed phase) */}
                  {matchups.some(m => m.home_goals !== null) ? (
                    <>
                      {/* Team Totals & Winner */}
                      {(() => {
                        // Calculate player goals from matchups
                        const homePlayerGoals = matchups.reduce((sum, m) => sum + (m.home_goals ?? 0), 0);
                        const awayPlayerGoals = matchups.reduce((sum, m) => sum + (m.away_goals ?? 0), 0);

                        // Calculate substitution penalties (awarded TO opponent)
                        const homeSubPenalties = matchups.reduce((sum, m) => sum + (m.home_sub_penalty ?? 0), 0);
                        const awaySubPenalties = matchups.reduce((sum, m) => sum + (m.away_sub_penalty ?? 0), 0);

                        // Calculate scores based on tournament system
                        let homeTotalScore, awayTotalScore;
                        
                        if (tournamentSystem === 'wins') {
                          // Win-based scoring: 3 points for win, 1 for draw, 0 for loss
                          let homePoints = 0;
                          let awayPoints = 0;
                          
                          matchups.forEach(m => {
                            if (m.home_goals !== null && m.away_goals !== null) {
                              const homeMatchupScore = (m.home_goals ?? 0) + (m.away_sub_penalty ?? 0);
                              const awayMatchupScore = (m.away_goals ?? 0) + (m.home_sub_penalty ?? 0);
                              
                              if (homeMatchupScore > awayMatchupScore) {
                                homePoints += 3; // Home wins
                              } else if (awayMatchupScore > homeMatchupScore) {
                                awayPoints += 3; // Away wins
                              } else {
                                homePoints += 1; // Draw
                                awayPoints += 1; // Draw
                              }
                            }
                          });
                          
                          // Add penalties (these are already points in win-based system)
                          homeTotalScore = homePoints + homePenaltyGoals;
                          awayTotalScore = awayPoints + awayPenaltyGoals;
                        } else {
                          // Goal-based scoring: sum of all goals
                          homeTotalScore = homePlayerGoals + awaySubPenalties + homePenaltyGoals;
                          awayTotalScore = awayPlayerGoals + homeSubPenalties + awayPenaltyGoals;
                        }

                        const winner = homeTotalScore > awayTotalScore ? 'home' : awayTotalScore > homeTotalScore ? 'away' : 'draw';

                        return (
                          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 sm:p-6 shadow-sm font-mono mb-4">
                            <h3 className="text-center text-sm font-semibold text-gray-600 mb-4">
                              Match Result {tournamentSystem === 'wins' && '(Points)'}
                            </h3>
                            <div className="grid grid-cols-3 gap-4 items-center mb-4">
                              {/* Home Total */}
                              <div className={`text-center p-4 rounded-xl ${winner === 'home' ? 'bg-green-500 text-white shadow-lg scale-105' : 'bg-white text-gray-700'
                                } transition-all`}>
                                <div className="text-xs sm:text-sm font-medium mb-1">{fixture.home_team_name}</div>
                                <div className="text-3xl sm:text-4xl font-bold">{homeTotalScore}</div>
                                {winner === 'home' && <div className="text-xs mt-1 font-semibold"><Check className="w-4 h-4 text-emerald-500" /> WINNER</div>}
                                {/* Breakdown */}
                                {tournamentSystem === 'wins' ? (
                                  // Show W-D-L for win-based system
                                  <div className="text-xs mt-2 opacity-90">
                                    {matchups.filter(m => m.home_goals !== null && m.away_goals !== null && (m.home_goals ?? 0) > (m.away_goals ?? 0)).length}W-
                                    {matchups.filter(m => m.home_goals !== null && m.away_goals !== null && (m.home_goals ?? 0) === (m.away_goals ?? 0)).length}D-
                                    {matchups.filter(m => m.home_goals !== null && m.away_goals !== null && (m.home_goals ?? 0) < (m.away_goals ?? 0)).length}L
                                  </div>
                                ) : (
                                  // Show goal breakdown for goal-based system
                                  (awaySubPenalties > 0 || homePenaltyGoals > 0) && (
                                    <div className="text-xs mt-2 opacity-90">
                                      ({homePlayerGoals}
                                      {awaySubPenalties > 0 && ` +${awaySubPenalties}s`}
                                      {homePenaltyGoals > 0 && ` +${homePenaltyGoals}f`})
                                    </div>
                                  )
                                )}
                              </div>

                              {/* VS or Draw */}
                              <div className="text-center">
                                {winner === 'draw' ? (
                                  <div className="bg-yellow-400 text-yellow-900 px-4 py-2 rounded-full font-bold text-sm shadow-lg">
                                    DRAW
                                  </div>
                                ) : (
                                  <div className="text-2xl font-bold text-gray-400">-</div>
                                )}
                              </div>

                              {/* Away Total */}
                              <div className={`text-center p-4 rounded-xl ${winner === 'away' ? 'bg-green-500 text-white shadow-lg scale-105' : 'bg-white text-gray-700'
                                } transition-all`}>
                                <div className="text-xs sm:text-sm font-medium mb-1">{fixture.away_team_name}</div>
                                <div className="text-3xl sm:text-4xl font-bold">{awayTotalScore}</div>
                                {winner === 'away' && <div className="text-xs mt-1 font-semibold"><Check className="w-4 h-4 text-emerald-500" /> WINNER</div>}
                                {/* Breakdown */}
                                {tournamentSystem === 'wins' ? (
                                  // Show W-D-L for win-based system
                                  <div className="text-xs mt-2 opacity-90">
                                    {matchups.filter(m => m.home_goals !== null && m.away_goals !== null && (m.away_goals ?? 0) > (m.home_goals ?? 0)).length}W-
                                    {matchups.filter(m => m.home_goals !== null && m.away_goals !== null && (m.home_goals ?? 0) === (m.away_goals ?? 0)).length}D-
                                    {matchups.filter(m => m.home_goals !== null && m.away_goals !== null && (m.away_goals ?? 0) < (m.home_goals ?? 0)).length}L
                                  </div>
                                ) : (
                                  // Show goal breakdown for goal-based system
                                  (homeSubPenalties > 0 || awayPenaltyGoals > 0) && (
                                    <div className="text-xs mt-2 opacity-90">
                                      ({awayPlayerGoals}
                                      {homeSubPenalties > 0 && ` +${homeSubPenalties}s`}
                                      {awayPenaltyGoals > 0 && ` +${awayPenaltyGoals}f`})
                                    </div>
                                  )
                                )}
                              </div>
                            </div>
                            {/* Legend - only show for goal-based system */}
                            {tournamentSystem === 'goals' && (homeSubPenalties > 0 || awaySubPenalties > 0 || homePenaltyGoals > 0 || awayPenaltyGoals > 0) && (
                              <div className="text-center text-xs text-gray-600 pt-2 border-t border-gray-300">
                                s = sub penalty, f = fine
                              </div>
                            )}
                          </div>
                        );
                      })()}

                      {/* Man of the Match Display */}
                      {fixture.motm_player_name && (
                        <div className="bg-gradient-to-r from-yellow-50 to-amber-50 border-2 border-yellow-300 rounded-xl p-4 mb-4">
                          <div className="flex items-center justify-center gap-3">
                            <svg className="w-6 h-6 text-yellow-600" fill="currentColor" viewBox="0 0 20 20">
                              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                            </svg>
                            <div>
                              <div className="text-xs font-semibold text-yellow-700 uppercase tracking-wide">Man of the Match</div>
                              <div className="text-lg font-bold text-yellow-900">{fixture.motm_player_name}</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Matchup Results */}
                      {matchups.map((matchup, idx) => {
                        const hasResult = matchup.home_goals !== null && matchup.away_goals !== null;
                        const homeWon = hasResult && matchup.home_goals! > matchup.away_goals!;
                        const awayWon = hasResult && matchup.away_goals! > matchup.home_goals!;
                        const isDraw = hasResult && matchup.home_goals === matchup.away_goals;
                        const isPOTD = fixture.motm_player_id && (fixture.motm_player_id === matchup.home_player_id || fixture.motm_player_id === matchup.away_player_id);

                        return (
                          <div key={idx} className={`p-4 rounded-xl border-2 ${isPOTD ? 'bg-gradient-to-br from-yellow-50 via-amber-50 to-yellow-100 border-yellow-400' : 'bg-white border-gray-200'}`}>
                            <div className="flex items-center justify-between mb-3">
                              <span className="text-sm font-semibold text-gray-700">Match #{matchup.position}</span>
                              {isPOTD && (
                                <div className="flex items-center gap-1 px-2 py-1 bg-yellow-400 text-yellow-900 rounded-full text-xs font-bold">
                                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                    <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                                  </svg>
                                  MOTM
                                </div>
                              )}
                            </div>

                            {/* Substitution Info */}
                            {(matchup.home_substituted || matchup.away_substituted) && (
                              <div className="mb-3 p-2 bg-yellow-50 border border-yellow-200 rounded-lg text-xs">
                                {matchup.home_substituted && (
                                  <div className="text-yellow-800">
                                    🔁 Home: {matchup.home_original_player_name} {"->"} {matchup.home_player_name} (+{matchup.home_sub_penalty} to away)
                                  </div>
                                )}
                                {matchup.away_substituted && (
                                  <div className="text-yellow-800">
                                    🔁 Away: {matchup.away_original_player_name} {"->"} {matchup.away_player_name} (+{matchup.away_sub_penalty} to home)
                                  </div>
                                )}
                              </div>
                            )}

                            <div className="grid grid-cols-3 gap-4 items-center">
                              <div className="text-center">
                                <p className="text-xs text-gray-500 mb-1">{matchup.home_player_name}</p>
                                <p className={`text-2xl font-bold ${homeWon ? 'text-green-600' : isDraw ? 'text-yellow-600' : 'text-gray-400'}`}>
                                  {matchup.home_goals ?? 0}
                                </p>
                              </div>
                              <div className="text-center text-gray-400 font-bold">-</div>
                              <div className="text-center">
                                <p className="text-xs text-gray-500 mb-1">{matchup.away_player_name}</p>
                                <p className={`text-2xl font-bold ${awayWon ? 'text-green-600' : isDraw ? 'text-yellow-600' : 'text-gray-400'}`}>
                                  {matchup.away_goals ?? 0}
                                </p>
                              </div>
                            </div>

                            {matchup.match_duration && (
                              <div className="text-center text-xs text-gray-500 mt-2">
                                ({matchup.match_duration} min)
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    // No results yet - show matchups only
                    matchups.map((matchup, idx) => (
                      <div key={idx} className="p-4 bg-gray-50 rounded-xl">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center mb-2">
                          <div className="text-center">
                            <p className="text-xs text-gray-500 mb-1">Home Player</p>
                            <p className="font-medium text-gray-900">{matchup.home_player_name}</p>
                          </div>

                          <div className="flex justify-center">
                            <div className="bg-green-100 text-green-700 rounded-full px-4 py-2 text-sm font-medium">VS</div>
                          </div>

                          <div className="text-center">
                            <p className="text-xs text-gray-500 mb-1">Away Player</p>
                            <p className="font-medium text-gray-900">{matchup.away_player_name}</p>
                          </div>
                        </div>

                        {/* Match info */}
                        <div className="text-center text-xs text-gray-500 pt-2 border-t border-gray-200">
                          <span>Match #{matchup.position}</span>
                          {matchup.match_duration && (
                            <span className="ml-2 text-green-600 font-medium">
                              ({matchup.match_duration} min)
                            </span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {/* Waiting Message */}
          {!canCreateMatchups && matchups.length === 0 && (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-gray-700 mb-2">Waiting for Matchups</p>
              <p className="text-xs text-gray-600">
                {!homeLineupSubmitted || !awayLineupSubmitted
                  ? '⌛ Both teams must submit their lineups before matchups can be created.'
                  : phase === 'home_fixture' && 'Home team will create player matchups during this phase.'
                }
                {phase === 'fixture_entry' && homeLineupSubmitted && awayLineupSubmitted && 'First team to create matchups gets edit rights'}
                {phase === 'result_entry' && 'Matchups are finalized'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Substitution Modal */}
      {isSubModalOpen && subMatchupIndex !== null && subSide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-sm">
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto p-5 sm:p-6 font-mono">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">🔁 Substitute Player</h3>
              <button
                onClick={() => setIsSubModalOpen(false)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="mb-4">
              {(() => {
                const matchup = matchups[subMatchupIndex];
                const isHome = subSide === 'home';
                const currentPlayerId = isHome ? matchup.home_player_id : matchup.away_player_id;
                const currentPlayerName = isHome ? matchup.home_player_name : matchup.away_player_name;
                const playersList = isHome ? homePlayers : awayPlayers;
                const currentPlayer = playersList.find(p => p.player_id === currentPlayerId);
                const currentCategory = currentPlayer?.category || 'classic';

                return (
                  <div className="space-y-3 font-mono text-xs">
                    <div className="bg-slate-50 border border-slate-200 p-3 rounded-xl">
                      <div className="flex justify-between">
                        <span className="text-slate-400 uppercase tracking-wider text-[10px]">Current Player:</span>
                        <span className="font-extrabold text-slate-800 uppercase">{currentPlayerName}</span>
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-slate-400 uppercase tracking-wider text-[10px]">Category:</span>
                        <span className="font-extrabold text-indigo-600 uppercase bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">{currentCategory}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="mb-6">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                Select Replacement Player
              </label>
              <select
                value={subNewPlayerId}
                onChange={(e) => setSubNewPlayerId(e.target.value)}
                className="w-full px-3 py-2.5 text-xs font-mono font-bold uppercase tracking-wider border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 bg-slate-50 focus:bg-white outline-none transition-all cursor-pointer"
              >
                <option value="">-- Choose Player --</option>
                {(subSide === 'home' ? homePlayers : awayPlayers)
                  .filter(player => {
                    // Filter out the current player being substituted
                    if (subMatchupIndex === null) return true;
                    const currentMatchup = matchups[subMatchupIndex];
                    const currentPlayerId = subSide === 'home'
                      ? currentMatchup.home_player_id
                      : currentMatchup.away_player_id;
                    return player.player_id !== currentPlayerId;
                  })
                  .map((player) => {
                    // Display category properly
                    let catDisplay = 'N/A';

                    // Check various category field formats
                    if (player.category_id?.toUpperCase() === 'LEGEND' || player.category?.toUpperCase() === 'LEGEND') {
                      catDisplay = 'LEGEND';
                    } else if (player.category_id?.toUpperCase() === 'CLASSIC' || player.category?.toUpperCase() === 'CLASSIC') {
                      catDisplay = 'CLASSIC';
                    } else if (player.category_name?.toLowerCase().includes('legend')) {
                      catDisplay = 'LEGEND';
                    } else if (player.category_name?.toLowerCase().includes('classic')) {
                      catDisplay = 'CLASSIC';
                    } else if (player.category_name) {
                      catDisplay = player.category_name.toUpperCase();
                    } else if (typeof player.category === 'number') {
                      // Map numeric categories: 1 = Legend, 2 = Classic
                      catDisplay = player.category === 1 ? 'LEGEND' : player.category === 2 ? 'CLASSIC' : `CAT ${player.category}`;
                    }

                    return (

                      <option key={player.player_id} value={player.player_id}>
                        {player.name || player.player_name} ({catDisplay})
                      </option>

  );
                  })}
              </select>
              {subNewPlayerId && (
                <div className="mt-3 p-3 bg-orange-50 border border-orange-200 rounded-xl font-mono text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-extrabold text-orange-900 uppercase tracking-wider text-[10px]"><AlertTriangle className="w-3 h-3 inline text-orange-500 mr-1" /> Sub Penalty</span>
                    <span className="text-sm font-black text-orange-600 bg-white border border-orange-200 px-2 py-0.5 rounded-lg">+{subPenaltyAmount} Goals</span>
                  </div>
                  <p className="text-[9px] text-orange-500 mt-1.5 font-bold uppercase tracking-wider leading-relaxed">
                    Penalty: +2 goals base +1 for each level up if subbing a lower priority player for an upper priority player.
                  </p>
                </div>
              )}
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setIsSubModalOpen(false)}
                className="flex-1 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleSubstitution}
                disabled={!subNewPlayerId || isSaving}
                className="flex-1 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Substituting...' : subNewPlayerId ? 'Confirm Substitution' : 'Select Player First'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Components */}
      <AlertModal
        isOpen={alertState.isOpen}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />

      <ConfirmModal
        isOpen={confirmState.isOpen}
        onConfirm={handleConfirm}
        onCancel={closeConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        type={confirmState.type}
      />
    </div>
  
    </AuthGuard>
  );
}
