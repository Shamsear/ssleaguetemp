'use client';
import { Activity, AlertTriangle, Check, ClipboardList, Copy, Crown, Pencil, Save, Settings, Trophy, XCircle, Swords, ArrowLeft, Star, CheckCircle2, Clock, Zap, Gamepad2, Users, Flame } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import FixtureTimeline from '@/components/FixtureTimeline';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import ConfirmModal from '@/components/modals/ConfirmModal';
import PromptModal from '@/components/modals/PromptModal';
import FixtureShareButton from '@/components/FixtureShareButton';
import CommitteeMatchupCreator from '@/components/CommitteeMatchupCreator';
import TripleThreatLineupSubmission from '@/components/TripleThreatLineupSubmission';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';
import {
  calculateTripleThreatFixture,
  extractTripleThreatLineupFromMatchups,
  formatTripleThreatLineupCopy,
  getTripleThreatModeDisplay,
  resolveTripleThreatMode,
} from '@/lib/tournament/triple-threat-engine';
import { formatFixtureShareText } from '@/lib/tournament/fixture-share';

interface Matchup {
  id: number;
  home_player_id: string;
  home_player_name: string;
  away_player_id: string;
  away_player_name: string;
  home_goals: number | null;
  away_goals: number | null;
  position: number;
  home_sub_penalty?: number;
  away_sub_penalty?: number;
  home_substituted?: boolean;
  away_substituted?: boolean;
  match_mode?: 'coop' | 'duo' | 'single' | 'individual' | string;
  home_player_ids?: string[];
  home_player_names?: string[];
  away_player_ids?: string[];
  away_player_names?: string[];
  home_player_goals?: number[] | null;
  away_player_goals?: number[] | null;
  points_awarded_home?: number;
  points_awarded_away?: number;
  bonus_awarded_home?: number;
  bonus_awarded_away?: number;
}

interface Fixture {
  id: string;
  season_id: string;
  tournament_id?: string;
  round_number: number;
  match_number: number;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  status: string;
  leg: string;
  scheduled_date?: string;
  home_score?: number;
  away_score?: number;
  result?: string;
  motm_player_id?: string;
  motm_player_name?: string;
  home_penalty_goals?: number;
  away_penalty_goals?: number;
  match_status_reason?: string;
  created_at?: string;
  created_by_name?: string;
  result_submitted_at?: string;
  result_submitted_by_name?: string;
  scoring_type?: string;
  scoring_system?: string;
  knockout_format?: string;
  tournament_type?: string;
  matchday_format?: string;
  home_points_earned?: number;
  away_points_earned?: number;
  home_points_difference?: number;
  away_points_difference?: number;
  clean_sweep_winner?: string;
  group_name?: string | null;
  notes?: string;
  round_status?: string | null;
  raw_status?: string;
}

export default function CommitteeFixtureDetailPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const fixtureId = params?.fixtureId as string;

  const [fixture, setFixture] = useState<Fixture | null>(null);
  const [matchups, setMatchups] = useState<Matchup[]>([]);
  const [homeLineup, setHomeLineup] = useState<any>(null);
  const [awayLineup, setAwayLineup] = useState<any>(null);
  const [showTTLineupModal, setShowTTLineupModal] = useState<'home' | 'away' | null>(null);
  const [isGeneratingTTMatchups, setIsGeneratingTTMatchups] = useState(false);
  const [ttDuoAwayIds, setTtDuoAwayIds] = useState<[string, string]>(['', '']);
  const [ttDuoDurations, setTtDuoDurations] = useState<[number, number]>([6, 6]);
  const [isSavingTTDuo, setIsSavingTTDuo] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showMatchupCreator, setShowMatchupCreator] = useState(false);
  const [showLineupEditor, setShowLineupEditor] = useState<'home' | 'away' | null>(null);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editedScores, setEditedScores] = useState<{
    [key: number]: { home: number; away: number; homePlayers?: number[]; awayPlayers?: number[] };
  }>({});
  const [editedSubPenalties, setEditedSubPenalties] = useState<{ [key: number]: { home: number, away: number } }>({});
  const [motmPlayerId, setMotmPlayerId] = useState<string | null>(null);
  const [motmPlayerName, setMotmPlayerName] = useState<string | null>(null);
  const [homePenaltyGoals, setHomePenaltyGoals] = useState<number>(0);
  const [awayPenaltyGoals, setAwayPenaltyGoals] = useState<number>(0);
  const [isSaving, setIsSaving] = useState(false);
  const [isGeneratingRoundRobin, setIsGeneratingRoundRobin] = useState(false);
  const [knockoutFormat, setKnockoutFormat] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<'fixture' | 'home' | 'away' | null>(null);

  // Modal system
  const {
    alertState,
    showAlert,
    closeAlert,
    confirmState,
    showConfirm,
    closeConfirm,
    handleConfirm,
    promptState,
    showPrompt,
    closePrompt,
    handlePromptConfirm,
  } = useModal();

  useEffect(() => {
    if (fixtureId && user?.role === 'committee_admin') {
      fetchFixtureData();
    }
  }, [fixtureId, user]);

  // Keep matchups synced when teams or another tab create/update matchups
  useEffect(() => {
    if (!fixtureId || user?.role !== 'committee_admin' || isEditMode || isSaving || isSavingTTDuo) {
      return;
    }

    const syncMatchups = async () => {
      try {
        const res = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/matchups`, {
          cache: 'no-store',
        });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.matchups)) {
          setMatchups((prev) =>
            JSON.stringify(prev) === JSON.stringify(data.matchups) ? prev : data.matchups
          );
        }
      } catch {
        // Silent background sync
      }
    };

    const handleFocus = () => {
      syncMatchups();
    };
    const intervalId = setInterval(syncMatchups, 5000);
    window.addEventListener('focus', handleFocus);
    return () => {
      clearInterval(intervalId);
      window.removeEventListener('focus', handleFocus);
    };
  }, [fixtureId, user?.role, isEditMode, isSaving, isSavingTTDuo]);

  const fetchFixtureData = async (silent = false) => {
    if (!silent) setIsLoading(true);
    try {
      // Fetch fixture
      const fixtureRes = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}`, {
        cache: 'no-store',
      });
      const fixtureData = await fixtureRes.json();

      if (fixtureData.fixture) {
        setFixture(fixtureData.fixture);
        setKnockoutFormat(fixtureData.fixture.knockout_format || null);
        setMotmPlayerId(fixtureData.fixture.motm_player_id || null);
        setMotmPlayerName(fixtureData.fixture.motm_player_name || null);
        setHomePenaltyGoals(fixtureData.fixture.home_penalty_goals || 0);
        setAwayPenaltyGoals(fixtureData.fixture.away_penalty_goals || 0);

        // Fetch lineups for both teams
        try {
          const lineupsRes = await fetchWithTokenRefresh(`/api/lineups?fixture_id=${fixtureId}`, {
            cache: 'no-store',
          });
          if (lineupsRes.ok) {
            const lineupsData = await lineupsRes.json();
            const allL = Array.isArray(lineupsData.lineups) ? lineupsData.lineups : [];
            const hL = allL.find((l: any) => l.team_id === fixtureData.fixture.home_team_id);
            const aL = allL.find((l: any) => l.team_id === fixtureData.fixture.away_team_id);
            setHomeLineup(hL || null);
            setAwayLineup(aL || null);
          }
        } catch (lErr) {
          console.warn('Error fetching lineups for fixture:', lErr);
        }
      }

      // Fetch matchups
      const matchupsRes = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/matchups`, {
        cache: 'no-store',
      });
      const matchupsData = await matchupsRes.json();

      if (matchupsData.matchups) {
        setMatchups(matchupsData.matchups);

        // Initialize edited scores and sub penalties (with per-player arrays for Co-op 2v2)
        const scores: { [key: number]: { home: number; away: number; homePlayers?: number[]; awayPlayers?: number[] } } = {};
        const subPenalties: { [key: number]: { home: number, away: number } } = {};
        matchupsData.matchups.forEach((m: Matchup) => {
          const isCoop =
            resolveTripleThreatMode(m) === 'coop' ||
            (m.home_player_ids?.length || 0) > 1 ||
            (m.away_player_ids?.length || 0) > 1;
          if (isCoop) {
            const hLen = Math.max(m.home_player_ids?.length || 0, 2);
            const aLen = Math.max(m.away_player_ids?.length || 0, 2);
            const homePlayers =
              Array.isArray(m.home_player_goals) && m.home_player_goals.length === hLen
                ? m.home_player_goals.map((g) => Number(g ?? 0))
                : Array.from({ length: hLen }, (_, i) => (i === 0 ? (m.home_goals ?? 0) : 0));
            const awayPlayers =
              Array.isArray(m.away_player_goals) && m.away_player_goals.length === aLen
                ? m.away_player_goals.map((g) => Number(g ?? 0))
                : Array.from({ length: aLen }, (_, i) => (i === 0 ? (m.away_goals ?? 0) : 0));
            scores[m.position] = {
              home: homePlayers.reduce((a, b) => a + b, 0),
              away: awayPlayers.reduce((a, b) => a + b, 0),
              homePlayers,
              awayPlayers,
            };
          } else {
            scores[m.position] = {
              home: m.home_goals ?? 0,
              away: m.away_goals ?? 0,
            };
          }
          subPenalties[m.position] = {
            home: m.home_sub_penalty ?? 0,
            away: m.away_sub_penalty ?? 0
          };
        });
        setEditedScores(scores);
        setEditedSubPenalties(subPenalties);
      }
    } catch (error: any) {
      console.error('Error fetching fixture data:', error);
      showAlert({
        type: 'error',
        title: 'Load Failed',
        message: 'Failed to load fixture data'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeclareWO = async (absentTeam: 'home' | 'away') => {
    const teamName = absentTeam === 'home' ? fixture?.home_team_name : fixture?.away_team_name;
    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Declare Walkover',
      message: `Declare walkover due to ${teamName} being absent?`,
      confirmText: 'Declare WO',
      cancelText: 'Cancel'
    });

    if (!confirmed || !fixture) return;

    setIsSaving(true);
    try {
      const response = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/declare-wo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          absent_team: absentTeam,
          declared_by: user?.uid,
          declared_by_name: (user as any)?.displayName || user?.email,
        })
      });

      if (response.ok) {
        showAlert({
          type: 'success',
          title: 'Walkover Declared',
          message: 'Walkover declared successfully!'
        });
        fetchFixtureData();
      } else {
        const error = await response.json();
        showAlert({
          type: 'error',
          title: 'Failed',
          message: error.error || 'Unknown error'
        });
      }
    } catch (error: any) {
      console.error('Error declaring WO:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to declare walkover'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeclareNullWithFantasy = async () => {
    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Declare Match NULL (Keep Fantasy)',
      message: 'Declare this match NULL while keeping matchups intact and updating fantasy player points? Team standings and tournament player stats will exclude this match.',
      confirmText: 'Declare NULL (Keep Fantasy)',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    setIsSaving(true);
    try {
      const response = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/declare-null`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          declared_by: user?.uid,
          declared_by_name: (user as any)?.displayName || user?.email,
          keep_fantasy_points: true,
          notes: 'Match declared NULL (Fantasy Points Preserved)',
        })
      });

      if (response.ok) {
        showAlert({
          type: 'success',
          title: 'Match Nullified (Fantasy Kept)',
          message: 'Match declared NULL successfully! Matchups and fantasy player points preserved.'
        });
        fetchFixtureData();
      } else {
        const error = await response.json();
        showAlert({
          type: 'error',
          title: 'Failed',
          message: error.error || 'Unknown error'
        });
      }
    } catch (error: any) {
      console.error('Error declaring NULL (Keep Fantasy):', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to declare match NULL'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeclareNull = async () => {
    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Declare Match NULL (Wipe All)',
      message: 'Declare match NULL (both teams absent)? This will wipe all stats and revert fantasy points for this fixture.',
      confirmText: 'Declare NULL (Wipe All)',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    setIsSaving(true);
    try {
      const response = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/declare-null`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          declared_by: user?.uid,
          declared_by_name: (user as any)?.displayName || user?.email,
          keep_fantasy_points: false,
        })
      });

      if (response.ok) {
        showAlert({
          type: 'success',
          title: 'Match Nullified',
          message: 'Match declared NULL successfully!'
        });
        fetchFixtureData();
      } else {
        const error = await response.json();
        showAlert({
          type: 'error',
          title: 'Failed',
          message: error.error || 'Unknown error'
        });
      }
    } catch (error: any) {
      console.error('Error declaring NULL:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to declare NULL'
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleGenerateRoundRobinMatchups = async () => {
    const confirmed = await showConfirm({
      type: 'info',
      title: 'Generate Round Robin Matchups',
      message: 'This will automatically generate all 25 matchups (5x5) based on the submitted lineups. Both lineups will be locked. Continue?',
      confirmText: 'Generate Matchups',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    setIsGeneratingRoundRobin(true);
    try {
      const response = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/generate-round-robin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      const data = await response.json();

      if (response.ok && data.success) {
        showAlert({
          type: 'success',
          title: 'Matchups Generated',
          message: `Successfully generated ${data.matchups_count} round robin matchups!`
        });
        fetchFixtureData();
      } else {
        showAlert({
          type: 'error',
          title: 'Generation Failed',
          message: data.error || 'Failed to generate matchups'
        });
      }
    } catch (error: any) {
      console.error('Error generating round robin matchups:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to generate round robin matchups'
      });
    } finally {
      setIsGeneratingRoundRobin(false);
    }
  };

  const handleGenerateTripleThreatMatchups = async () => {
    setIsGeneratingTTMatchups(true);
    try {
      const res = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/generate-triple-threat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showAlert({
          type: 'success',
          title: 'Matchups Generated',
          message: `Generated ${data.matchups_count || 2} Triple Threat matchups (Co-op & Single). Pair Duo (2 × 1v1) manually below!`
        });
        fetchFixtureData();
      } else {
        showAlert({
          type: 'error',
          title: 'Generation Failed',
          message: data.error || 'Failed to generate matchups'
        });
      }
    } catch (err: any) {
      console.error('Error generating TT matchups:', err);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to generate Triple Threat matchups'
      });
    } finally {
      setIsGeneratingTTMatchups(false);
    }
  };

  const handleSaveResults = async () => {
    if (!fixture) return;

    const reason = await showPrompt({
      title: 'Edit Reason',
      message: 'Enter reason for editing result (optional):',
      placeholder: 'Reason for edit...',
      defaultValue: ''
    });

    if (reason === null) return; // User cancelled prompt modal

    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Save Changes',
      message: 'Save the edited results? This will revert old stats and apply new ones.',
      confirmText: 'Save Changes',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    setIsSaving(true);
    try {
      // Find selected MOTM player name if set (supports Co-op home_player_ids / away_player_ids)
      let selMotmName = motmPlayerName;
      if (motmPlayerId) {
        for (const m of matchups) {
          const hIds = m.home_player_ids?.length ? m.home_player_ids : (m.home_player_id ? [m.home_player_id] : []);
          const hNames = m.home_player_names?.length ? m.home_player_names : (m.home_player_name ? [m.home_player_name] : []);
          const hIdx = hIds.indexOf(motmPlayerId);
          if (hIdx !== -1) {
            selMotmName = hNames[hIdx] || m.home_player_name;
            break;
          }
          const aIds = m.away_player_ids?.length ? m.away_player_ids : (m.away_player_id ? [m.away_player_id] : []);
          const aNames = m.away_player_names?.length ? m.away_player_names : (m.away_player_name ? [m.away_player_name] : []);
          const aIdx = aIds.indexOf(motmPlayerId);
          if (aIdx !== -1) {
            selMotmName = aNames[aIdx] || m.away_player_name;
            break;
          }
        }
      }

      // Prepare edited matchups with scores, Co-op per-player goals, and sub penalties
      const editedMatchups = matchups.map(m => {
        const entry = editedScores[m.position];
        const homePlayers = entry?.homePlayers;
        const awayPlayers = entry?.awayPlayers;
        return {
          position: m.position,
          home_player_id: m.home_player_id,
          home_player_name: m.home_player_name,
          away_player_id: m.away_player_id,
          away_player_name: m.away_player_name,
          ...(m.home_player_ids ? { home_player_ids: m.home_player_ids } : {}),
          ...(m.away_player_ids ? { away_player_ids: m.away_player_ids } : {}),
          ...(m.match_mode ? { match_mode: m.match_mode } : {}),
          ...(homePlayers ? { home_player_goals: homePlayers } : {}),
          ...(awayPlayers ? { away_player_goals: awayPlayers } : {}),
          home_goals: homePlayers ? homePlayers.reduce((s, g) => s + (Number(g) || 0), 0) : (entry?.home ?? m.home_goals ?? 0),
          away_goals: awayPlayers ? awayPlayers.reduce((s, g) => s + (Number(g) || 0), 0) : (entry?.away ?? m.away_goals ?? 0),
          home_sub_penalty: editedSubPenalties[m.position]?.home ?? m.home_sub_penalty ?? 0,
          away_sub_penalty: editedSubPenalties[m.position]?.away ?? m.away_sub_penalty ?? 0,
        };
      });

      const response = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/edit-result`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          matchups: editedMatchups,
          motm_player_id: motmPlayerId,
          motm_player_name: selMotmName,
          home_penalty_goals: homePenaltyGoals,
          away_penalty_goals: awayPenaltyGoals,
          edited_by: user?.uid,
          edited_by_name: (user as any)?.displayName || user?.email,
          edit_reason: reason || 'Result corrected by committee admin'
        })
      });

      if (response.ok) {
        showAlert({
          type: 'success',
          title: 'Results Updated',
          message: 'Results updated successfully! Stats have been recalculated.'
        });
        setIsEditMode(false);
        fetchFixtureData(); // Reload data
      } else {
        const error = await response.json();
        showAlert({
          type: 'error',
          title: 'Save Failed',
          message: error.error || 'Unknown error'
        });
      }
    } catch (error: any) {
      console.error('Error saving results:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to save results. Please try again.'
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono text-slate-800">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold animate-pulse">Loading fixture...</p>
        </div>
      </div>
    );
  }


  if (!fixture) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Fixture Not Found</h1>
          <Link href="/dashboard/committee/team-management/tournament" className="text-blue-600 mt-4 inline-block">
            &larr; Back to Tournament
          </Link>
        </div>
      </div>
    );
  }

  const isTripleThreat = Boolean(
    fixture && (
      fixture.tournament_type === 'triple_threat' ||
      fixture.matchday_format === 'triple_threat' ||
      fixture.scoring_system === 'triple_threat' ||
      fixture.knockout_format === 'triple_threat' ||
      fixture.tournament_id?.toLowerCase().includes('triple_threat')
    )
  );

  const formatPlayerArray = (arr: any) => {
    if (!arr || !Array.isArray(arr) || arr.length === 0) return 'None';
    return arr.map((item: any) => {
      if (typeof item === 'object') return item.player_name || item.name || item.player_id || 'Player';
      return String(item);
    }).join(' & ');
  };

  const displayMotmName = fixture?.motm_player_name || motmPlayerName || (
    (fixture?.motm_player_id || motmPlayerId) ? matchups.flatMap(m => {
      const list: { id: string; name: string }[] = [];
      if (m.home_player_ids && m.home_player_ids.length > 0) {
        m.home_player_ids.forEach((id, idx) => list.push({ id, name: m.home_player_names?.[idx] || id }));
      } else if (m.home_player_id) {
        list.push({ id: m.home_player_id, name: m.home_player_name });
      }
      if (m.away_player_ids && m.away_player_ids.length > 0) {
        m.away_player_ids.forEach((id, idx) => list.push({ id, name: m.away_player_names?.[idx] || id }));
      } else if (m.away_player_id) {
        list.push({ id: m.away_player_id, name: m.away_player_name });
      }
      return list;
    }).find(p => p.id === (fixture?.motm_player_id || motmPlayerId))?.name : null
  );

  const getShareableFixtureText = () => {
    if (!fixture) return '';
    return formatFixtureShareText({
      fixture: {
        ...fixture,
        motm_player_name: displayMotmName || fixture.motm_player_name,
        home_penalty_goals: homePenaltyGoals,
        away_penalty_goals: awayPenaltyGoals,
      },
      matchups,
      scoringSystem: fixture.scoring_system || fixture.scoring_type,
      homePenaltyGoals,
      awayPenaltyGoals,
    });
  };

  const copyWithFeedback = async (text: string, key: 'fixture' | 'home' | 'away', successMessage: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey((prev) => (prev === key ? null : prev)), 2000);
      showAlert({
        type: 'success',
        title: 'Copied!',
        message: successMessage,
      });
    } catch {
      showAlert({
        type: 'error',
        title: 'Copy Failed',
        message: 'Failed to copy to clipboard',
      });
    }
  };

  const handleCopyFixtureText = () => {
    const text = getShareableFixtureText();
    if (!text) {
      showAlert({
        type: 'warning',
        title: 'Nothing to Copy',
        message: 'Create matchups first before copying standard fixture text.',
      });
      return;
    }
    copyWithFeedback(text, 'fixture', 'Fixture text copied to clipboard');
  };

  const handleWhatsAppShare = () => {
    const text = getShareableFixtureText();
    if (!text) {
      showAlert({
        type: 'warning',
        title: 'Nothing to Share',
        message: 'Create matchups first before sharing on WhatsApp.',
      });
      return;
    }
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
  };

  const resolvedHomeTTLineup =
    homeLineup?.triple_threat_lineup ||
    (isTripleThreat ? extractTripleThreatLineupFromMatchups(matchups, 'home') : null);
  const resolvedAwayTTLineup =
    awayLineup?.triple_threat_lineup ||
    (isTripleThreat ? extractTripleThreatLineupFromMatchups(matchups, 'away') : null);

  const handleCopyTripleThreatLineup = (side: 'home' | 'away') => {
    if (!fixture) return;
    const lineup = side === 'home' ? resolvedHomeTTLineup : resolvedAwayTTLineup;
    if (!lineup) return;
    const teamName = side === 'home' ? fixture.home_team_name : fixture.away_team_name;
    const text = formatTripleThreatLineupCopy({
      teamName,
      side,
      lineup,
      fixture,
    });
    copyWithFeedback(text, side, `${teamName} lineup copied to clipboard`);
  };

  const fixtureDisplayStatus = String(fixture.status || 'scheduled').toLowerCase();
  const isFixtureCompleted = fixtureDisplayStatus === 'completed';
  const isFixtureCancelled = fixtureDisplayStatus === 'cancelled';
  const isFixturePaused =
    !isFixtureCompleted &&
    !isFixtureCancelled &&
    (fixtureDisplayStatus === 'paused' || fixture.round_status === 'paused');
  const isFixtureActive =
    !isFixtureCompleted &&
    !isFixtureCancelled &&
    !isFixturePaused &&
    (fixtureDisplayStatus === 'in_progress' ||
      fixtureDisplayStatus === 'active' ||
      fixture.round_status === 'active');

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 px-4 sm:px-6">
      {/* Decorative glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/committee/team-management/tournament?tab=fixtures&tournament=${fixture.tournament_id}&round=${fixture.round_number}`}
            className="p-3 bg-white border border-slate-200/60 hover:bg-slate-50 rounded-2xl text-slate-600 transition-all shadow-sm shrink-0 cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-gray-900 tracking-tight">
              Committee Fixture Management
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs font-mono text-slate-500">
              <span>
                {(fixture as any).knockout_round ? (
                  <>
                    {(fixture as any).knockout_round === 'quarter_finals' && (
                      <span className="inline-flex items-center gap-1 text-rose-500 font-semibold"><Swords className="w-4 h-4" /> Quarter Finals</span>
                    )}
                    {(fixture as any).knockout_round === 'semi_finals' && (
                      <span className="inline-flex items-center gap-1 text-amber-500 font-semibold"><Trophy className="w-4 h-4" /> Semi Finals</span>
                    )}
                    {(fixture as any).knockout_round === 'finals' && (
                      <span className="inline-flex items-center gap-1 text-amber-500 font-semibold"><Crown className="w-4 h-4" /> Finals</span>
                    )}
                    {(fixture as any).knockout_round === 'third_place' && (
                      <span className="inline-flex items-center gap-1 text-amber-700 font-semibold"><Trophy className="w-4 h-4" /> Third Place Playoff</span>
                    )}
                  </>
                ) : (
                  `Round ${fixture.round_number}`
                )}
              </span>
              <span>•</span>
              <span>Match {fixture.match_number}</span>
              <span>•</span>
              <span>{fixture.leg === 'first' ? '1st Leg' : '2nd Leg'}</span>
              
              {(fixture as any).knockout_round && (
                <>
                  <span>•</span>
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-gradient-to-r from-purple-500 to-pink-500 text-white shadow-sm">
                    KNOCKOUT
                  </span>
                </>
              )}
              
              {(isTripleThreat || (fixture as any).scoring_system) && (
                <>
                  <span>•</span>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                    isTripleThreat
                      ? 'bg-amber-50 text-amber-800 border border-amber-200'
                      : (fixture as any).scoring_system === 'wins'
                        ? 'bg-amber-50 text-amber-800 border border-amber-200'
                        : 'bg-blue-50 text-blue-800 border border-blue-200'
                  }`}>
                    {isTripleThreat
                      ? '⚡ Triple Threat'
                      : (fixture as any).scoring_system === 'wins'
                        ? 'Win-Based'
                        : 'Goal-Based'}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Fixture Details */}
        <div className="lg:col-span-2 space-y-6">
          {/* Match Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
            <div className="flex flex-col md:flex-row items-center justify-between gap-6 mb-6">
              {/* Home Team */}
              <div className="flex-1 text-center md:text-left w-full">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-2">
                  <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">{fixture.home_team_name}</h2>
                  <button
                    onClick={() => {
                      if (isTripleThreat) {
                        setShowTTLineupModal('home');
                      } else {
                        setShowLineupEditor('home');
                      }
                    }}
                    className="self-center md:self-auto px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" /> {isTripleThreat ? (homeLineup?.triple_threat_lineup ? 'Edit Lineup' : 'Set Lineup') : 'Edit Lineup'}
                  </button>
                </div>
                <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Home Team</p>
              </div>

              {/* Score / Status */}
              <div className="text-center px-6 py-4 bg-slate-50 border border-slate-100 rounded-3xl shrink-0 min-w-[140px]">
                {isTripleThreat && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 mb-1.5 text-[9px] font-black uppercase font-mono tracking-wider bg-amber-500 text-white rounded shadow-2xs">
                    ⚡ Triple Threat
                  </span>
                )}
                <div className="text-3xl font-black text-slate-800 tracking-tight">
                  {fixture.home_score ?? '-'} : {fixture.away_score ?? '-'}
                </div>
                {isTripleThreat && (
                  <div className="text-[10px] font-mono font-extrabold text-amber-600 uppercase tracking-wider mt-0.5">
                    Matchday Points
                  </div>
                )}
                {fixture.clean_sweep_winner && (
                  <div className="mt-1 px-2 py-0.5 rounded-full text-[9px] font-black bg-amber-100 text-amber-800 border border-amber-300">
                    🔥 Clean Sweep (+1 Pt)
                  </div>
                )}
                {isTripleThreat && (fixture.home_points_difference !== undefined) && (
                  <div className="text-[10px] font-mono font-bold text-slate-500 mt-1">
                    GD: {(fixture.home_points_difference ?? 0) > 0 ? `+${fixture.home_points_difference}` : (fixture.home_points_difference ?? 0)} vs {(fixture.away_points_difference ?? 0) > 0 ? `+${fixture.away_points_difference}` : (fixture.away_points_difference ?? 0)}
                  </div>
                )}
                <div className="mt-1">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold font-mono uppercase ${
                    isFixtureCompleted ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                    isFixtureCancelled ? 'bg-rose-50 text-rose-700 border border-rose-200' :
                    isFixturePaused ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                    isFixtureActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                    'bg-sky-50 text-sky-700 border border-sky-250'
                  }`}>
                    {isFixtureCompleted ? 'completed' : isFixtureCancelled ? 'cancelled' : isFixturePaused ? 'paused' : isFixtureActive ? 'active' : fixture.status}
                  </span>
                </div>
                {matchups.length === 0 && fixture.status !== 'completed' && (
                  isTripleThreat ? (
                    <button
                      onClick={() => {
                        if (!homeLineup?.triple_threat_lineup) setShowTTLineupModal('home');
                        else if (!awayLineup?.triple_threat_lineup) setShowTTLineupModal('away');
                        else handleGenerateTripleThreatMatchups();
                      }}
                      className="mt-3 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold font-mono uppercase tracking-wider rounded-lg transition-all shadow-sm flex items-center gap-1 mx-auto cursor-pointer"
                    >
                      <Zap className="w-3 h-3 fill-white" /> {!homeLineup?.triple_threat_lineup ? 'Set Home Lineup' : !awayLineup?.triple_threat_lineup ? 'Set Away Lineup' : 'Generate Matchups'}
                    </button>
                  ) : (
                    <button
                      onClick={() => setShowMatchupCreator(true)}
                      className="mt-3 px-3 py-1.5 bg-rose-500 hover:bg-rose-600 text-white text-[10px] font-bold font-mono uppercase tracking-wider rounded-lg transition-all shadow-sm flex items-center gap-1 mx-auto cursor-pointer"
                    >
                      <Swords className="w-3 h-3" /> Add Matchups
                    </button>
                  )
                )}
              </div>

              {/* Away Team */}
              <div className="flex-1 text-center md:text-right w-full">
                <div className="flex flex-col md:flex-row-reverse md:items-center justify-between gap-3 mb-2">
                  <h2 className="text-xl sm:text-2xl font-black text-gray-900 tracking-tight">{fixture.away_team_name}</h2>
                  <button
                    onClick={() => {
                      if (isTripleThreat) {
                        setShowTTLineupModal('away');
                      } else {
                        setShowLineupEditor('away');
                      }
                    }}
                    className="self-center md:self-auto px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Pencil className="w-3.5 h-3.5" /> {isTripleThreat ? (awayLineup?.triple_threat_lineup ? 'Edit Lineup' : 'Submit on Behalf') : 'Edit Lineup'}
                  </button>
                </div>
                <p className="text-xs font-mono uppercase tracking-wider text-slate-400">Away Team</p>
              </div>
            </div>

            {/* MOTM Banner */}
            {displayMotmName ? (
              <div className="mt-4 mb-4 p-3.5 bg-gradient-to-r from-amber-500/15 via-yellow-400/25 to-amber-500/15 border-2 border-amber-400/80 rounded-2xl flex items-center justify-between gap-3 shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 text-white flex items-center justify-center font-black shadow-sm shrink-0">
                    <Star className="w-5 h-5 fill-white text-white" />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono font-black uppercase text-amber-800 tracking-wider block">⭐ MAN OF THE MATCH</span>
                    <span className="text-base font-black text-slate-900">{displayMotmName}</span>
                  </div>
                </div>
                {!isEditMode && (
                  <button
                    onClick={() => setIsEditMode(true)}
                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all cursor-pointer shrink-0 shadow-xs flex items-center gap-1.5"
                  >
                    <Pencil className="w-3.5 h-3.5" /> Edit MOTM
                  </button>
                )}
              </div>
            ) : (
              !isEditMode && fixture.status === 'completed' && (
                <div className="mt-4 mb-4 p-3 bg-slate-50 border border-dashed border-amber-300 rounded-2xl flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-xs font-mono text-amber-800">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0" />
                    <span>No Man of the Match assigned for this fixture.</span>
                  </div>
                  <button
                    onClick={() => setIsEditMode(true)}
                    className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold font-mono rounded-xl transition-all cursor-pointer shrink-0 shadow-xs flex items-center gap-1"
                  >
                    <Star className="w-3.5 h-3.5 fill-white" /> Assign MOTM
                  </button>
                </div>
              )
            )}

            {fixture.match_status_reason && (
              <div className={`p-4 rounded-2xl mb-4 ${fixture.match_status_reason.includes('wo') ? 'bg-orange-50 border border-orange-200 text-orange-850' :
                'bg-slate-50 border border-slate-200 text-slate-750'
                }`}>
                <p className="font-bold text-sm flex items-center gap-1.5">
                  {fixture.match_status_reason === 'wo_home_absent' && (
                    <>
                      <AlertTriangle className="w-4 h-4 text-orange-600" /> Walkover - Home team absent
                    </>
                  )}
                  {fixture.match_status_reason === 'wo_away_absent' && (
                    <>
                      <AlertTriangle className="w-4 h-4 text-orange-600" /> Walkover - Away team absent
                    </>
                  )}
                  {fixture.match_status_reason === 'null_both_absent' && (
                    <>
                      <XCircle className="w-4 h-4 text-rose-600" /> {fixture.notes?.includes('Fantasy') ? 'Match NULL (Fantasy Points Preserved)' : 'Match NULL - Both teams absent'}
                    </>
                  )}
                </p>
              </div>
            )}

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-4 text-xs font-mono text-slate-500 mt-4 pt-4 border-t border-slate-100">
              <div>
                <strong className="text-slate-700 uppercase tracking-wider text-[10px] block mb-1">Created</strong> 
                {fixture.created_at ? new Date(fixture.created_at).toLocaleString() : 'N/A'}
                {fixture.created_by_name && <span className="text-[10px] text-slate-400 block mt-0.5">by {fixture.created_by_name}</span>}
              </div>
              {fixture.result_submitted_at && (
                <div>
                  <strong className="text-slate-700 uppercase tracking-wider text-[10px] block mb-1">Result Submitted</strong> 
                  {new Date(fixture.result_submitted_at).toLocaleString()}
                  {fixture.result_submitted_by_name && <span className="text-[10px] text-slate-400 block mt-0.5">by {fixture.result_submitted_by_name}</span>}
                </div>
              )}
            </div>
          </div>

          {/* Matchups */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
            <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
              <h3 className="text-lg font-black text-gray-900 tracking-tight">Individual Matchups</h3>
              {!isEditMode && (
                <div className="flex flex-wrap items-center gap-2">
                  {(matchups.length > 0 || isTripleThreat) && (
                    <>
                      <button
                        type="button"
                        onClick={handleWhatsAppShare}
                        className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all border border-emerald-200/80 shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        <span>WhatsApp</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleCopyFixtureText}
                        className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all border border-blue-200/80 shadow-xs flex items-center gap-1.5 cursor-pointer"
                      >
                        {copiedKey === 'fixture' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                        <span>{copiedKey === 'fixture' ? 'Copied' : 'Copy Fixture'}</span>
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => setShowMatchupCreator(true)}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all border border-slate-200 shadow-sm flex items-center gap-1.5 cursor-pointer"
                  >
                    <Swords className="w-3.5 h-3.5 text-slate-500" /> {matchups.length === 0 ? 'Create Matchups' : 'Manage Matchups'}
                  </button>
                  {matchups.length > 0 && (
                    <button
                      onClick={() => setIsEditMode(true)}
                      className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
                    >
                      <Pencil className="w-3.5 h-3.5" /> Edit Results
                    </button>
                  )}
                </div>
              )}
              {isEditMode && (
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      setIsEditMode(false);
                      fetchFixtureData();
                    }}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all border border-slate-200 cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSaveResults}
                    disabled={isSaving}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                  >
                    {isSaving ? 'Saving...' : (
                      <>
                        <Save className="w-3.5 h-3.5" /> Save Changes
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>

            {/* MOTM & Fine Penalty Controls in Edit Mode */}
            {isEditMode && (
              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-4 space-y-4 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <label className="text-xs font-extrabold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Star className="w-4 h-4 text-amber-500 fill-amber-500" /> Man of the Match (MOTM)
                  </label>
                  <select
                    value={motmPlayerId || ''}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      setMotmPlayerId(selectedId || null);
                      if (!selectedId) {
                        setMotmPlayerName(null);
                      } else {
                        const allPlayersMap = new Map<string, string>();
                        matchups.forEach(m => {
                          if (m.home_player_ids && m.home_player_ids.length > 0) {
                            m.home_player_ids.forEach((id, idx) => {
                              allPlayersMap.set(id, m.home_player_names?.[idx] || id);
                            });
                          } else if (m.home_player_id) {
                            allPlayersMap.set(m.home_player_id, m.home_player_name);
                          }
                          if (m.away_player_ids && m.away_player_ids.length > 0) {
                            m.away_player_ids.forEach((id, idx) => {
                              allPlayersMap.set(id, m.away_player_names?.[idx] || id);
                            });
                          } else if (m.away_player_id) {
                            allPlayersMap.set(m.away_player_id, m.away_player_name);
                          }
                        });
                        setMotmPlayerName(allPlayersMap.get(selectedId) || null);
                      }
                    }}
                    className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all cursor-pointer"
                  >
                    <option value="">-- None Selected --</option>
                    {(() => {
                      const optionsMap = new Map<string, string>();
                      matchups.forEach(m => {
                        if (m.home_player_ids && m.home_player_ids.length > 0) {
                          m.home_player_ids.forEach((id, idx) => {
                            optionsMap.set(id, `${m.home_player_names?.[idx] || id} (${fixture.home_team_name})`);
                          });
                        } else if (m.home_player_id) {
                          optionsMap.set(m.home_player_id, `${m.home_player_name} (${fixture.home_team_name})`);
                        }
                        if (m.away_player_ids && m.away_player_ids.length > 0) {
                          m.away_player_ids.forEach((id, idx) => {
                            optionsMap.set(id, `${m.away_player_names?.[idx] || id} (${fixture.away_team_name})`);
                          });
                        } else if (m.away_player_id) {
                          optionsMap.set(m.away_player_id, `${m.away_player_name} (${fixture.away_team_name})`);
                        }
                      });
                      return Array.from(optionsMap.entries()).map(([id, name]) => (
                        <option key={id} value={id}>{name}</option>
                      ));
                    })()}
                  </select>
                </div>

                {/* Team Fine / Penalty Goals */}
                <div className="pt-3 border-t border-slate-200/60 grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                      {fixture.home_team_name} Fine Penalty Goals
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={homePenaltyGoals}
                      onChange={(e) => setHomePenaltyGoals(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">
                      {fixture.away_team_name} Fine Penalty Goals
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={awayPenaltyGoals}
                      onChange={(e) => setAwayPenaltyGoals(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Triple Threat Match Engine & Lineup Status (When 0 matchups) */}
            {isTripleThreat && matchups.length === 0 && (
              <div className="p-6 bg-gradient-to-br from-amber-500/5 via-slate-50 to-indigo-500/5 border-2 border-dashed border-amber-300 rounded-3xl space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div>
                    <span className="px-2.5 py-1 text-[10px] font-black uppercase font-mono tracking-wider bg-amber-500 text-white rounded-lg inline-flex items-center gap-1 shadow-xs">
                      ⚡ Triple Threat Engine
                    </span>
                    <h4 className="text-base sm:text-lg font-black text-slate-900 mt-2 tracking-tight">
                      Triple Threat Matchups Awaiting Lineups
                    </h4>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      Both teams submit 5 unique players across 3 modes: Co-op (2v2), Duo (2 × 1v1 Goal Based), and Single (1v1).
                    </p>
                  </div>
                  {homeLineup?.triple_threat_lineup && awayLineup?.triple_threat_lineup && (
                    <button
                      type="button"
                      onClick={handleGenerateTripleThreatMatchups}
                      disabled={isGeneratingTTMatchups}
                      className="px-4 py-2.5 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-mono text-xs font-black uppercase tracking-wider rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer shrink-0 disabled:opacity-50"
                    >
                      <Zap className="w-4 h-4 fill-white" />
                      {isGeneratingTTMatchups ? 'Generating...' : 'Generate 4 Matchups'}
                    </button>
                  )}
                </div>

                {/* 3 Modes Visual Overview */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3.5 bg-white border border-indigo-200/80 rounded-2xl shadow-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🎮</span>
                      <div>
                        <div className="text-xs font-black text-indigo-950 uppercase font-mono">Mode 1: Co-op</div>
                        <div className="text-[11px] text-indigo-700/80 font-bold">2v2 Matchup (2 Players)</div>
                      </div>
                    </div>
                  </div>
                  <div className="p-3.5 bg-white border border-emerald-200/80 rounded-2xl shadow-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">🤝</span>
                      <div>
                        <div className="text-xs font-black text-emerald-950 uppercase font-mono">Mode 2: Duo</div>
                        <div className="text-[11px] text-emerald-700/80 font-bold">2 × 1v1 Goal Based (2 Players)</div>
                      </div>
                    </div>
                  </div>
                  <div className="p-3.5 bg-white border border-amber-200/80 rounded-2xl shadow-xs">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">⚔️</span>
                      <div>
                        <div className="text-xs font-black text-amber-950 uppercase font-mono">Mode 3: Single</div>
                        <div className="text-[11px] text-amber-700/80 font-bold">1v1 Matchup (1 Player)</div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Team Submission Statuses */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Home Team Card */}
                  <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-800 uppercase tracking-tight truncate max-w-[200px]">
                        {fixture.home_team_name}
                      </span>
                      {homeLineup?.triple_threat_lineup ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Submitted
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Pending
                        </span>
                      )}
                    </div>
                    {homeLineup?.triple_threat_lineup ? (
                      <div className="text-xs font-mono text-slate-600 space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div><strong className="text-indigo-600">🎮 Co-op:</strong> {formatPlayerArray(homeLineup.triple_threat_lineup.coop)}</div>
                        <div><strong className="text-emerald-600">🤝 Duo:</strong> {formatPlayerArray(homeLineup.triple_threat_lineup.duo)}</div>
                        <div><strong className="text-amber-600">⚔️ Single:</strong> {formatPlayerArray(homeLineup.triple_threat_lineup.single)}</div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 font-mono italic">
                        Home team has not submitted their 5 players yet.
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowTTLineupModal('home')}
                        className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white font-mono text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        {homeLineup?.triple_threat_lineup ? 'Edit Home Lineup' : 'Set Home Lineup (5 Players)'}
                      </button>
                      {resolvedHomeTTLineup && (
                        <button
                          type="button"
                          onClick={() => handleCopyTripleThreatLineup('home')}
                          className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-mono text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                          title="Copy Home Lineup"
                        >
                          {copiedKey === 'home' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedKey === 'home' ? 'Copied' : 'Copy'}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Away Team Card */}
                  <div className="p-4 bg-white border border-slate-200 rounded-2xl space-y-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-black text-slate-800 uppercase tracking-tight truncate max-w-[200px]">
                        {fixture.away_team_name}
                      </span>
                      {awayLineup?.triple_threat_lineup ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-300 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" /> Submitted
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1">
                          <Clock className="w-3 h-3" /> Pending
                        </span>
                      )}
                    </div>
                    {awayLineup?.triple_threat_lineup ? (
                      <div className="text-xs font-mono text-slate-600 space-y-1 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                        <div><strong className="text-indigo-600">🎮 Co-op:</strong> {formatPlayerArray(awayLineup.triple_threat_lineup.coop)}</div>
                        <div><strong className="text-emerald-600">🤝 Duo:</strong> {formatPlayerArray(awayLineup.triple_threat_lineup.duo)}</div>
                        <div><strong className="text-amber-600">⚔️ Single:</strong> {formatPlayerArray(awayLineup.triple_threat_lineup.single)}</div>
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 font-mono italic">
                        Away team has not submitted. Committee can submit on their behalf.
                      </p>
                    )}
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowTTLineupModal('away')}
                        className="flex-1 py-2 bg-amber-500 hover:bg-amber-600 text-white font-mono text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        {awayLineup?.triple_threat_lineup ? 'Edit Away Lineup' : 'Submit Away Lineup (On Behalf)'}
                      </button>
                      {resolvedAwayTTLineup && (
                        <button
                          type="button"
                          onClick={() => handleCopyTripleThreatLineup('away')}
                          className="px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 font-mono text-xs font-bold uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
                          title="Copy Away Lineup"
                        >
                          {copiedKey === 'away' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          <span>{copiedKey === 'away' ? 'Copied' : 'Copy'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-3 bg-amber-50/80 border border-amber-200/80 rounded-2xl text-[11px] font-mono text-amber-900 flex items-start gap-2">
                  <span className="text-amber-600 text-sm">💡</span>
                  <span>
                    <strong>Option 2: Committee Submits on Their Behalf</strong> — If the Away Team (or Home Team) shared their lineup in WhatsApp or had a technical issue, use the buttons above to select 5 players from their active roster. Co-op (2v2) and Single (1v1) matchups will be generated automatically; Duo (2 × 1v1) is paired manually so teams choose their 1v1 pairings.
                  </span>
                </div>
              </div>
            )}

            {isTripleThreat &&
              matchups.length > 0 &&
              !matchups.some((m) => resolveTripleThreatMode(m) === 'duo') &&
              homeLineup?.triple_threat_lineup?.duo?.length >= 2 &&
              awayLineup?.triple_threat_lineup?.duo?.length >= 2 && (() => {
                const homeDuo = homeLineup.triple_threat_lineup.duo.slice(0, 2);
                const awayDuo = awayLineup.triple_threat_lineup.duo.slice(0, 2);
                const getId = (p: any) => String(typeof p === 'object' ? (p.player_id || p.id || '') : p);
                const getName = (p: any) => String(typeof p === 'object' ? (p.player_name || p.name || p.player_id || '') : p);

                const handleSaveCommitteeDuo = async () => {
                  if (!ttDuoAwayIds[0] || !ttDuoAwayIds[1] || ttDuoAwayIds[0] === ttDuoAwayIds[1]) {
                    showAlert({
                      type: 'warning',
                      title: 'Incomplete Duo Pairings',
                      message: 'Select distinct Away Duo players for both Duo 1v1 matches.',
                    });
                    return;
                  }
                  setIsSavingTTDuo(true);
                  try {
                    const res = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/matchups`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        mode: 'triple_threat_duo',
                        created_by: user?.uid || 'admin',
                        allow_overwrite: false,
                        matchups: [0, 1].map((slotIdx) => {
                          const hp = homeDuo[slotIdx];
                          const ap = awayDuo.find((p: any) => getId(p) === ttDuoAwayIds[slotIdx]) || awayDuo[slotIdx];
                          return {
                            position: slotIdx + 2,
                            match_mode: 'duo',
                            home_player_id: getId(hp),
                            home_player_name: getName(hp),
                            away_player_id: getId(ap),
                            away_player_name: getName(ap),
                            match_duration: ttDuoDurations[slotIdx] || 6,
                          };
                        }),
                      }),
                    });
                    const json = await res.json().catch(() => ({}));
                    if (res.status === 409 && json.error === 'MATCHUPS_ALREADY_EXIST') {
                      showAlert({
                        type: 'info',
                        title: 'Duo Already Created',
                        message: 'Duo matchups were already created. Refreshing fixture data...',
                      });
                      await fetchFixtureData(true);
                      return;
                    }
                    if (!res.ok) throw new Error(json.error || 'Failed to save Duo matchups');
                    if (Array.isArray(json.matchups)) {
                      setMatchups(json.matchups);
                    }
                    showAlert({
                      type: 'success',
                      title: 'Duo Matchups Saved',
                      message: 'Duo (2 × 1v1) matchups created successfully!',
                    });
                    await fetchFixtureData(true);
                  } catch (err: any) {
                    showAlert({
                      type: 'error',
                      title: 'Save Failed',
                      message: err?.message || 'Failed to create Duo matchups',
                    });
                  } finally {
                    setIsSavingTTDuo(false);
                  }
                };

                return (
                  <div className="mb-4 p-4 bg-emerald-50/60 border border-emerald-200 rounded-2xl space-y-3 font-mono">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-black uppercase tracking-wider text-emerald-900">
                        🤝 Pair Duo (2 × 1v1) Matchups
                      </span>
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                        Pending Pairing
                      </span>
                    </div>
                    {[0, 1].map((slotIdx) => (
                      <div key={slotIdx} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr_auto] gap-2 items-center bg-white border border-slate-200 rounded-xl p-2.5">
                        <div className="text-xs font-extrabold text-slate-900 px-2">
                          Match #{slotIdx + 2}: {getName(homeDuo[slotIdx])}
                        </div>
                        <span className="text-[10px] font-black text-slate-400 text-center">VS</span>
                        <select
                          value={ttDuoAwayIds[slotIdx]}
                          onChange={(e) => {
                            const val = e.target.value;
                            setTtDuoAwayIds((prev) => {
                              const next: [string, string] = [...prev] as [string, string];
                              next[slotIdx] = val;
                              if (val && awayDuo.length === 2) {
                                const other = awayDuo.find((p: any) => getId(p) !== val);
                                if (other) next[slotIdx === 0 ? 1 : 0] = getId(other);
                              }
                              return next;
                            });
                          }}
                          className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800"
                        >
                          <option value="">Select Away Duo player...</option>
                          {awayDuo.map((p: any) => (
                            <option key={getId(p)} value={getId(p)}>{getName(p)}</option>
                          ))}
                        </select>
                        <select
                          value={ttDuoDurations[slotIdx]}
                          onChange={(e) => {
                            const val = Number(e.target.value) || 6;
                            setTtDuoDurations((prev) => {
                              const next: [number, number] = [...prev] as [number, number];
                              next[slotIdx] = val;
                              return next;
                            });
                          }}
                          className="px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
                        >
                          {[6, 7, 8, 9, 10, 11, 12].map((m) => (
                            <option key={m} value={m}>{m}m</option>
                          ))}
                        </select>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={handleSaveCommitteeDuo}
                      disabled={isSavingTTDuo || !ttDuoAwayIds[0] || !ttDuoAwayIds[1]}
                      className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold uppercase tracking-wider disabled:opacity-50 cursor-pointer"
                    >
                      {isSavingTTDuo ? 'Saving Duo...' : '✓ Save Duo (2 × 1v1) Matchups'}
                    </button>
                  </div>
                );
              })()}

            {!isTripleThreat && matchups.length === 0 && (
              <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                <Swords className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-mono text-slate-500 uppercase tracking-wider">No matchups created yet</p>
                <button
                  type="button"
                  onClick={() => setShowMatchupCreator(true)}
                  className="mt-3 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                >
                  Create Matchups
                </button>
              </div>
            )}

            <div className="space-y-3">
              {matchups.map((matchup) => {
                const motmId = fixture?.motm_player_id;
                const isHomeMotm = (motmId && (matchup.home_player_id === motmId || matchup.home_player_ids?.includes(motmId))) || 
                                   (displayMotmName && (matchup.home_player_name.trim().toLowerCase() === displayMotmName.trim().toLowerCase() || matchup.home_player_names?.some(n => n.trim().toLowerCase() === displayMotmName.trim().toLowerCase())));
                const isAwayMotm = (motmId && (matchup.away_player_id === motmId || matchup.away_player_ids?.includes(motmId))) || 
                                   (displayMotmName && (matchup.away_player_name.trim().toLowerCase() === displayMotmName.trim().toLowerCase() || matchup.away_player_names?.some(n => n.trim().toLowerCase() === displayMotmName.trim().toLowerCase())));

                const isTT = fixture?.tournament_type === 'triple_threat' || fixture?.matchday_format === 'triple_threat' || !!matchup.match_mode;
                const modeDisplay = isTT ? getTripleThreatModeDisplay(matchups, matchup) : null;

                const homeName = (matchup.home_player_names && matchup.home_player_names.length > 0)
                  ? matchup.home_player_names.join(' & ')
                  : matchup.home_player_name;
                const awayName = (matchup.away_player_names && matchup.away_player_names.length > 0)
                  ? matchup.away_player_names.join(' & ')
                  : matchup.away_player_name;

                const homeGoalsVal = isEditMode ? (editedScores[matchup.position]?.home ?? 0) : (matchup.home_goals ?? 0);
                const awayGoalsVal = isEditMode ? (editedScores[matchup.position]?.away ?? 0) : (matchup.away_goals ?? 0);

                // Compute mode-level points using Triple Threat engine (handles Duo 2x1v1 aggregate goals)
                const ttComputed = isTT
                  ? calculateTripleThreatFixture(
                      matchups.map((m) => ({
                        position: m.position,
                        mode: resolveTripleThreatMode(m),
                        home_goals: isEditMode ? (editedScores[m.position]?.home ?? 0) : m.home_goals,
                        away_goals: isEditMode ? (editedScores[m.position]?.away ?? 0) : m.away_goals,
                      }))
                    )
                  : null;
                const modeSummary = isTT && ttComputed && modeDisplay ? ttComputed.modeResults[modeDisplay.mode] : null;
                const modeHomePts = modeSummary && modeSummary.played ? modeSummary.home_points : null;
                const modeAwayPts = modeSummary && modeSummary.played ? modeSummary.away_points : null;

                return (
                  <div key={matchup.id} className={`rounded-2xl p-4 transition-all ${
                    isHomeMotm || isAwayMotm 
                      ? 'bg-amber-50/40 border-2 border-amber-300 shadow-xs' 
                      : 'bg-slate-50/60 border border-slate-100 hover:bg-slate-50'
                  }`}>
                    {isTT && modeDisplay && (
                      <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200/50 gap-2 flex-wrap">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase font-mono border ${modeDisplay.badgeClass}`}>
                          <span>{modeDisplay.icon}</span>
                          <span>{modeDisplay.longTitle}</span>
                        </span>
                        {modeHomePts !== null && (
                          <span className="text-[10px] font-mono font-bold text-slate-500">
                            {modeDisplay.mode === 'duo' && modeDisplay.isSubMatch && modeSummary
                              ? `Duo Aggregate (${modeSummary.home_goals}-${modeSummary.away_goals}): `
                              : 'Points Awarded: '}
                            <span className="text-slate-800 font-extrabold">{modeHomePts} pts</span> - <span className="text-slate-800 font-extrabold">{modeAwayPts} pts</span>
                          </span>
                        )}
                      </div>
                    )}
                    {(() => {
                      const isCoopMatch =
                        (isTT && modeDisplay?.mode === 'coop') ||
                        (matchup.home_player_ids?.length || 0) > 1 ||
                        (matchup.away_player_ids?.length || 0) > 1;
                      const hIds = matchup.home_player_ids?.length ? matchup.home_player_ids : (matchup.home_player_id ? [matchup.home_player_id] : []);
                      const hNames = matchup.home_player_names?.length ? matchup.home_player_names : [matchup.home_player_name];
                      const aIds = matchup.away_player_ids?.length ? matchup.away_player_ids : (matchup.away_player_id ? [matchup.away_player_id] : []);
                      const aNames = matchup.away_player_names?.length ? matchup.away_player_names : [matchup.away_player_name];
                      const currentEntry = editedScores[matchup.position] || { home: 0, away: 0 };

                      return (
                        <>
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0 flex items-center gap-1.5">
                              <p className="font-bold text-slate-800 text-sm truncate">{homeName}</p>
                              {isHomeMotm && (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-amber-400 to-amber-500 text-white shadow-2xs shrink-0">
                                  <Star className="w-3 h-3 fill-white" /> MOTM
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 mx-2 shrink-0">
                              {isEditMode && !isCoopMatch ? (
                                <>
                                  <input
                                    type="number"
                                    min="0"
                                    value={editedScores[matchup.position]?.home ?? 0}
                                    onChange={(e) => setEditedScores(prev => ({
                                      ...prev,
                                      [matchup.position]: { ...prev[matchup.position], home: parseInt(e.target.value) || 0 }
                                    }))}
                                    className="w-16 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-center font-bold text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                  />
                                  <span className="text-slate-400 font-bold">-</span>
                                  <input
                                    type="number"
                                    min="0"
                                    value={editedScores[matchup.position]?.away ?? 0}
                                    onChange={(e) => setEditedScores(prev => ({
                                      ...prev,
                                      [matchup.position]: { ...prev[matchup.position], away: parseInt(e.target.value) || 0 }
                                    }))}
                                    className="w-16 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-center font-bold text-sm focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                                  />
                                </>
                              ) : (
                                <span className="px-4 py-1.5 bg-white border border-slate-150 rounded-xl text-sm font-black text-slate-800 font-mono shadow-sm">
                                  {isEditMode ? `${currentEntry.home} : ${currentEntry.away}` : `${matchup.home_goals ?? '-'} : ${matchup.away_goals ?? '-'}`}
                                </span>
                              )}
                            </div>
                            <div className="flex-1 text-right min-w-0 flex items-center justify-end gap-1.5">
                              {isAwayMotm && (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-black bg-gradient-to-r from-amber-400 to-amber-500 text-white shadow-2xs shrink-0">
                                  <Star className="w-3 h-3 fill-white" /> MOTM
                                </span>
                              )}
                              <p className="font-bold text-slate-800 text-sm truncate">{awayName}</p>
                            </div>
                          </div>

                          {/* Co-op 2v2 Per-Player Goal Inputs (Edit Mode) or Goal Breakdown (View Mode) */}
                          {isCoopMatch && isEditMode && (
                            <div className="mt-3 pt-3 border-t border-indigo-200/70 grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div className="p-2.5 bg-indigo-50/60 border border-indigo-200/80 rounded-xl space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-mono font-black uppercase text-indigo-800">
                                  <span>{fixture.home_team_name} Scorers</span>
                                  <span>Total: {currentEntry.home}</span>
                                </div>
                                {hIds.map((pid, pIdx) => {
                                  const pGoals = currentEntry.homePlayers?.[pIdx] ?? 0;
                                  return (
                                    <div key={`committee-coop-h-${pid}-${pIdx}`} className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-bold text-slate-700 truncate">
                                        {hNames[pIdx] || `Player ${pIdx + 1}`}
                                      </span>
                                      <input
                                        type="number"
                                        min="0"
                                        value={pGoals}
                                        onChange={(e) => {
                                          const val = Math.max(0, parseInt(e.target.value) || 0);
                                          setEditedScores(prev => {
                                            const existing = prev[matchup.position] || { home: 0, away: 0 };
                                            const nextHome = [...(existing.homePlayers || Array(hIds.length).fill(0))];
                                            nextHome[pIdx] = val;
                                            return {
                                              ...prev,
                                              [matchup.position]: {
                                                ...existing,
                                                homePlayers: nextHome,
                                                home: nextHome.reduce((a, b) => a + (Number(b) || 0), 0),
                                              },
                                            };
                                          });
                                        }}
                                        className="w-16 px-2.5 py-1 bg-white border border-indigo-300 rounded-lg text-center font-bold text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                              <div className="p-2.5 bg-indigo-50/60 border border-indigo-200/80 rounded-xl space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-mono font-black uppercase text-indigo-800">
                                  <span>{fixture.away_team_name} Scorers</span>
                                  <span>Total: {currentEntry.away}</span>
                                </div>
                                {aIds.map((pid, pIdx) => {
                                  const pGoals = currentEntry.awayPlayers?.[pIdx] ?? 0;
                                  return (
                                    <div key={`committee-coop-a-${pid}-${pIdx}`} className="flex items-center justify-between gap-2">
                                      <span className="text-xs font-bold text-slate-700 truncate">
                                        {aNames[pIdx] || `Player ${pIdx + 1}`}
                                      </span>
                                      <input
                                        type="number"
                                        min="0"
                                        value={pGoals}
                                        onChange={(e) => {
                                          const val = Math.max(0, parseInt(e.target.value) || 0);
                                          setEditedScores(prev => {
                                            const existing = prev[matchup.position] || { home: 0, away: 0 };
                                            const nextAway = [...(existing.awayPlayers || Array(aIds.length).fill(0))];
                                            nextAway[pIdx] = val;
                                            return {
                                              ...prev,
                                              [matchup.position]: {
                                                ...existing,
                                                awayPlayers: nextAway,
                                                away: nextAway.reduce((a, b) => a + (Number(b) || 0), 0),
                                              },
                                            };
                                          });
                                        }}
                                        className="w-16 px-2.5 py-1 bg-white border border-indigo-300 rounded-lg text-center font-bold text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                                      />
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {isCoopMatch && !isEditMode && (matchup.home_player_goals?.length || matchup.away_player_goals?.length) && (
                            <div className="mt-2 pt-2 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2 text-[11px] font-mono text-slate-600">
                              <div>
                                {hNames.map((n, i) => `${n}: ${matchup.home_player_goals?.[i] ?? 0}G`).join(' • ')}
                              </div>
                              <div>
                                {aNames.map((n, i) => `${n}: ${matchup.away_player_goals?.[i] ?? 0}G`).join(' • ')}
                              </div>
                            </div>
                          )}
                        </>
                      );
                    })()}

                  {/* Sub Penalty Controls in Edit Mode */}
                  {isEditMode && (
                    <div className="mt-3 pt-3 border-t border-slate-200/50 flex flex-wrap items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-slate-500">Home Sub Penalty:</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditedSubPenalties(prev => ({
                              ...prev,
                              [matchup.position]: { ...prev[matchup.position], home: Math.max(0, (prev[matchup.position]?.home ?? 0) - 1) }
                            }))}
                            className="w-6 h-6 rounded-md bg-slate-100 border border-slate-300 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={editedSubPenalties[matchup.position]?.home ?? 0}
                            onChange={(e) => setEditedSubPenalties(prev => ({
                              ...prev,
                              [matchup.position]: { ...prev[matchup.position], home: Math.max(0, parseInt(e.target.value) || 0) }
                            }))}
                            className="w-12 text-center font-bold bg-white border border-slate-200 rounded-md py-0.5"
                          />
                          <button
                            type="button"
                            onClick={() => setEditedSubPenalties(prev => ({
                              ...prev,
                              [matchup.position]: { ...prev[matchup.position], home: (prev[matchup.position]?.home ?? 0) + 1 }
                            }))}
                            className="w-6 h-6 rounded-md bg-slate-100 border border-slate-300 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-slate-500">Away Sub Penalty:</span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setEditedSubPenalties(prev => ({
                              ...prev,
                              [matchup.position]: { ...prev[matchup.position], away: Math.max(0, (prev[matchup.position]?.away ?? 0) - 1) }
                            }))}
                            className="w-6 h-6 rounded-md bg-slate-100 border border-slate-300 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
                          >
                            -
                          </button>
                          <input
                            type="number"
                            min="0"
                            value={editedSubPenalties[matchup.position]?.away ?? 0}
                            onChange={(e) => setEditedSubPenalties(prev => ({
                              ...prev,
                              [matchup.position]: { ...prev[matchup.position], away: Math.max(0, parseInt(e.target.value) || 0) }
                            }))}
                            className="w-12 text-center font-bold bg-white border border-slate-200 rounded-md py-0.5"
                          />
                          <button
                            type="button"
                            onClick={() => setEditedSubPenalties(prev => ({
                              ...prev,
                              [matchup.position]: { ...prev[matchup.position], away: (prev[matchup.position]?.away ?? 0) + 1 }
                            }))}
                            className="w-6 h-6 rounded-md bg-slate-100 border border-slate-300 flex items-center justify-center font-bold text-slate-700 hover:bg-slate-200 cursor-pointer"
                          >
                            +
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Sub Penalty Badges in View Mode */}
                  {!isEditMode && ((matchup.home_sub_penalty || 0) > 0 || (matchup.away_sub_penalty || 0) > 0) && (
                    <div className="mt-2 pt-2 border-t border-slate-100 flex flex-wrap gap-2 justify-center text-[10px]">
                      {(matchup.home_sub_penalty || 0) > 0 && (
                        <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full font-extrabold">
                          +{matchup.home_sub_penalty} Sub Goal to {fixture.away_team_name}
                        </span>
                      )}
                      {(matchup.away_sub_penalty || 0) > 0 && (
                        <span className="px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded-full font-extrabold">
                          +{matchup.away_sub_penalty} Sub Goal to {fixture.home_team_name}
                        </span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          </div>
        </div>

        {/* Right Column - Actions & Timeline */}
        <div className="space-y-6">
          {/* Actions */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
            <h3 className="text-lg font-black text-gray-900 tracking-tight mb-4">Committee Actions</h3>
            <div className="space-y-3">
              {/* Copy Fixture Text & WhatsApp Share */}
              {(matchups.length > 0 || isTripleThreat) && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleCopyFixtureText}
                    className="px-3 py-2.5 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {copiedKey === 'fixture' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedKey === 'fixture' ? 'Copied!' : 'Copy Text'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleWhatsAppShare}
                    className="px-3 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded-xl text-xs font-bold font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <span>WhatsApp</span>
                  </button>
                </div>
              )}

              {/* Triple Threat Quick Lineup Copy */}
              {isTripleThreat && (resolvedHomeTTLineup || resolvedAwayTTLineup) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {resolvedHomeTTLineup && (
                    <button
                      type="button"
                      onClick={() => handleCopyTripleThreatLineup('home')}
                      className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-[11px] font-bold font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer truncate"
                    >
                      {copiedKey === 'home' ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
                      <span className="truncate">{copiedKey === 'home' ? 'Home Copied' : 'Copy Home Lineup'}</span>
                    </button>
                  )}
                  {resolvedAwayTTLineup && (
                    <button
                      type="button"
                      onClick={() => handleCopyTripleThreatLineup('away')}
                      className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-[11px] font-bold font-mono uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer truncate"
                    >
                      {copiedKey === 'away' ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <Copy className="w-3.5 h-3.5 shrink-0" />}
                      <span className="truncate">{copiedKey === 'away' ? 'Away Copied' : 'Copy Away Lineup'}</span>
                    </button>
                  )}
                </div>
              )}

              {/* Share Button */}
              <div className="flex justify-center w-full">
                <FixtureShareButton fixture={fixture} matchups={matchups} />
              </div>

              <button
                onClick={() => setShowTimeline(true)}
                className="w-full px-4 py-3 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ClipboardList className="w-4 h-4 text-white" /> View Complete Timeline
              </button>

              {/* Create / Manage Matchups Button */}
              {fixture.status !== 'completed' && (
                <>
                  {!isTripleThreat && (
                    <button
                      onClick={() => setShowMatchupCreator(true)}
                      className="w-full px-4 py-3 bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Swords className="w-4 h-4 text-white" /> {matchups.length === 0 ? 'Create Matchups' : 'Manage / Edit Matchups'}
                    </button>
                  )}

                  {isTripleThreat && (
                    <div className="space-y-2">
                      <button
                        type="button"
                        onClick={() => setShowTTLineupModal('home')}
                        className="w-full px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Gamepad2 className="w-4 h-4 text-white" /> {homeLineup?.triple_threat_lineup ? 'Edit Home Lineup' : 'Set Home Lineup (5 Players)'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowTTLineupModal('away')}
                        className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <Users className="w-4 h-4 text-white" /> {awayLineup?.triple_threat_lineup ? 'Edit Away Lineup' : 'Submit Away Lineup (On Behalf)'}
                      </button>
                      {homeLineup?.triple_threat_lineup && awayLineup?.triple_threat_lineup && (
                        <button
                          type="button"
                          onClick={handleGenerateTripleThreatMatchups}
                          disabled={isGeneratingTTMatchups}
                          className="w-full px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Zap className="w-4 h-4 text-white fill-white" /> {isGeneratingTTMatchups ? 'Generating...' : '⚡ Generate Mode Matchups'}
                        </button>
                      )}
                    </div>
                  )}
                  
                  {/* Round Robin Auto-Generate Button */}
                  {knockoutFormat === 'round_robin' && (
                    <button
                      onClick={handleGenerateRoundRobinMatchups}
                      disabled={isGeneratingRoundRobin}
                      className="w-full px-4 py-3 bg-gradient-to-r from-orange-50 to-red-50 hover:from-orange-600 hover:to-red-600 text-white text-xs font-bold font-mono uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      {isGeneratingRoundRobin ? (
                        <>
                          <span className="animate-spin"><Settings className="w-4 h-4 text-white" /></span> Generating...
                        </>
                      ) : (
                        <>
                          🎯 Auto-Generate Round Robin
                        </>
                      )}
                    </button>
                  )}
                </>
              )}

              <div className="pt-4 border-t border-slate-100 space-y-2.5">
                <p className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Administrative Declarations</p>
                <button
                  onClick={handleDeclareNullWithFantasy}
                  disabled={isSaving}
                  className="w-full px-4 py-3 bg-purple-50 hover:bg-purple-100 text-purple-750 text-xs font-bold font-mono uppercase tracking-wider rounded-xl border border-purple-200 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer shadow-2xs"
                >
                  <Crown className="w-4 h-4 text-purple-600" /> NULL (Keep Fantasy Points)
                </button>
                {fixture.status !== 'completed' && (
                  <>
                    <button
                      onClick={() => handleDeclareWO('home')}
                      disabled={isSaving}
                      className="w-full px-4 py-3 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-bold font-mono uppercase tracking-wider rounded-xl border border-orange-200 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      <AlertTriangle className="w-4 h-4 text-orange-600" /> WO - Home Team Absent
                    </button>
                    <button
                      onClick={() => handleDeclareWO('away')}
                      disabled={isSaving}
                      className="w-full px-4 py-3 bg-orange-50 hover:bg-orange-100 text-orange-700 text-xs font-bold font-mono uppercase tracking-wider rounded-xl border border-orange-200 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                    >
                      <AlertTriangle className="w-4 h-4 text-orange-600" /> WO - Away Team Absent
                    </button>
                  </>
                )}
                <button
                  onClick={handleDeclareNull}
                  disabled={isSaving}
                  className="w-full px-4 py-3 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold font-mono uppercase tracking-wider rounded-xl border border-rose-200 transition-all flex items-center justify-center gap-1.5 disabled:opacity-50 cursor-pointer"
                >
                  <XCircle className="w-4 h-4 text-rose-600" /> NULL (Wipe All Points)
                </button>
              </div>
            </div>
          </div>

          {/* Quick Info */}
          <div className="console-card bg-gradient-to-br from-slate-50 to-blue-50/20 border border-slate-200/60 rounded-3xl p-6 shadow-sm">
            <h3 className="font-bold text-slate-800 text-sm mb-4">Quick Info</h3>
            <div className="space-y-3 text-xs font-mono text-slate-600">
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-slate-400">Season ID</span>
                <span className="font-bold bg-white px-2.5 py-1 rounded-lg border border-slate-200/50 shadow-2xs">{fixture.season_id}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-slate-400">Fixture ID</span>
                <span className="font-bold bg-white px-2.5 py-1 rounded-lg border border-slate-200/50 shadow-2xs truncate max-w-[180px]" title={fixture.id}>{fixture.id}</span>
              </div>
              <div className="flex justify-between items-center py-1.5 border-b border-slate-100">
                <span className="text-slate-400">Matchups Count</span>
                <span className="font-bold bg-white px-2.5 py-1 rounded-lg border border-slate-200/50 shadow-2xs">{matchups.length}</span>
              </div>
              <div className="flex justify-between items-center py-1.5">
                <span className="text-slate-400">Man of Match</span>
                <span className={`font-bold px-2.5 py-1 rounded-lg border text-xs flex items-center gap-1 shadow-2xs ${
                  displayMotmName 
                    ? 'bg-amber-50 text-amber-900 border-amber-300' 
                    : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}>
                  <Star className={`w-3.5 h-3.5 ${displayMotmName ? 'text-amber-500 fill-amber-500' : 'text-slate-400'}`} />
                  {displayMotmName || 'None'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>

      {/* Timeline Modal */}
      <FixtureTimeline
        fixtureId={fixtureId}
        isOpen={showTimeline}
        onClose={() => setShowTimeline(false)}
      />

      {/* Matchup Creator Modal */}
      {showMatchupCreator && fixture && user && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto transition-all duration-300 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl shadow-2xl max-w-5xl w-full max-h-[calc(100vh-2rem)] sm:max-h-[90vh] flex flex-col my-auto overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <CommitteeMatchupCreator
                fixtureId={fixtureId}
                seasonId={fixture.season_id}
                homeTeamId={fixture.home_team_id}
                homeTeamName={fixture.home_team_name}
                awayTeamId={fixture.away_team_id}
                awayTeamName={fixture.away_team_name}
                userId={user.uid}
                userName={(user as any)?.displayName || user.email || 'Committee Admin'}
                onSuccess={() => {
                  setShowMatchupCreator(false);
                  showAlert({
                    type: 'success',
                    title: 'Matchups Created',
                    message: 'Matchups have been created successfully!'
                  });
                  fetchFixtureData(); // Reload data
                }}
                onCancel={() => setShowMatchupCreator(false)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Lineup Editor Modal */}
      {showLineupEditor && fixture && user && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto transition-all duration-300 animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl shadow-2xl max-w-4xl w-full max-h-[calc(100vh-2rem)] sm:max-h-[90vh] flex flex-col my-auto overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
            <div className="flex-1 overflow-y-auto overscroll-contain">
              <CommitteeMatchupCreator
                fixtureId={fixtureId}
                seasonId={fixture.season_id}
                homeTeamId={fixture.home_team_id}
                homeTeamName={fixture.home_team_name}
                awayTeamId={fixture.away_team_id}
                awayTeamName={fixture.away_team_name}
                userId={user.uid}
                userName={(user as any)?.displayName || user.email || 'Committee Admin'}
                onSuccess={() => {
                  setShowLineupEditor(null);
                  showAlert({
                    type: 'success',
                    title: 'Lineup Updated',
                    message: 'Lineup has been updated successfully!'
                  });
                  fetchFixtureData(); // Reload data
                }}
                onCancel={() => setShowLineupEditor(null)}
                initialTeamToEdit={showLineupEditor}
              />
            </div>
          </div>
        </div>
      )}

      {/* Triple Threat Lineup Editor Modal */}
      {showTTLineupModal && fixture && user && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/70 backdrop-blur-xs p-3 sm:p-6 overflow-y-auto transition-all animate-in fade-in">
          <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl shadow-2xl max-w-2xl w-full max-h-[calc(100vh-2rem)] sm:max-h-[90vh] flex flex-col my-auto overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200">
            <div className="px-4 py-3 sm:px-6 sm:py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div>
                <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase font-mono tracking-wider bg-amber-500 text-white">
                  ⚡ SS Triple Threat
                </span>
                <h3 className="text-sm sm:text-base font-black tracking-tight mt-1 truncate">
                  {showTTLineupModal === 'home' ? fixture.home_team_name : fixture.away_team_name} — Mode Lineup
                </h3>
                <p className="text-[11px] sm:text-xs text-slate-400 font-mono">
                  {showTTLineupModal === 'home' ? 'Home Team Lineup' : 'Away Team Lineup (Submitting on Behalf)'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowTTLineupModal(null)}
                className="p-1.5 sm:p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-all cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3.5 sm:p-6 flex-1 overflow-y-auto overscroll-contain">
              <TripleThreatLineupSubmission
                fixtureId={fixtureId}
                teamId={showTTLineupModal === 'home' ? fixture.home_team_id : fixture.away_team_id}
                seasonId={fixture.season_id}
                isHomeTeam={showTTLineupModal === 'home'}
                opponentTeamName={showTTLineupModal === 'home' ? fixture.away_team_name : fixture.home_team_name}
                existingLineup={showTTLineupModal === 'home' ? homeLineup : awayLineup}
                onSubmitSuccess={() => {
                  setShowTTLineupModal(null);
                  showAlert({
                    type: 'success',
                    title: 'Lineup Submitted',
                    message: `Triple Threat lineup for ${showTTLineupModal === 'home' ? fixture.home_team_name : fixture.away_team_name} was saved successfully!`
                  });
                  fetchFixtureData();
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Alert, Confirm, and Prompt Modals */}
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

      <PromptModal
        isOpen={promptState.isOpen}
        onConfirm={handlePromptConfirm}
        onCancel={closePrompt}
        title={promptState.title}
        message={promptState.message}
        placeholder={promptState.placeholder}
        defaultValue={promptState.defaultValue}
        confirmText={promptState.confirmText}
        cancelText={promptState.cancelText}
      />
    </div>
  
    </AuthGuard>
  );
}
