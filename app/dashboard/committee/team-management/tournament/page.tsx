'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';


import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { usePermissions } from '@/hooks/usePermissions';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import ConfirmModal from '@/components/modals/ConfirmModal';
import RoundFixturesShareButton from '@/components/RoundFixturesShareButton';
import TournamentStandings from '@/components/tournament/TournamentStandings';
import { Activity, AlertTriangle, ArrowLeft, Award, BarChart2, Bot, Calendar, Check, CheckCircle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardList, Clock, Download, Eye, FileText, HelpCircle, Info, Layers, Lightbulb, Pencil, Play, Plus, RefreshCw, Search, Settings, Share2, Shield, Shuffle, Sparkles, Star, Target, Trash2, Trophy, Users, X, XCircle, Crown, Flame, Swords } from 'lucide-react';
import { normalizeStr } from '@/lib/utils/normalizeStr';
import AuthGuard from '@/components/auth/AuthGuard';

const getCategoryColor = (name: string) => {
  const normalized = name.trim().toLowerCase();
  if (normalized.includes('red')) return 'red';
  if (normalized.includes('black')) return 'black';
  if (normalized.includes('blue')) return 'blue';
  if (normalized.includes('white')) return 'white';
  return 'slate';
};

const getColorDotStyles = (name: string) => {
  const color = getCategoryColor(name);
  const styles: { [key: string]: string } = {
    red: 'bg-rose-500 border border-rose-600 ring-rose-500/20',
    blue: 'bg-blue-500 border border-blue-600 ring-blue-500/20',
    black: 'bg-slate-800 border border-slate-900 ring-slate-800/20',
    white: 'bg-white border border-slate-350 ring-slate-200/20',
  };
  return styles[color] || 'bg-slate-400 border border-slate-500 ring-slate-400/20';
};

interface Match {
  id: string;
  home_team_name: string;
  away_team_name: string;
  round_number: number;
  leg: string;
  match_number: number;
  scheduled_date?: Date;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  result?: 'home_win' | 'away_win' | 'draw';
  home_score?: number;
  away_score?: number;
  tournament_name?: string;
  tournament_id?: string;
  updated_at?: string;
}

type TabType = 'overview' | 'teams' | 'groups' | 'fixtures' | 'standings' | 'management';

export function TournamentDashboardPageContent() {
  const { user, loading } = useAuth();
  const { userSeasonId } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [participantsCount, setParticipantsCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSeasonId, setActiveSeasonId] = useState<string | null>(null);

  // Tournament Management State
  const [tournaments, setTournaments] = useState<any[]>([]);
  const [isCreatingTournament, setIsCreatingTournament] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingTournament, setEditingTournament] = useState<any>(null);
  const [newTournament, setNewTournament] = useState({
    tournament_type: 'league',
    tournament_name: '',
    tournament_code: '',
    status: 'active',
    start_date: new Date().toISOString().split('T')[0],
    end_date: '',
    description: '',
    is_primary: false,
    display_order: 1,
    include_in_fantasy: true,
    include_in_awards: true,
    squad_size: 11,
    tournament_system: 'match_round',
    scoring_type: 'goals',
    home_deadline_time: '17:00',
    away_deadline_time: '17:00',
    result_day_offset: 2,
    result_deadline_time: '00:30',
    has_league_stage: true,
    has_group_stage: false,
    group_assignment_mode: 'auto',
    number_of_groups: 4,
    teams_per_group: 4,
    teams_advancing_per_group: 2,
    has_knockout_stage: false,
    playoff_teams: 4,
    direct_semifinal_teams: 2,
    qualification_threshold: 75,
    is_pure_knockout: false,
    enable_category_requirements: false, // Toggle for category requirements
    lineup_category_requirements: {},
    number_of_teams: 16, // Total participating teams
  });

  // Teams State
  const [selectedTournamentForTeams, setSelectedTournamentForTeams] = useState<string>('');
  const [tournamentTeams, setTournamentTeams] = useState<any[]>([]);
  const [selectedTeamsForTournament, setSelectedTeamsForTournament] = useState<string[]>([]);
  const [isSavingTeams, setIsSavingTeams] = useState(false);

  // Fixtures State
  const [selectedTournamentForFixtures, setSelectedTournamentForFixtures] = useState<string>('');
  const [tournamentFixtures, setTournamentFixtures] = useState<any[]>([]);
  const [isFixturesManagementExpanded, setIsFixturesManagementExpanded] = useState<boolean>(false);
  const [allTeams, setAllTeams] = useState<any[]>([]);
  const [isGeneratingFixtures, setIsGeneratingFixtures] = useState(false);
  const [isDeletingFixtures, setIsDeletingFixtures] = useState(false);
  const [teamSearchTerm, setTeamSearchTerm] = useState('');
  const [selectedRound, setSelectedRound] = useState<number>(1);
  const [selectedGroup, setSelectedGroup] = useState<string>('all');
  const [isTwoLegged, setIsTwoLegged] = useState(true);
  const [matchupMode, setMatchupMode] = useState<'manual' | 'blind_lineup'>('manual');
  const [knockoutFormat, setKnockoutFormat] = useState<'single_leg' | 'two_leg' | 'round_robin' | 'triple_threat'>('single_leg');
  const [scoringSystem, setScoringSystem] = useState<'goals' | 'wins' | 'triple_threat'>('goals');
  const [isGeneratingKnockout, setIsGeneratingKnockout] = useState(false);

  // Round-wise knockout generation state
  const [knockoutRoundType, setKnockoutRoundType] = useState<'tiebreaker' | 'playoff' | 'quarter_finals' | 'semi_finals' | 'finals' | 'third_place'>('quarter_finals');
  const [knockoutRoundNumber, setKnockoutRoundNumber] = useState<number>(12);
  const [knockoutNumTeams, setKnockoutNumTeams] = useState<number>(8);
  const [knockoutSelectedTeams, setKnockoutSelectedTeams] = useState<string[]>([]);
  const [knockoutPairingMethod, setKnockoutPairingMethod] = useState<'standard' | 'manual' | 'random'>('standard');
  const [availableTeamsForKnockout, setAvailableTeamsForKnockout] = useState<any[]>([]);
  const [includeTop2ForSemiFinals, setIncludeTop2ForSemiFinals] = useState<boolean>(true); // Toggle for including top 2 in semi-finals
  const [isGeneratingKnockoutRound, setIsGeneratingKnockoutRound] = useState(false);

  // Standings State
  const [selectedTournamentForStandings, setSelectedTournamentForStandings] = useState<string>('');
  const [standingsTab, setStandingsTab] = useState<'table' | 'bracket'>('table');
  const [tournamentStandings, setTournamentStandings] = useState<any[]>([]);

  // Categories State
  const [categories, setCategories] = useState<any[]>([]);

  // Groups State
  const [selectedTournamentForGroups, setSelectedTournamentForGroups] = useState<string>('');
  const [groupAssignments, setGroupAssignments] = useState<any[]>([]);
  const [unassignedTeams, setUnassignedTeams] = useState<any[]>([]);
  const [selectedTournamentDetails, setSelectedTournamentDetails] = useState<any>(null);
  const [isSavingGroups, setIsSavingGroups] = useState(false);
  const [numberOfGroups, setNumberOfGroups] = useState(4);

  // Synchronize selections with URL query parameters
  const updateUrlParams = (updates: { tab?: TabType; tournament?: string; round?: number }) => {
    const params = new URLSearchParams(window.location.search);
    if (updates.tab !== undefined) params.set('tab', updates.tab);
    if (updates.tournament !== undefined) {
      if (updates.tournament) params.set('tournament', updates.tournament);
      else params.delete('tournament');
    }
    if (updates.round !== undefined) params.set('round', updates.round.toString());
    router.replace(`/dashboard/committee/team-management/tournament?${params.toString()}`, { scroll: false });
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    updateUrlParams({ tab });
  };

  const handleTournamentChange = (val: string) => {
    setSelectedTournamentForFixtures(val);
    setSelectedTournamentForTeams(val);
    setSelectedTournamentForStandings(val);
    setSelectedTournamentForGroups(val);
    setSelectedGroup('all');
    updateUrlParams({ tournament: val });
  };

  const handleRoundChange = (val: number) => {
    setSelectedRound(val);
    updateUrlParams({ round: val });
  };

  useEffect(() => {
    const tabParam = searchParams.get('tab') as TabType;
    const tournamentParam = searchParams.get('tournament');
    const roundParam = searchParams.get('round');

    if (tabParam) {
      setActiveTab(tabParam);
    }
    if (tournamentParam) {
      setSelectedTournamentForFixtures(tournamentParam);
      setSelectedTournamentForTeams(tournamentParam);
      setSelectedTournamentForStandings(tournamentParam);
      setSelectedTournamentForGroups(tournamentParam);
    }
    if (roundParam) {
      const parsedRound = parseInt(roundParam);
      if (!isNaN(parsedRound)) {
        setSelectedRound(parsedRound);
      }
    }
  }, [searchParams]);

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

  // Auto-generate tournament name and code
  useEffect(() => {
    if (!activeSeasonId || !newTournament.tournament_type) return;

    const seasonMatch = activeSeasonId.match(/S(\d+)/);
    const seasonNumber = seasonMatch ? `S${seasonMatch[1]}` : activeSeasonId;

    const typeMap: Record<string, { code: string, name: string }> = {
      'league': { code: 'L', name: 'League' },
      'cup': { code: 'C', name: 'Cup' },
      'ucl': { code: 'CH', name: 'Champions League' },
      'uel': { code: 'EL', name: 'Europa League' },
      'super_cup': { code: 'SC', name: 'Super Cup' },
      'league_cup': { code: 'LC', name: 'League Cup' },
      'triple_threat': { code: 'TT', name: 'Triple Threat' },
    };

    const typeInfo = typeMap[newTournament.tournament_type.toLowerCase()] ||
      { code: newTournament.tournament_type.toUpperCase(), name: newTournament.tournament_type };

    const generatedCode = `SSPSL${seasonNumber}${typeInfo.code}`;
    const generatedName = `SS Super League ${seasonNumber} ${typeInfo.name}`;

    setNewTournament(prev => ({
      ...prev,
      tournament_code: generatedCode,
      tournament_name: generatedName
    }));
  }, [newTournament.tournament_type, activeSeasonId]);

  // Auto-compute is_pure_knockout: true when knockout is enabled but no league/group stage
  useEffect(() => {
    const isPureKnockout = newTournament.has_knockout_stage && !newTournament.has_league_stage && !newTournament.has_group_stage;
    if (newTournament.is_pure_knockout !== isPureKnockout) {
      setNewTournament(prev => ({
        ...prev,
        is_pure_knockout: isPureKnockout
      }));
    }
  }, [newTournament.has_knockout_stage, newTournament.has_league_stage, newTournament.has_group_stage]);

  // Auto-compute is_pure_knockout for edit form
  useEffect(() => {
    if (!editingTournament) return;
    const isPureKnockout = editingTournament.has_knockout_stage && !editingTournament.has_league_stage && !editingTournament.has_group_stage;
    if (editingTournament.is_pure_knockout !== isPureKnockout) {
      setEditingTournament((prev: any) => ({
        ...prev!,
        is_pure_knockout: isPureKnockout
      }));
    }
  }, [editingTournament?.has_knockout_stage, editingTournament?.has_league_stage, editingTournament?.has_group_stage]);

  // Auto-update number of teams when knockout round type changes
  useEffect(() => {
    const teamsByRoundType = {
      'tiebreaker': 2,
      'playoff': 4, // Typically 4 teams (3rd-6th place) competing for 2 spots
      'quarter_finals': 8,
      'semi_finals': 4,
      'finals': 2,
      'third_place': 2
    };
    const newNumTeams = teamsByRoundType[knockoutRoundType];
    if (newNumTeams !== knockoutNumTeams) {
      setKnockoutNumTeams(newNumTeams);
      setKnockoutSelectedTeams([]); // Reset selections when changing round type
    }
  }, [knockoutRoundType]);

  // Auto-calculate next round number based on existing fixtures
  useEffect(() => {
    if (selectedTournamentForFixtures && tournamentFixtures.length > 0) {
      const fixturesForTournament = tournamentFixtures.filter(f => f.tournament_id === selectedTournamentForFixtures);
      if (fixturesForTournament.length > 0) {
        const maxRound = Math.max(...fixturesForTournament.map(f => f.round_number || 0));
        const nextRound = maxRound + 1;
        // Only update if different to prevent infinite loops
        setKnockoutRoundNumber(prev => prev !== nextRound ? nextRound : prev);
      }
    }
  }, [selectedTournamentForFixtures, tournamentFixtures]);

  // Auto-preset Triple Threat format & scoring when Triple Threat tournament is selected
  useEffect(() => {
    if (!selectedTournamentForFixtures || tournaments.length === 0) return;
    const tour = tournaments.find(t => t.id === selectedTournamentForFixtures);
    if (tour && (
      tour.tournament_type === 'triple_threat' || 
      tour.matchday_format === 'triple_threat' ||
      tour.tournament_name?.toLowerCase().includes('triple threat') ||
      tour.id?.toLowerCase().includes('triple_threat')
    )) {
      setKnockoutFormat('triple_threat');
      setScoringSystem('triple_threat');
    }
  }, [selectedTournamentForFixtures, tournaments]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user || user.role !== 'committee_admin') return;

      try {
        setIsLoading(true);

        let seasonId = userSeasonId;
        let season = null;

        if (seasonId) {
          const res = await fetch(`/api/seasons/${seasonId}`);
          const json = await res.json();
          season = json.success ? json.data : null;
        } else {
          const res = await fetch('/api/seasons');
          const json = await res.json();
          const list = (json.data || json.seasons || []).filter((s: any) => s.status === 'active' || s.is_active);
          season = list.length > 0 ? list[0] : null;
          seasonId = season?.id || null;
        }

        if (season && seasonId) {
          setActiveSeasonId(seasonId);

          // Fetch teams
          const teamsRes = await fetchWithTokenRefresh(`/api/team/all?season_id=${seasonId}`);
          const teamsData = await teamsRes.json();

          if (teamsData.success && teamsData.data && teamsData.data.teams) {
            setParticipantsCount(teamsData.data.teams.length);
            setAllTeams(teamsData.data.teams);
          }

          // Load tournaments
          await loadTournaments(seasonId);

          // Fetch categories
          await fetchCategories();
        }
      } catch (error: any) {
        console.error('Error fetching tournament data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [user, userSeasonId]);

  const fetchCategories = async () => {
    try {
      const res = await fetchWithTokenRefresh('/api/categories');
      const data = await res.json();
      if (data.success) {
        setCategories(data.data || []);
      }
    } catch (error: any) {
      console.error('Error fetching categories:', error);
    }
  };

  const loadTournaments = async (seasonId: string) => {
    try {
      const res = await fetchWithTokenRefresh(`/api/tournaments?season_id=${seasonId}`);
      const data = await res.json();
      if (data.success) {
        const loadedTournaments = data.tournaments || [];
        setTournaments(loadedTournaments);

        if (loadedTournaments.length > 0) {
          const activeTour = loadedTournaments.find((t: any) => t.status === 'active') || loadedTournaments[0];
          setSelectedTournamentForFixtures(prev => prev || activeTour.id);
          setSelectedTournamentForTeams(prev => prev || activeTour.id);
          setSelectedTournamentForStandings(prev => prev || activeTour.id);
          setSelectedTournamentForGroups(prev => prev || activeTour.id);
        }

        // Load fixtures from all tournaments
        const allTournamentFixtures: any[] = [];
        for (const tournament of data.tournaments || []) {
          const fixturesRes = await fetchWithTokenRefresh(`/api/tournaments/${tournament.id}/fixtures`);
          const fixturesData = await fixturesRes.json();
          if (fixturesData.success && fixturesData.fixtures) {
            allTournamentFixtures.push(...fixturesData.fixtures.map((f: any) => ({
              ...f,
              tournament_name: tournament.tournament_name,
              tournament_id: tournament.id
            })));
          }
        }
        setTournamentFixtures(allTournamentFixtures);
      }
    } catch (error: any) {
      console.error('Error loading tournaments:', error);
    }
  };

  const handleCreateTournament = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!activeSeasonId) {
      showAlert({
        type: 'error',
        title: 'No Season',
        message: 'No season available. Please refresh the page.'
      });
      return;
    }

    setIsCreatingTournament(true);

    try {
      const res = await fetchWithTokenRefresh('/api/tournaments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          season_id: activeSeasonId,
          ...newTournament
        })
      });

      const data = await res.json();

      if (data.success) {
        showAlert({
          type: 'success',
          title: 'Tournament Created',
          message: `${newTournament.tournament_name} created successfully!`
        });

        // Reset form
        setNewTournament({
          tournament_type: 'league',
          tournament_name: '',
          tournament_code: '',
          status: 'active',
          start_date: new Date().toISOString().split('T')[0],
          end_date: '',
          description: '',
          is_primary: false,
          display_order: 1,
          include_in_fantasy: true,
          include_in_awards: true,
          squad_size: 11,
          tournament_system: 'match_round',
          scoring_type: 'goals',
          home_deadline_time: '17:00',
          away_deadline_time: '17:00',
          result_day_offset: 2,
          result_deadline_time: '00:30',
          has_league_stage: true,
          has_group_stage: false,
          group_assignment_mode: 'auto',
          number_of_groups: 4,
          teams_per_group: 4,
          teams_advancing_per_group: 2,
          has_knockout_stage: false,
          playoff_teams: 4,
          direct_semifinal_teams: 2,
          qualification_threshold: 75,
          is_pure_knockout: false,
          enable_category_requirements: false,
          lineup_category_requirements: {},
          number_of_teams: 16,
        });

        setShowCreateForm(false);
        await loadTournaments(activeSeasonId);
      } else {
        showAlert({
          type: 'error',
          title: 'Creation Failed',
          message: data.error || 'Failed to create tournament'
        });
      }
    } catch (error: any) {
      console.error('Error creating tournament:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to create tournament: ' + error.message
      });
    } finally {
      setIsCreatingTournament(false);
    }
  };

  const handleDeleteTournament = async (tournamentId: string, tournamentName: string) => {
    const confirmed = await showConfirm({
      type: 'danger',
      title: 'Delete Tournament',
      message: `Are you sure you want to delete "${tournamentName}"? This will also delete all associated fixtures, stats, and settings. This action cannot be undone.`,
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    try {
      const res = await fetchWithTokenRefresh(`/api/tournaments/${tournamentId}`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.success) {
        showAlert({
          type: 'success',
          title: 'Tournament Deleted',
          message: `${tournamentName} deleted successfully!`
        });

        await loadTournaments(activeSeasonId!);
      } else {
        showAlert({
          type: 'error',
          title: 'Delete Failed',
          message: data.error || 'Failed to delete tournament'
        });
      }
    } catch (error: any) {
      console.error('Error deleting tournament:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to delete tournament: ' + error.message
      });
    }
  };

  const loadTournamentFixtures = async (tournamentId: string) => {
    try {
      const res = await fetchWithTokenRefresh(`/api/tournaments/${tournamentId}/fixtures`);
      const data = await res.json();
      if (data.success) {
        const loadedFixtures = data.fixtures || [];
        setTournamentFixtures(loadedFixtures);
        if (loadedFixtures.length === 0) {
          setIsFixturesManagementExpanded(true);
        }
      }
    } catch (error: any) {
      console.error('Error loading tournament fixtures:', error);
    }
  };

  const handleGenerateTournamentFixtures = async () => {
    if (!selectedTournamentForFixtures) {
      showAlert({
        type: 'warning',
        title: 'No Tournament Selected',
        message: 'Please select a tournament first'
      });
      return;
    }

    if (selectedTeamsForTournament.length < 2) {
      showAlert({
        type: 'warning',
        title: 'Insufficient Teams',
        message: 'Please select at least 2 teams'
      });
      return;
    }

    const confirmed = await showConfirm({
      type: 'info',
      title: 'Generate Fixtures',
      message: `Generate fixtures for ${selectedTeamsForTournament.length} teams? This will create a complete round-robin schedule.`,
      confirmText: 'Generate',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    setIsGeneratingFixtures(true);
    try {
      const res = await fetchWithTokenRefresh(`/api/tournaments/${selectedTournamentForFixtures}/fixtures`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_ids: selectedTeamsForTournament,
          is_two_legged: isTwoLegged,
          matchup_mode: matchupMode
        })
      });

      const data = await res.json();

      if (data.success) {
        showAlert({
          type: 'success',
          title: 'Fixtures Generated',
          message: `${data.fixtures_count} fixtures created successfully!`
        });
        await loadTournamentFixtures(selectedTournamentForFixtures);
      } else {
        showAlert({
          type: 'error',
          title: 'Generation Failed',
          message: data.error || 'Failed to generate fixtures'
        });
      }
    } catch (error: any) {
      console.error('Error generating fixtures:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to generate fixtures: ' + error.message
      });
    } finally {
      setIsGeneratingFixtures(false);
    }
  };

  const handleGenerateKnockoutFixtures = async () => {
    if (!selectedTournamentForFixtures) {
      showAlert({
        type: 'warning',
        title: 'No Tournament Selected',
        message: 'Please select a tournament first'
      });
      return;
    }

    const confirmed = await showConfirm({
      type: 'info',
      title: 'Generate Knockout Fixtures',
      message: 'This will create knockout fixtures based on group standings. Ensure all group stage matches are complete.',
      confirmText: 'Generate',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    setIsGeneratingKnockout(true);
    try {
      const res = await fetchWithTokenRefresh(`/api/tournaments/${selectedTournamentForFixtures}/generate-knockout`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pairing_method: 'standard',
          start_date: new Date().toISOString().split('T')[0],
          matchup_mode: matchupMode, // Use selected matchup mode
          is_two_legged: isTwoLegged, // Use selected leg configuration
          knockout_format: knockoutFormat, // Use selected knockout format
          scoring_system: scoringSystem // Use selected scoring system
        })
      });

      const data = await res.json();

      if (data.success) {
        showAlert({
          type: 'success',
          title: 'Knockout Fixtures Generated',
          message: `${data.fixtures_created} ${(data as any).knockout_structure?.first_round || 'knockout'} fixtures created successfully!`
        });
        await loadTournamentFixtures(selectedTournamentForFixtures);
      } else {
        showAlert({
          type: 'error',
          title: 'Generation Failed',
          message: data.error || 'Failed to generate knockout fixtures'
        });
      }
    } catch (error: any) {
      console.error('Error generating knockout fixtures:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to generate knockout fixtures: ' + error.message
      });
    } finally {
      setIsGeneratingKnockout(false);
    }
  };

  // NEW: Round-wise knockout generation
  const handleGenerateKnockoutRound = async () => {
    if (!selectedTournamentForFixtures) {
      showAlert({
        type: 'warning',
        title: 'No Tournament Selected',
        message: 'Please select a tournament first'
      });
      return;
    }

    if (knockoutSelectedTeams.length !== knockoutNumTeams) {
      showAlert({
        type: 'warning',
        title: 'Incorrect Number of Teams',
        message: `Please select exactly ${knockoutNumTeams} teams. Currently selected: ${knockoutSelectedTeams.length}`
      });
      return;
    }

    const roundNames: Record<string, string> = {
      tiebreaker: '3v3 Tiebreaker Match',
      playoff: 'Playoff',
      quarter_finals: 'Quarter Finals',
      semi_finals: 'Semi Finals',
      finals: 'Finals',
      third_place: 'Third Place Playoff'
    };

    const formatLabel = knockoutFormat === 'triple_threat'
      ? '⚡ SS Triple Threat (3 matchups: Co-op, Duo, Single)'
      : `${knockoutFormat} format`;
    const scoringLabel = scoringSystem === 'triple_threat'
      ? '⚡ Triple Threat Points (+Clean Sweep Bonus)'
      : `${scoringSystem} scoring`;

    const confirmed = await showConfirm({
      type: 'info',
      title: `Generate ${roundNames[knockoutRoundType]}`,
      message: `This will create ${roundNames[knockoutRoundType]} fixtures for Round ${knockoutRoundNumber} with ${knockoutNumTeams} teams using ${formatLabel} and ${scoringLabel}.`,
      confirmText: 'Generate',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    setIsGeneratingKnockoutRound(true);
    try {
      // Prepare teams array with seed information
      const teamsData = knockoutSelectedTeams.map((teamId, index) => {
        const team = availableTeamsForKnockout.find(t => t.team_id === teamId);
        return {
          team_id: teamId,
          team_name: team?.team_name || 'Unknown Team',
          seed: index + 1
        };
      });

      const res = await fetchWithTokenRefresh(`/api/tournaments/${selectedTournamentForFixtures}/generate-knockout-round`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          knockout_round: knockoutRoundType,
          round_number: knockoutRoundNumber,
          num_teams: knockoutNumTeams,
          knockout_format: knockoutFormat,
          scoring_system: scoringSystem,
          matchup_mode: matchupMode,
          teams: teamsData,
          pairing_method: knockoutPairingMethod,
          start_date: new Date().toISOString().split('T')[0],
          created_by: user?.uid,
          created_by_name: (user as any)?.displayName || user?.email
        })
      });

      const data = await res.json();

      if (data.success) {
        showAlert({
          type: 'success',
          title: 'Round Generated',
          message: `${data.fixtures_created} fixtures created for ${roundNames[knockoutRoundType]}!`
        });
        await loadTournamentFixtures(selectedTournamentForFixtures);
        // Reset selections
        setKnockoutSelectedTeams([]);
      } else {
        showAlert({
          type: 'error',
          title: 'Generation Failed',
          message: data.error || 'Failed to generate knockout round'
        });
      }
    } catch (error: any) {
      console.error('Error generating knockout round:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to generate knockout round: ' + error.message
      });
    } finally {
      setIsGeneratingKnockoutRound(false);
    }
  };

  // Load available teams for knockout selection
  const loadAvailableTeamsForKnockout = async (tournamentId: string) => {
    try {
      // Determine which round to load teams from based on the round type being generated
      const fixturesForTournament = tournamentFixtures.filter(f => f.tournament_id === tournamentId);
      const knockoutFixtures = fixturesForTournament.filter(f => f.knockout_round);
      
      console.log('[DEBUG] Loading teams for knockout round:', knockoutRoundType);
      console.log('[INFO] Available knockout fixtures:', knockoutFixtures.map(f => ({
        round: f.knockout_round,
        status: f.status,
        round_number: f.round_number
      })));
      
      let allTeams: any[] = [];
      let sourceMessage = '';
      
      // Determine the expected previous round based on current round type
      let expectedPreviousRound: string | null = null;
      
      if (knockoutRoundType === 'semi_finals') {
        // For Semi Finals, check if there was a Playoff round first
        // Check for various playoff naming conventions
        const playoffFixtures = knockoutFixtures.filter(f => {
          const roundName = (f.knockout_round || '').toLowerCase();
          return roundName === 'playoff' || 
                 roundName === 'play-off' || 
                 roundName === 'playoffs' ||
                 roundName.includes('playoff');
        });
        
        console.log('[INFO] Found playoff fixtures:', playoffFixtures.length);
        console.log('<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Completed playoff fixtures:', playoffFixtures.filter(f => f.status === 'completed').length);
        
        if (playoffFixtures.length > 0 && playoffFixtures.some(f => f.status === 'completed')) {
          // Semi Finals needs BOTH playoff winners AND top 2 from standings
          // So we'll load playoff winners first, then add top 2 from standings
          expectedPreviousRound = playoffFixtures[0].knockout_round; // Use actual round name
          console.log('[INFO] Will load playoff winners + top 2 from standings');
        } else {
          console.log('<AlertTriangle className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> No completed playoff found, will load top 4 from standings');
        }
        // If no playoff, will fall back to standings
      } else if (knockoutRoundType === 'finals') {
        // For Finals, load from Semi Finals
        expectedPreviousRound = 'Semi Finals';
      } else if (knockoutRoundType === 'third_place') {
        // For Third Place Playoff, load LOSERS from Semi Finals
        expectedPreviousRound = 'Semi Finals';
      } else if (knockoutRoundType === 'quarter_finals') {
        // For Quarter Finals, check for Round of 16
        const r16Fixtures = knockoutFixtures.filter(f => {
          const roundName = (f.knockout_round || '').toLowerCase();
          return roundName === 'round of 16' || 
                 roundName === 'round_of_16' ||
                 roundName.includes('round of 16');
        });
        
        if (r16Fixtures.length > 0 && r16Fixtures.some(f => f.status === 'completed')) {
          expectedPreviousRound = r16Fixtures[0].knockout_round;
        }
      }
      
      // Try to load from expected previous round
      if (expectedPreviousRound) {
        console.log('[DEBUG] Looking for fixtures from round:', expectedPreviousRound);
        
        const previousRoundFixtures = knockoutFixtures.filter(f => 
          f.knockout_round === expectedPreviousRound && f.status === 'completed'
        );
        
        console.log('<BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Found previous round fixtures:', previousRoundFixtures.length);
        
        if (previousRoundFixtures.length > 0) {
          console.log('<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Processing winners/losers from:', expectedPreviousRound);
          
          const isTwoLegged = previousRoundFixtures.some(f => f.knockout_format === 'two_leg');
          
          // For Third Place Playoff, we need LOSERS, not winners
          const needLosers = knockoutRoundType === 'third_place';
          const participants = new Map<string, any>();
          
          if (isTwoLegged) {
            // For two-legged ties, group by match_number and determine aggregate winner/loser
            const matchGroups = new Map<number, any[]>();
            
            previousRoundFixtures.forEach(fixture => {
              const matchNum = fixture.match_number || 0;
              if (!matchGroups.has(matchNum)) {
                matchGroups.set(matchNum, []);
              }
              matchGroups.get(matchNum)!.push(fixture);
            });
            
            console.log('[INFO] Processing', matchGroups.size, 'two-legged matches');
            
            // Process each match pair
            matchGroups.forEach((fixtures, matchNum) => {
              if (fixtures.length !== 2) {
                console.warn(`Match ${matchNum} doesn't have exactly 2 legs, skipping`);
                return;
              }
              
              const firstLeg = fixtures.find(f => f.leg === 'first');
              const secondLeg = fixtures.find(f => f.leg === 'second');
              
              if (!firstLeg || !secondLeg) {
                console.warn(`Match ${matchNum} missing first or second leg, skipping`);
                return;
              }
              
              // Calculate aggregate scores
              const team1Id = firstLeg.home_team_id;
              const team1Name = firstLeg.home_team_name;
              const team2Id = firstLeg.away_team_id;
              const team2Name = firstLeg.away_team_name;
              
              const team1Goals = (firstLeg.home_score || 0) + (secondLeg.away_score || 0);
              const team2Goals = (firstLeg.away_score || 0) + (secondLeg.home_score || 0);
              
              let winnerId: string | null = null;
              let winnerName: string | null = null;
              let loserId: string | null = null;
              let loserName: string | null = null;
              
              if (team1Goals > team2Goals) {
                winnerId = team1Id;
                winnerName = team1Name;
                loserId = team2Id;
                loserName = team2Name;
              } else if (team2Goals > team1Goals) {
                winnerId = team2Id;
                winnerName = team2Name;
                loserId = team1Id;
                loserName = team1Name;
              } else {
                // Aggregate tie - check result field from second leg as tiebreaker
                if (secondLeg.result === 'home_win') {
                  winnerId = secondLeg.home_team_id;
                  winnerName = secondLeg.home_team_name;
                  loserId = secondLeg.away_team_id;
                  loserName = secondLeg.away_team_name;
                } else if (secondLeg.result === 'away_win') {
                  winnerId = secondLeg.away_team_id;
                  winnerName = secondLeg.away_team_name;
                  loserId = secondLeg.home_team_id;
                  loserName = secondLeg.home_team_name;
                }
              }
              
              const targetId = needLosers ? loserId : winnerId;
              const targetName = needLosers ? loserName : winnerName;
              
              if (targetId && targetName && !participants.has(targetId)) {
                participants.set(targetId, {
                  team_id: targetId,
                  team_name: targetName,
                  position: participants.size + 1,
                  source: `${needLosers ? 'Loser' : 'Winner'} from ${expectedPreviousRound} (Aggregate: ${team1Goals}-${team2Goals})`
                });
              }
            });
          } else {
            // Single-leg knockout - use result directly
            previousRoundFixtures.forEach(fixture => {
              let winnerId: string | null = null;
              let winnerName: string | null = null;
              let loserId: string | null = null;
              let loserName: string | null = null;
              
              // Determine winner and loser based on result
              if (fixture.result === 'home_win') {
                winnerId = fixture.home_team_id;
                winnerName = fixture.home_team_name;
                loserId = fixture.away_team_id;
                loserName = fixture.away_team_name;
              } else if (fixture.result === 'away_win') {
                winnerId = fixture.away_team_id;
                winnerName = fixture.away_team_name;
                loserId = fixture.home_team_id;
                loserName = fixture.home_team_name;
              }
              
              const targetId = needLosers ? loserId : winnerId;
              const targetName = needLosers ? loserName : winnerName;
              
              // Add participant if not already added
              if (targetId && targetName && !participants.has(targetId)) {
                participants.set(targetId, {
                  team_id: targetId,
                  team_name: targetName,
                  position: participants.size + 1,
                  source: `${needLosers ? 'Loser' : 'Winner'} from ${expectedPreviousRound}`
                });
              }
            });
          }
          
          allTeams = Array.from(participants.values());
          const formatType = isTwoLegged ? 'two-legged' : 'single-leg';
          const participantType = needLosers ? 'losers' : 'winners';
          sourceMessage = `Loaded ${allTeams.length} ${participantType} from ${expectedPreviousRound} (${formatType})`;
          
          // Special case: For Semi Finals after Playoff, optionally add top 2 from standings
          if (knockoutRoundType === 'semi_finals' && !needLosers && allTeams.length > 0 && includeTop2ForSemiFinals) {
            console.log('<RefreshCw className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Semi Finals detected - also loading top 2 from standings (toggle enabled)');
            
            try {
              const res = await fetchWithTokenRefresh(`/api/tournaments/${tournamentId}/standings`);
              const data = await res.json();
              
              if (data.success) {
                let standingsTeams: any[] = [];
                
                if (data.format === 'league' && data.standings) {
                  standingsTeams = data.standings;
                } else if (data.standings) {
                  standingsTeams = data.standings;
                }
                
                // Sort by position
                standingsTeams = standingsTeams.sort((a: any, b: any) => {
                  if (a.position && b.position && a.position !== b.position) {
                    return a.position - b.position;
                  }
                  return (b.points || 0) - (a.points || 0);
                });
                
                // Get top 2 teams that are NOT already in playoff winners
                const playoffWinnerIds = new Set(allTeams.map(t => t.team_id));
                const top2FromStandings = standingsTeams
                  .filter(t => !playoffWinnerIds.has(t.team_id))
                  .slice(0, 2)
                  .map(t => ({
                    ...t,
                    source: `Top ${t.position} from standings`
                  }));
                
                console.log('➕ Adding top 2 from standings:', top2FromStandings.map(t => t.team_name));
                
                // Add top 2 to the teams array
                allTeams = [...allTeams, ...top2FromStandings];
                sourceMessage = `Loaded ${participants.size} playoff winners + top 2 from standings (total ${allTeams.length} teams)`;
              }
            } catch (standingsError) {
              console.error('Failed to load top 2 from standings:', standingsError);
              // Continue with just playoff winners
            }
          } else if (knockoutRoundType === 'semi_finals' && !needLosers && allTeams.length > 0 && !includeTop2ForSemiFinals) {
            console.log('<AlertTriangle className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Semi Finals - top 2 from standings NOT included (toggle disabled)');
            sourceMessage = `Loaded ${allTeams.length} playoff winners only`;
          }
        }
      }
      
      // If no teams found from previous round, fall back to standings
      if (allTeams.length === 0) {
        const res = await fetchWithTokenRefresh(`/api/tournaments/${tournamentId}/standings`);
        const data = await res.json();
        
        console.log('Standings API response:', data);
        
        if (data.success) {
          let isGroupStage = false;
          
          // Handle different response formats
          if (data.format === 'group_stage' && data.groupStandings) {
            // Group stage format - keep group structure for smart selection
            isGroupStage = true;
            const groups = data.groupStandings;
            const groupNames = Object.keys(groups).sort();
            
            // For group stage, select top N teams from each group
            // Example: For 8 teams (QF), if 4 groups, take top 2 from each
            const teamsPerGroup = Math.ceil(knockoutNumTeams / groupNames.length);
            
            groupNames.forEach(groupName => {
              const groupTeams = groups[groupName]
                .sort((a: any, b: any) => {
                  if (a.position !== b.position) return a.position - b.position;
                  return (b.points || 0) - (a.points || 0);
                })
                .slice(0, teamsPerGroup); // Take top N from each group
              
              allTeams = allTeams.concat(groupTeams);
            });
            
            // Sort by group position for display (1st place teams first, then 2nd place, etc.)
            allTeams.sort((a: any, b: any) => {
              if (a.position !== b.position) return a.position - b.position;
              return a.group.localeCompare(b.group);
            });
            
            sourceMessage = `Loaded ${allTeams.length} teams from groups. Top teams from each group auto-selected.`;
            
          } else if (data.format === 'league' && data.standings) {
            // League format - take top N teams overall
            allTeams = data.standings;
          } else if (data.standings) {
            // Fallback - direct standings array
            allTeams = data.standings;
          }
          
          // For non-group stage, sort by position/points
          if (!isGroupStage && allTeams.length > 0) {
            allTeams = allTeams.sort((a: any, b: any) => {
              if (a.position && b.position && a.position !== b.position) {
                return a.position - b.position;
              }
              return (b.points || 0) - (a.points || 0);
            });
            
            // Assign positions if not already set
            allTeams.forEach((team, index) => {
              if (!team.position) {
                team.position = index + 1;
              }
            });
            
            if (!sourceMessage) {
              const numToSelect = Math.min(knockoutNumTeams, allTeams.length);
              sourceMessage = `Loaded ${allTeams.length} teams. Top ${numToSelect} teams auto-selected based on standings.`;
            }
          }
        } else {
          showAlert({
            type: 'error',
            title: 'Load Failed',
            message: data.error || 'Failed to load teams'
          });
          return;
        }
      }
      
      if (allTeams.length === 0) {
        showAlert({
          type: 'warning',
          title: 'No Teams Found',
          message: 'No teams with standings found. Make sure fixtures have been completed.'
        });
        return;
      }
      
      setAvailableTeamsForKnockout(allTeams);
      
      // Smart auto-selection based on round type and source
      let teamsToSelect: string[] = [];
      
      if (knockoutFixtures.length > 0 && allTeams.length > 0 && allTeams[0].source?.includes('Winner')) {
        // If loading from previous knockout round, select all winners
        teamsToSelect = allTeams.map((t: any) => t.team_id);
        sourceMessage += ` All ${allTeams.length} winners auto-selected.`;
      } else {
        // Loading from league/group standings - smart selection based on round type
        if (knockoutRoundType === 'playoff') {
          // Playoff: Select teams 3-6 (positions 3, 4, 5, 6)
          const playoffTeams = allTeams.filter((t: any) => t.position >= 3 && t.position <= 6);
          teamsToSelect = playoffTeams.slice(0, 4).map((t: any) => t.team_id);
          sourceMessage = `Loaded ${allTeams.length} teams. Teams ranked 3-6 auto-selected for playoff.`;
        } else if (knockoutRoundType === 'semi_finals') {
          // Check if there's a completed playoff round
          const hasPlayoffRound = knockoutFixtures.some(f => f.knockout_round === 'playoff' && f.status === 'completed');
          
          if (hasPlayoffRound) {
            // Semi-finals after playoff: Should load top 2 + playoff winners
            // This case should be handled by the knockout winners logic above
            teamsToSelect = allTeams.slice(0, Math.min(4, allTeams.length)).map((t: any) => t.team_id);
            sourceMessage = `Loaded teams for semi-finals. Please verify selection includes top 2 + playoff winners.`;
          } else {
            // Semi-finals without playoff: Select top 4
            teamsToSelect = allTeams.slice(0, Math.min(4, allTeams.length)).map((t: any) => t.team_id);
            sourceMessage = `Loaded ${allTeams.length} teams. Top 4 teams auto-selected for semi-finals.`;
          }
        } else if (knockoutRoundType === 'quarter_finals') {
          // Quarter Finals: Select top 8
          teamsToSelect = allTeams.slice(0, Math.min(8, allTeams.length)).map((t: any) => t.team_id);
          sourceMessage = `Loaded ${allTeams.length} teams. Top 8 teams auto-selected for quarter-finals.`;
        } else if (knockoutRoundType === 'finals') {
          // Finals: Select top 2 (or semi-final winners if available)
          teamsToSelect = allTeams.slice(0, Math.min(2, allTeams.length)).map((t: any) => t.team_id);
          sourceMessage = `Loaded ${allTeams.length} teams. Top 2 teams auto-selected for finals.`;
        } else if (knockoutRoundType === 'third_place') {
          // Third Place: Select teams 3-4 (or semi-final losers if available)
          const thirdPlaceTeams = allTeams.filter((t: any) => t.position >= 3 && t.position <= 4);
          teamsToSelect = thirdPlaceTeams.slice(0, 2).map((t: any) => t.team_id);
          sourceMessage = `Loaded ${allTeams.length} teams. Teams ranked 3-4 auto-selected for third place playoff.`;
        } else {
          // Default: Select top N teams
          const numToSelect = Math.min(knockoutNumTeams, allTeams.length);
          teamsToSelect = allTeams.slice(0, numToSelect).map((t: any) => t.team_id);
          sourceMessage = `Loaded ${allTeams.length} teams. Top ${numToSelect} teams auto-selected.`;
        }
      }
      
      setKnockoutSelectedTeams(teamsToSelect);
      
      showAlert({
        type: 'success',
        title: 'Teams Loaded',
        message: sourceMessage || `Loaded ${allTeams.length} teams.`
      });
    } catch (error: any) {
      console.error('Error loading teams:', error);
      showAlert({
        type: 'error',
        title: 'Load Failed',
        message: 'Failed to load teams. Please try again.'
      });
    }
  };

  // Toggle team selection
  const toggleKnockoutTeam = (teamId: string) => {
    setKnockoutSelectedTeams(prev => {
      if (prev.includes(teamId)) {
        return prev.filter(id => id !== teamId);
      } else {
        if (prev.length >= knockoutNumTeams) {
          showAlert({
            type: 'warning',
            title: 'Maximum Teams Selected',
            message: `You can only select ${knockoutNumTeams} teams for this round.`
          });
          return prev;
        }
        return [...prev, teamId];
      }
    });
  };

  const handleDeleteTournamentFixtures = async () => {
    if (!selectedTournamentForFixtures) return;

    const confirmed = await showConfirm({
      type: 'danger',
      title: 'Delete Fixtures',
      message: 'Delete all fixtures for this tournament? This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    setIsDeletingFixtures(true);
    try {
      const res = await fetchWithTokenRefresh(`/api/tournaments/${selectedTournamentForFixtures}/fixtures`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.success) {
        showAlert({
          type: 'success',
          title: 'Deleted',
          message: 'All fixtures deleted successfully'
        });
        setTournamentFixtures([]);
      } else {
        showAlert({
          type: 'error',
          title: 'Delete Failed',
          message: data.error || 'Failed to delete fixtures'
        });
      }
    } catch (error: any) {
      console.error('Error deleting fixtures:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to delete fixtures'
      });
    } finally {
      setIsDeletingFixtures(false);
    }
  };

  const loadTournamentTeams = async (tournamentId: string) => {
    try {
      const res = await fetchWithTokenRefresh(`/api/tournaments/${tournamentId}/teams`);
      const data = await res.json();
      if (data.success) {
        setTournamentTeams(data.teams || []);
        // Pre-select teams that are already assigned
        const assignedTeamIds = data.teams
          .filter((t: any) => t.is_participating)
          .map((t: any) => t.team_id);
        setSelectedTeamsForTournament(assignedTeamIds);
      }
    } catch (error: any) {
      console.error('Error loading tournament teams:', error);
    }
  };

  const handleSaveTournamentTeams = async () => {
    if (!selectedTournamentForTeams) return;

    setIsSavingTeams(true);
    try {
      const res = await fetchWithTokenRefresh(`/api/tournaments/${selectedTournamentForTeams}/teams`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_ids: selectedTeamsForTournament
        })
      });

      const data = await res.json();

      if (data.success) {
        showAlert({
          type: 'success',
          title: 'Teams Saved',
          message: `${data.assigned_count} team(s) assigned to tournament`
        });
        await loadTournamentTeams(selectedTournamentForTeams);
      } else {
        showAlert({
          type: 'error',
          title: 'Save Failed',
          message: data.error || 'Failed to save teams'
        });
      }
    } catch (error: any) {
      console.error('Error saving teams:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to save teams: ' + error.message
      });
    } finally {
      setIsSavingTeams(false);
    }
  };

  const loadTournamentStandings = async (tournamentId: string) => {
    try {
      const res = await fetchWithTokenRefresh(`/api/tournaments/${tournamentId}/standings`);
      const data = await res.json();
      if (data.success) {
        setTournamentStandings(data.standings || []);
      }
    } catch (error: any) {
      console.error('Error loading tournament standings:', error);
    }
  };

  const loadTournamentGroups = async (tournamentId: string) => {
    try {
      const res = await fetchWithTokenRefresh(`/api/tournaments/${tournamentId}/groups`);
      const data = await res.json();
      if (data.success) {
        setGroupAssignments(data.assignments || []);
        setUnassignedTeams(data.unassignedTeams || []);
        setSelectedTournamentDetails(data.tournament);
        if (data.tournament?.number_of_groups) {
          setNumberOfGroups(data.tournament.number_of_groups);
        }
      }
    } catch (error: any) {
      console.error('Error loading tournament groups:', error);
    }
  };

  const handleSaveGroups = async () => {
    if (!selectedTournamentForGroups) return;

    setIsSavingGroups(true);
    try {
      const res = await fetchWithTokenRefresh(`/api/tournaments/${selectedTournamentForGroups}/groups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignments: groupAssignments })
      });

      const data = await res.json();

      if (data.success) {
        showAlert({
          type: 'success',
          title: 'Groups Saved',
          message: `${groupAssignments.length} team(s) assigned to groups`
        });
        await loadTournamentGroups(selectedTournamentForGroups);
      } else {
        showAlert({
          type: 'error',
          title: 'Save Failed',
          message: data.error || 'Failed to save groups'
        });
      }
    } catch (error: any) {
      console.error('Error saving groups:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to save groups: ' + error.message
      });
    } finally {
      setIsSavingGroups(false);
    }
  };

  const handleAutoDistributeGroups = () => {
    const allTeamsInTournament = [...groupAssignments.map(a => ({ team_id: a.team_id, team_name: a.team_name })), ...unassignedTeams];
    const teamsPerGroup = Math.ceil(allTeamsInTournament.length / numberOfGroups);

    const newAssignments: any[] = [];
    const groupNames = Array.from({ length: numberOfGroups }, (_, i) => String.fromCharCode(65 + i));
    const shuffled = [...allTeamsInTournament].sort(() => Math.random() - 0.5);

    shuffled.forEach((team, index) => {
      const groupIndex = Math.floor(index / teamsPerGroup);
      const groupName = `Group ${groupNames[groupIndex]}`;
      newAssignments.push({ team_id: team.team_id, team_name: team.team_name, group_name: groupName });
    });

    setGroupAssignments(newAssignments);
    setUnassignedTeams([]);

    showAlert({
      type: 'success',
      title: 'Teams Distributed',
      message: `Teams distributed across ${numberOfGroups} groups`
    });
  };

  const handleClearGroups = async () => {
    if (!selectedTournamentForGroups) return;

    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Clear All Groups',
      message: 'Remove all team assignments from groups? Teams will remain in the tournament.',
      confirmText: 'Clear',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    try {
      const res = await fetchWithTokenRefresh(`/api/tournaments/${selectedTournamentForGroups}/groups`, {
        method: 'DELETE'
      });

      const data = await res.json();

      if (data.success) {
        showAlert({
          type: 'success',
          title: 'Groups Cleared',
          message: 'All group assignments removed'
        });
        await loadTournamentGroups(selectedTournamentForGroups);
      }
    } catch (error: any) {
      console.error('Error clearing groups:', error);
    }
  };

  useEffect(() => {
    if (selectedTournamentForTeams) {
      loadTournamentTeams(selectedTournamentForTeams);
    } else {
      setTournamentTeams([]);
      setSelectedTeamsForTournament([]);
    }
  }, [selectedTournamentForTeams]);

  useEffect(() => {
    if (selectedTournamentForFixtures) {
      loadTournamentFixtures(selectedTournamentForFixtures);
    } else {
      setTournamentFixtures([]);
    }
  }, [selectedTournamentForFixtures]);

  useEffect(() => {
    if (selectedTournamentForStandings) {
      loadTournamentStandings(selectedTournamentForStandings);
    } else {
      setTournamentStandings([]);
    }
  }, [selectedTournamentForStandings]);

  useEffect(() => {
    if (selectedTournamentForGroups) {
      loadTournamentGroups(selectedTournamentForGroups);
    } else {
      setGroupAssignments([]);
      setUnassignedTeams([]);
      setSelectedTournamentDetails(null);
    }
  }, [selectedTournamentForGroups]);

  if (loading || isLoading) {
    return (
      <div className="min-h-screen min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-500 uppercase tracking-wider font-extrabold font-mono">Loading tournament dashboard...</p>
        </div>
      </div>
    );
  }

  // Calculate stats
  const totalMatches = tournamentFixtures.length;
  const completedMatches = tournamentFixtures.filter(f => f.status === 'completed').length;
  const pendingMatches = totalMatches - completedMatches;

  const allMatches = tournamentFixtures;
  const upcomingMatches = allMatches.filter(m => m.status !== 'completed').slice(0, 5);
  const recentMatches = allMatches
    .filter(m => m.status === 'completed')
    .sort((a, b) => {
      if (a.updated_at && b.updated_at) {
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      }
      return 0;
    })
    .slice(0, 5);

  // Filter teams for search
  const filteredTeams = allTeams.filter((teamData: any) =>
    normalizeStr(teamData.team.name).includes(normalizeStr(teamSearchTerm)) ||
    normalizeStr(teamData.team.id).includes(normalizeStr(teamSearchTerm))
  );

  // Get selected tournament details
  const selectedTournament = tournaments.find(t => t.id === selectedTournamentForFixtures);
  const isTripleThreatTournament = Boolean(
    selectedTournament && (
      selectedTournament.tournament_type === 'triple_threat' || 
      selectedTournament.matchday_format === 'triple_threat' ||
      selectedTournament.tournament_name?.toLowerCase().includes('triple threat') ||
      selectedTournament.id?.toLowerCase().includes('triple_threat')
    )
  );

  // Calculate max rounds from fixtures
  const fixturesForSelectedTournament = tournamentFixtures.filter(f => f.tournament_id === selectedTournamentForFixtures);
  const maxRounds = fixturesForSelectedTournament.length > 0
    ? Math.max(...fixturesForSelectedTournament.map(f => f.round_number || 0))
    : 14;

  // Extract available groups for the selected tournament
  const availableGroups = Array.from(
    new Set(
      fixturesForSelectedTournament
        .map(f => f.group_name || f.id?.match(/_grp([A-Za-z0-9]+)_/)?.[1])
        .filter(Boolean)
    )
  ).sort() as string[];

  // Filter fixtures by selected round and group
  const filteredFixtures = fixturesForSelectedTournament.filter(f => {
    const roundMatch = selectedRound === 0 || f.round_number === selectedRound;
    const fixtureGroup = f.group_name || f.id?.match(/_grp([A-Za-z0-9]+)_/)?.[1] || null;
    const groupMatch = selectedGroup === 'all' || !selectedGroup || (
      fixtureGroup && (
        fixtureGroup.toLowerCase() === selectedGroup.toLowerCase() ||
        `group ${fixtureGroup.toLowerCase()}` === selectedGroup.toLowerCase() ||
        fixtureGroup.toLowerCase() === `group ${selectedGroup.toLowerCase()}`
      )
    );
    return roundMatch && groupMatch;
  });

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="console-bg min-h-screen text-slate-800 relative pt-4 sm:pt-6 lg:pt-24 pb-8 sm:pb-12 px-3 sm:px-6 font-mono">
      {/* Decorative glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-4 sm:space-y-6">
        {/* Navigation & Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Link
              href="/dashboard/committee/team-management"
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-[11px] sm:text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Team Management
            </Link>
            <Link
              href="/dashboard/committee/team-management/tournament/lineup-status"
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-mono font-bold text-[11px] sm:text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
            >
              <CheckCircle className="w-3.5 h-3.5 text-slate-605" /> Lineup Status
            </Link>
            <Link
              href="/dashboard/committee/team-management/match-days"
              className="inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-705 font-mono font-bold text-[11px] sm:text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
            >
              <Calendar className="w-3.5 h-3.5 text-slate-600" /> Match Days
            </Link>
          </div>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-3.5 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 bg-slate-800 border border-slate-900 rounded-xl sm:rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <Trophy className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">SYSTEM CONTROL</span>
              <h1 className="text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Tournament Management
              </h1>
              <p className="text-xs text-slate-500 font-mono mt-1">
                Create tournaments, manage fixtures, and track standings
              </p>
            </div>
          </div>
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] sm:text-[10px] text-slate-500 font-bold uppercase tracking-wider truncate">Total Matches</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-900 mt-0.5 sm:mt-1">{totalMatches}</p>
              </div>
              <div className="p-1.5 sm:p-2 bg-slate-100 rounded-lg sm:rounded-xl text-slate-600 shrink-0">
                <Activity className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] sm:text-[10px] text-emerald-600 font-bold uppercase tracking-wider truncate">Completed</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-black text-emerald-650 mt-0.5 sm:mt-1">{completedMatches}</p>
              </div>
              <div className="p-1.5 sm:p-2 bg-emerald-50 rounded-lg sm:rounded-xl text-emerald-600 shrink-0">
                <CheckCircle className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] sm:text-[10px] text-amber-600 font-bold uppercase tracking-wider truncate">Pending</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-black text-amber-600 mt-0.5 sm:mt-1">{pendingMatches}</p>
              </div>
              <div className="p-1.5 sm:p-2 bg-amber-50 rounded-lg sm:rounded-xl text-amber-600 shrink-0">
                <Clock className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>
          </div>

          <div className="console-card bg-white border border-slate-200/60 rounded-2xl sm:rounded-3xl p-3.5 sm:p-5 shadow-sm hover:shadow-md transition-all">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-[9px] sm:text-[10px] text-purple-600 font-bold uppercase tracking-wider truncate">Teams</p>
                <p className="text-xl sm:text-2xl lg:text-3xl font-black text-purple-600 mt-0.5 sm:mt-1">{participantsCount}</p>
              </div>
              <div className="p-1.5 sm:p-2 bg-purple-50 rounded-lg sm:rounded-xl text-purple-600 shrink-0">
                <Users className="w-4 h-4 sm:w-5 sm:h-5" />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs Selector */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl sm:rounded-3xl p-1.5 sm:p-2 shadow-sm">
          <div className="flex gap-1.5 sm:gap-2 overflow-x-auto font-mono scrollbar-none pb-0.5 sm:pb-0 touch-pan-x">
            {[
              { tab: 'overview', label: <><BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Overview</>, activeClass: 'bg-slate-800 text-white border-slate-900' },
              { tab: 'teams', label: <><Users className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Teams</>, activeClass: 'bg-slate-800 text-white border-slate-900' },
              { tab: 'groups', label: <>🎯 Groups</>, activeClass: 'bg-slate-800 text-white border-slate-900' },
              { tab: 'fixtures', label: <><Calendar className="w-4 h-4 text-slate-500 mr-1 inline-block align-text-bottom" /> Fixtures</>, activeClass: 'bg-slate-800 text-white border-slate-900' },
              { tab: 'standings', label: <><Trophy className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Standings</>, activeClass: 'bg-slate-800 text-white border-slate-900' },
              { tab: 'management', label: <><Settings className="w-4 h-4 text-slate-500 mr-1 inline-block align-text-bottom" /> Manage</>, activeClass: 'bg-slate-800 text-white border-slate-900' }
            ].map(({ tab, label, activeClass }) => (
              <button
                key={tab}
                onClick={() => handleTabChange(tab as TabType)}
                className={`px-3.5 sm:px-5 py-2 sm:py-2.5 rounded-xl font-bold text-[11px] sm:text-xs uppercase tracking-wider transition-all whitespace-nowrap border cursor-pointer shrink-0 ${
                  activeTab === tab
                    ? `${activeClass} shadow-sm`
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Tournaments Overview */}
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl sm:text-2xl font-bold text-gray-900">
                  Active Tournaments
                </h2>
                <button
                  onClick={() => handleTabChange('management')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                >
                  + Create
                </button>
              </div>

              {tournaments.length === 0 ? (
                <div className="text-center py-12">
                  <Trophy className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                  <p className="text-gray-500 font-medium mb-4">No tournaments created yet</p>
                  <button
                    onClick={() => handleTabChange('management')}
                    className="text-sm text-[#0066FF] hover:text-[#0052CC] font-medium"
                  >
                    Create your first tournament  &rarr; 
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {tournaments.map((tournament) => (
                    <div key={tournament.id} className="glass rounded-xl p-5 border border-gray-200/50 hover:border-blue-300/50 hover:shadow-xl transition-all group">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex-1">
                          <h3 className="font-bold text-gray-900 mb-1 group-hover:text-blue-600 transition-colors">{tournament.tournament_name}</h3>
                          <p className="text-xs text-gray-500 font-mono">{tournament.tournament_code}</p>
                        </div>
                        <span className={`px-2.5 py-1 text-xs rounded-full font-medium shrink-0 ${tournament.status === 'active' ? 'bg-green-100 text-green-700' :
                          tournament.status === 'completed' ? 'bg-gray-100 text-gray-700' :
                            'bg-yellow-100 text-yellow-700'
                          }`}>
                          {tournament.status}
                        </span>
                      </div>

                      <div className="space-y-2 mb-4">
                        <div className="flex items-center text-xs text-gray-600">
                          <Layers className="w-4 h-4 mr-2 text-slate-500" />
                          {tournament.tournament_type === 'league' ? (
                            <>
                              <Activity className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> League
                            </>
                          ) : tournament.tournament_type === 'cup' ? (
                            <>
                              <Trophy className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Cup
                            </>
                          ) : tournament.tournament_type === 'ucl' ? (
                            '🌟 Champions League'
                          ) : tournament.tournament_type === 'uel' ? (
                            <>
                              <Star className="w-4 h-4 inline-block text-amber-400 fill-amber-400 mr-1 align-text-bottom" /> Europa League
                            </>
                          ) : tournament.tournament_type === 'triple_threat' ? (
                            <>
                              <Flame className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Triple Threat
                            </>
                          ) : (
                            tournament.tournament_type
                          )}
                        </div>

                        {tournament.has_knockout_stage && (
                          <div className="text-xs text-purple-600 font-medium">
                            <Swords className="w-4 h-4 inline-block text-rose-500 mr-1 align-text-bottom" /> Includes Knockout Stage
                          </div>
                        )}

                        {tournament.has_group_stage && (
                          <div className="text-xs text-blue-600 font-medium">
                            <Users className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> {tournament.number_of_groups} Groups × {tournament.teams_per_group} Teams
                          </div>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setSelectedTournamentForFixtures(tournament.id);
                            setSelectedTournamentForTeams(tournament.id);
                            setSelectedTournamentForStandings(tournament.id);
                            setSelectedTournamentForGroups(tournament.id);
                            setActiveTab('fixtures');
                            updateUrlParams({ tournament: tournament.id, tab: 'fixtures' });
                          }}
                          className="flex-1 px-3 py-2 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg hover:bg-blue-100 transition-colors"
                        >
                          <Calendar className="w-4 h-4 text-slate-500" /> Fixtures
                        </button>
                        <button
                          onClick={() => {
                            setSelectedTournamentForFixtures(tournament.id);
                            setSelectedTournamentForTeams(tournament.id);
                            setSelectedTournamentForStandings(tournament.id);
                            setSelectedTournamentForGroups(tournament.id);
                            setActiveTab('standings');
                            updateUrlParams({ tournament: tournament.id, tab: 'standings' });
                          }}
                          className="flex-1 px-3 py-2 bg-purple-50 text-purple-700 text-xs font-medium rounded-lg hover:bg-purple-100 transition-colors"
                        >
                          <Trophy className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Standings
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Upcoming & Recent Matches */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Upcoming Matches */}
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                    <span className="text-xl"><Clock className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /></span>
                    Upcoming Matches
                  </h3>
                  <button
                    onClick={() => handleTabChange('fixtures')}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    View All  &rarr; 
                  </button>
                </div>

                {upcomingMatches.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Calendar className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                    <p className="text-sm">No upcoming matches</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {upcomingMatches.map((match: any) => (
                      <div key={match.id} className="p-4 bg-white/50 rounded-xl border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                            R{match.round_number}
                          </span>
                          <span className="text-xs text-gray-500">Match {match.match_number}</span>
                          {match.tournament_name && (
                            <span className="text-xs text-gray-400">• {match.tournament_name}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-gray-900">{match.home_team_name}</span>
                          <span className="text-xs text-gray-400 mx-2">vs</span>
                          <span className="font-medium text-gray-900">{match.away_team_name}</span>
                        </div>
                        <Link
                          href={`/dashboard/committee/team-management/fixture/${match.id}`}
                          className="mt-2 text-xs text-blue-600 hover:text-blue-700 font-medium inline-block"
                        >
                          View Details &rarr;
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Results */}
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg sm:text-xl font-bold text-gray-900 flex items-center gap-2">
                    <span className="text-xl"><CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /></span>
                    Recent Results
                  </h3>
                  <button
                    onClick={() => handleTabChange('fixtures')}
                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                  >
                    View All  &rarr; 
                  </button>
                </div>

                {recentMatches.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <CheckCircle className="w-12 h-12 mx-auto text-slate-300 mb-3" />
                    <p className="text-sm">No completed matches yet</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {recentMatches.map((match: any) => (
                      <div key={match.id} className="p-4 bg-white/50 rounded-xl border border-gray-100">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                            R{match.round_number}
                          </span>
                          <span className="text-xs text-gray-500">Match {match.match_number}</span>
                          {match.tournament_name && (
                            <span className="text-xs text-gray-400">• {match.tournament_name}</span>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <div className={`flex-1 text-right ${match.result === 'home_win' ? 'font-bold text-green-600' : 'text-gray-600'}`}>
                            <span className="text-sm">{match.home_team_name}</span>
                            {match.home_score !== undefined && (
                              <span className="ml-2 text-lg">{match.home_score}</span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400 mx-3">-</span>
                          <div className={`flex-1 text-left ${match.result === 'away_win' ? 'font-bold text-green-600' : 'text-gray-600'}`}>
                            {match.away_score !== undefined && (
                              <span className="mr-2 text-lg">{match.away_score}</span>
                            )}
                            <span className="text-sm">{match.away_team_name}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'teams' && (
          <div className="space-y-6">
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">
                Manage Tournament Teams
              </h2>
              <p className="text-gray-600 text-sm mb-6">
                Select which teams will participate in this tournament. You must assign teams before generating fixtures.
              </p>

              {/* Tournament Selector */}
              <div className="mb-6">
                <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                  Select Tournament
                </label>
                <select
                  value={selectedTournamentForTeams}
                  onChange={(e) => handleTournamentChange(e.target.value)}
                  className="w-full px-4 py-3 bg-white/60 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/70 transition-all"
                >
                  <option value="">-- Select a tournament --</option>
                  {tournaments.map((tournament) => (
                    <option key={tournament.id} value={tournament.id}>
                      {tournament.tournament_name} ({tournament.status})
                    </option>
                  ))}
                </select>
              </div>

              {/* Teams List */}
              {selectedTournamentForTeams && tournamentTeams.length > 0 && (
                <>
                  <div className="mb-4">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-lg font-bold text-gray-900">
                        Select Participating Teams ({selectedTeamsForTournament.length} of {tournamentTeams.length} selected)
                      </h3>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setSelectedTeamsForTournament(tournamentTeams.map(t => t.team_id));
                        }}
                        disabled={selectedTeamsForTournament.length === tournamentTeams.length}
                        className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                      >
                        <Users className="w-4 h-4" />
                        Select All Season Teams
                      </button>
                      <button
                        onClick={() => {
                          setSelectedTeamsForTournament([]);
                        }}
                        disabled={selectedTeamsForTournament.length === 0}
                        className="px-4 py-2 bg-white text-gray-700 text-sm font-medium rounded-lg border border-gray-300 hover:bg-gray-50 transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
                      >
                        <X className="w-4 h-4" />
                        Clear Selection
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6 max-h-96 overflow-y-auto">
                    {tournamentTeams.map((team: any) => (
                      <label
                        key={team.team_id}
                        className="flex items-center p-3 bg-white/50 rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedTeamsForTournament.includes(team.team_id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTeamsForTournament([...selectedTeamsForTournament, team.team_id]);
                            } else {
                              setSelectedTeamsForTournament(selectedTeamsForTournament.filter(id => id !== team.team_id));
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-3"
                        />
                        <div className="flex items-center flex-1 min-w-0">
                          {(team.logo_url || team.logoUrl || team.logoURL) ? (
                            <img
                              src={team.logo_url || team.logoUrl || team.logoURL}
                              alt=""
                              className="w-7 h-7 rounded-full object-cover mr-2.5 flex-shrink-0"
                            />
                          ) : (
                            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-slate-200 to-slate-300 flex items-center justify-center mr-2.5 flex-shrink-0">
                              <span className="text-[10px] font-bold text-slate-600">{team.team_name?.charAt(0)?.toUpperCase()}</span>
                            </div>
                          )}
                          <span className="text-sm font-medium text-gray-900 truncate">{team.team_name}</span>
                          {team.is_participating && (
                            <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full flex-shrink-0">Assigned</span>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>

                  {/* Save Button */}
                  <div className="flex justify-end">
                    <button
                      onClick={handleSaveTournamentTeams}
                      disabled={isSavingTeams}
                      className="px-6 py-3 bg-gradient-to-r from-green-600 to-green-700 text-white rounded-xl hover:shadow-lg transition-all font-medium disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
                    >
                      {isSavingTeams ? (
                        <>
                          <RefreshCw className="animate-spin h-5 w-5 mr-2" />
                          Saving...
                        </>
                      ) : (
                        <>
                          <Check className="w-5 h-5 mr-2" />
                          Save Team Assignments
                        </>
                      )}
                    </button>
                  </div>
                </>
              )}

              {/* Empty State */}
              {selectedTournamentForTeams && tournamentTeams.length === 0 && (
                <div className="text-center py-12">
                  <Users className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                  <p className="text-gray-500 font-medium">No teams registered for this season yet</p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'fixtures' && (
          <div className="space-y-6">
            {/* Tournament Selector & Actions */}
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-4 sm:p-6 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 shadow-2xs">
                    <Layers className="w-5 h-5 sm:w-6 sm:h-6" />
                  </div>
                  <div>
                    <h2 className="text-lg sm:text-xl font-bold text-gray-900 tracking-tight">
                      Fixtures Management
                    </h2>
                    <p className="text-xs text-gray-500">
                      Configure tournament match rules, knockout brackets, and automated matchup generation.
                    </p>
                  </div>
                </div>

                {selectedTournamentForFixtures && (
                  <button
                    type="button"
                    onClick={() => setIsFixturesManagementExpanded(!isFixturesManagementExpanded)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 border border-slate-200/80 shadow-2xs cursor-pointer w-full sm:w-auto"
                  >
                    <Settings className="w-4 h-4 text-slate-500" />
                    <span>{isFixturesManagementExpanded ? 'Hide Settings & Generator' : 'Configure & Generate'}</span>
                    {isFixturesManagementExpanded ? (
                      <ChevronUp className="w-4 h-4 text-slate-500" />
                    ) : (
                      <ChevronDown className="w-4 h-4 text-slate-500" />
                    )}
                  </button>
                )}
              </div>

              <div className="space-y-3">
                {/* Tournament Selector */}
                <div>
                  <label className="block text-xs font-black uppercase text-slate-600 tracking-wider mb-2">
                    Active Tournament
                  </label>
                  <div className="relative">
                    <select
                      value={selectedTournamentForFixtures}
                      onChange={(e) => handleTournamentChange(e.target.value)}
                      className="w-full px-4 py-3 bg-slate-50 hover:bg-slate-100/80 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/70 transition-all cursor-pointer appearance-none"
                    >
                      <option value="">-- Select a tournament --</option>
                      {tournaments.map((tournament) => (
                        <option key={tournament.id} value={tournament.id}>
                          {tournament.tournament_name} ({tournament.status})
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                {/* Live Tournament Badges Strip */}
                {selectedTournament && (
                  <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                    <span className={`px-2.5 py-1 rounded-lg font-bold border ${
                      selectedTournament.status === 'active'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border-slate-200'
                    }`}>
                      ● {selectedTournament.status.toUpperCase()}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg font-bold bg-slate-100 text-slate-700 border border-slate-200">
                      CODE: {selectedTournament.tournament_code}
                    </span>
                    {isTripleThreatTournament ? (
                      <span className="px-2.5 py-1 rounded-lg font-bold bg-amber-50 text-amber-800 border border-amber-300 flex items-center gap-1 shadow-2xs">
                        ⚡ SS TRIPLE THREAT (3 MATCHUPS)
                      </span>
                    ) : (
                      <span className="px-2.5 py-1 rounded-lg font-bold bg-blue-50 text-blue-700 border border-blue-200">
                        {selectedTournament.tournament_type.toUpperCase()}
                      </span>
                    )}
                    <span className="px-2.5 py-1 rounded-lg font-medium bg-slate-50 text-slate-600 border border-slate-200 ml-auto">
                      {fixturesForSelectedTournament.length} total fixtures
                    </span>
                  </div>
                )}
              </div>

              {/* Collapsible Settings & Generation Section */}
              {selectedTournamentForFixtures && isFixturesManagementExpanded && (
                <div className="mt-5 pt-5 border-t border-slate-100 space-y-6">

                  {/* Section A: Match & Lineup Configuration */}
                  <div className="p-4 sm:p-5 bg-slate-50/70 border border-slate-200/80 rounded-2xl space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                        <Shield className="w-3.5 h-3.5 text-blue-600" /> Match & Lineup Rules
                      </span>
                      {isTripleThreatTournament && (
                        <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-300 rounded shadow-2xs">
                          ⚡ Triple Threat Preset Active
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Fixture Type */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Fixture Type</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setIsTwoLegged(false)}
                            className={`p-3 rounded-xl border-2 transition-all text-left cursor-pointer ${
                              !isTwoLegged
                                ? 'border-blue-500 bg-blue-50/80 text-blue-900 shadow-2xs ring-2 ring-blue-400/20'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            <div className="font-bold text-xs sm:text-sm">Single Leg</div>
                            <div className="text-[11px] mt-0.5 opacity-75">
                              {isTripleThreatTournament ? '3 matchups once' : 'Each team plays once'}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setIsTwoLegged(true)}
                            className={`p-3 rounded-xl border-2 transition-all text-left cursor-pointer ${
                              isTwoLegged
                                ? 'border-blue-500 bg-blue-50/80 text-blue-900 shadow-2xs ring-2 ring-blue-400/20'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            <div className="font-bold text-xs sm:text-sm">Two Legs</div>
                            <div className="text-[11px] mt-0.5 opacity-75">
                              {isTripleThreatTournament ? 'Home + Away (3 each)' : 'Home & Away fixtures'}
                            </div>
                          </button>
                        </div>
                      </div>

                      {/* Matchup Creation Mode */}
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">Matchup Creation Mode</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setMatchupMode('manual')}
                            className={`p-3 rounded-xl border-2 transition-all text-left cursor-pointer ${
                              matchupMode === 'manual'
                                ? 'border-blue-500 bg-blue-50/80 text-blue-900 shadow-2xs ring-2 ring-blue-400/20'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            <div className="font-bold text-xs sm:text-sm">Manual Matchups</div>
                            <div className="text-[11px] mt-0.5 opacity-75">
                              {isTripleThreatTournament ? 'Set via Triple Threat Lineups' : 'Teams create matchups manually'}
                            </div>
                          </button>
                          <button
                            type="button"
                            onClick={() => setMatchupMode('blind_lineup')}
                            className={`p-3 rounded-xl border-2 transition-all text-left cursor-pointer ${
                              matchupMode === 'blind_lineup'
                                ? 'border-purple-500 bg-purple-50/80 text-purple-900 shadow-2xs ring-2 ring-purple-400/20'
                                : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                            }`}
                          >
                            <div className="font-bold text-xs sm:text-sm">Blind Lineup</div>
                            <div className="text-[11px] mt-0.5 opacity-75">Auto-matchups from player order</div>
                          </button>
                        </div>
                      </div>
                    </div>

                    {isTripleThreatTournament && (
                      <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
                        <span className="text-amber-600 text-sm font-bold">⚡</span>
                        <div>
                          <strong>Triple Threat Matchup Engine:</strong> In SS Triple Threat, 3 distinct matchups (Co-op 2v2, Duo 2v2, Single 1v1) are automatically generated as soon as lineups are submitted by teams (or the committee on their behalf).
                        </div>
                      </div>
                    )}
                    {!isTripleThreatTournament && matchupMode === 'blind_lineup' && (
                      <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-800">
                        <strong>Blind Lineup Mode:</strong> Teams submit ordered rosters during the home fixture phase. Matchups are paired automatically (Player 1 vs Player 1, Player 2 vs Player 2, etc.).
                      </div>
                    )}
                  </div>

                  {/* Section B: Knockout Format & Scoring Rules */}
                  <div className="p-4 sm:p-5 bg-slate-50/70 border border-slate-200/80 rounded-2xl space-y-4">
                    {/* Knockout Format Selection */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-[11px] font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                          <Trophy className="w-3.5 h-3.5 text-amber-500" /> Knockout Format (For Knockout Generation)
                        </label>
                        {isTripleThreatTournament && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1 shadow-2xs">
                            ⚡ SS Triple Threat Preset
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setKnockoutFormat('triple_threat')}
                          className={`p-3.5 rounded-xl border-2 transition-all text-left relative cursor-pointer ${
                            knockoutFormat === 'triple_threat'
                              ? 'border-amber-500 bg-amber-50/90 text-amber-950 ring-2 ring-amber-400/30 shadow-xs'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-amber-200'
                          }`}
                        >
                          {isTripleThreatTournament && (
                            <span className="absolute -top-2 right-2 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-amber-500 text-white rounded shadow-2xs">
                              Recommended
                            </span>
                          )}
                          <div className="font-bold text-xs sm:text-sm flex items-center gap-1">
                            <span className="text-amber-500 font-bold">⚡</span> SS Triple Threat
                          </div>
                          <div className="text-[11px] mt-0.5 opacity-80">3 matchups (Co-op, Duo, Single)</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setKnockoutFormat('single_leg')}
                          className={`p-3.5 rounded-xl border-2 transition-all text-left cursor-pointer ${
                            knockoutFormat === 'single_leg'
                              ? 'border-emerald-500 bg-emerald-50/90 text-emerald-950 ring-2 ring-emerald-400/30 shadow-xs'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <div className="font-bold text-xs sm:text-sm">Single Leg</div>
                          <div className="text-[11px] mt-0.5 opacity-80">
                            {isTripleThreatTournament ? '3 matchups (Co-op, Duo, Single)' : '5 matchups (1v1, 2v2...)'}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setKnockoutFormat('two_leg')}
                          className={`p-3.5 rounded-xl border-2 transition-all text-left cursor-pointer ${
                            knockoutFormat === 'two_leg'
                              ? 'border-blue-500 bg-blue-50/90 text-blue-950 ring-2 ring-blue-400/30 shadow-xs'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <div className="font-bold text-xs sm:text-sm">Two Legs</div>
                          <div className="text-[11px] mt-0.5 opacity-80">
                            {isTripleThreatTournament ? 'Home + Away (3 matchups each)' : 'Home + Away fixtures'}
                          </div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setKnockoutFormat('round_robin')}
                          className={`p-3.5 rounded-xl border-2 transition-all text-left cursor-pointer ${
                            knockoutFormat === 'round_robin'
                              ? 'border-orange-500 bg-orange-50/90 text-orange-950 ring-2 ring-orange-400/30 shadow-xs'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <div className="font-bold text-xs sm:text-sm">Round Robin</div>
                          <div className="text-[11px] mt-0.5 opacity-80">25 matchups (all vs all)</div>
                        </button>
                      </div>
                      {knockoutFormat === 'triple_threat' && (
                        <div className="mt-2.5 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                          <p>
                            <strong>⚡ SS Triple Threat Format:</strong> Each knockout tie contains exactly 3 matchups: 
                            <strong> Matchup 1 (Co-op 2v2)</strong>, <strong>Matchup 2 (Duo 2v2)</strong>, and <strong>Matchup 3 (Single 1v1)</strong>. 
                            Teams field exactly 5 unique players with no position overlap.
                          </p>
                        </div>
                      )}
                      {knockoutFormat === 'round_robin' && (
                        <div className="mt-2.5 p-3 bg-orange-50 border border-orange-200 rounded-xl text-xs text-orange-900">
                          <p>
                            <strong>Round Robin:</strong> Each of 5 players from home team plays against each of 5 players from away team (5×5 = 25 matchups). 
                            {scoringSystem === 'goals' 
                              ? ' Winner determined by total goals scored (with matchup wins as tiebreaker).'
                              : ' Winner determined by total matchup wins.'}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Scoring System Selection */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-[11px] font-black uppercase text-slate-700 tracking-wider flex items-center gap-1.5">
                          <Target className="w-3.5 h-3.5 text-blue-600" /> Scoring System (Applies To All Formats)
                        </label>
                        {isTripleThreatTournament && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 flex items-center gap-1 shadow-2xs">
                            ⚡ Clean Sweep (+1 pt) Enabled
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setScoringSystem('triple_threat')}
                          className={`p-3.5 rounded-xl border-2 transition-all text-left relative cursor-pointer ${
                            scoringSystem === 'triple_threat'
                              ? 'border-amber-500 bg-amber-50/90 text-amber-950 ring-2 ring-amber-400/30 shadow-xs'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-amber-200'
                          }`}
                        >
                          {isTripleThreatTournament && (
                            <span className="absolute -top-2 right-2 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-wider bg-amber-500 text-white rounded shadow-2xs">
                              Recommended
                            </span>
                          )}
                          <div className="font-bold text-xs sm:text-sm flex items-center gap-1">
                            <span className="text-amber-500 font-bold">⚡</span> Triple Threat Points
                          </div>
                          <div className="text-[11px] mt-0.5 opacity-80">3 pts win, 1 draw + Sweep (+1)</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setScoringSystem('goals')}
                          className={`p-3.5 rounded-xl border-2 transition-all text-left cursor-pointer ${
                            scoringSystem === 'goals'
                              ? 'border-emerald-500 bg-emerald-50/90 text-emerald-950 ring-2 ring-emerald-400/30 shadow-xs'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <div className="font-bold text-xs sm:text-sm">Goal-Based</div>
                          <div className="text-[11px] mt-0.5 opacity-80">Winner by total goals scored</div>
                        </button>
                        <button
                          type="button"
                          onClick={() => setScoringSystem('wins')}
                          className={`p-3.5 rounded-xl border-2 transition-all text-left cursor-pointer ${
                            scoringSystem === 'wins'
                              ? 'border-blue-500 bg-blue-50/90 text-blue-950 ring-2 ring-blue-400/30 shadow-xs'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                          }`}
                        >
                          <div className="font-bold text-xs sm:text-sm">Win-Based</div>
                          <div className="text-[11px] mt-0.5 opacity-80">3 pts for win, 1 for draw</div>
                        </button>
                      </div>
                      <div className={`mt-2.5 p-3 rounded-xl border text-xs ${
                        scoringSystem === 'triple_threat' 
                          ? 'bg-amber-50 border-amber-200 text-amber-900' 
                          : 'bg-blue-50/80 border-blue-200 text-blue-900'
                      }`}>
                        {scoringSystem === 'triple_threat' && (
                          <p>
                            <strong>⚡ Triple Threat Scoring:</strong> Matchup win = 3 points, draw = 1 point. If a team wins all 3 matchups (3-0 clean sweep), they receive a <strong>+1 Clean Sweep Bonus</strong> (max 10 pts per tie). Points difference counts directly as Goal Difference (GD).
                          </p>
                        )}
                        {scoringSystem === 'goals' && (
                          <p>
                            <strong>Goal-Based:</strong> Team with most total goals wins. Penalties and substitution penalties count as goals.
                          </p>
                        )}
                        {scoringSystem === 'wins' && (
                          <p>
                            <strong>Win-Based:</strong> Each matchup win = 3 points, draw = 1 point. Team with most points wins. Penalties and substitution penalties count as points.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Section C: Round-Wise Knockout Generation */}
                  <div className="p-4 sm:p-6 bg-slate-900 text-white rounded-2xl border border-slate-800 shadow-sm space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-800">
                      <div className="flex items-center gap-2">
                        <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Sparkles className="w-4 h-4" />
                        </div>
                        <div>
                          <h3 className="text-sm sm:text-base font-bold text-white tracking-wide">
                            Round-Wise Knockout Generator
                          </h3>
                          <p className="text-[11px] text-slate-400">
                            Generate one knockout round at a time with custom seeding and matchup pairing.
                          </p>
                        </div>
                      </div>
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/20 text-purple-300 border border-purple-500/30 w-fit">
                        Step-by-Step
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      {/* Round Type */}
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5">
                          Round Type
                        </label>
                        <select
                          value={knockoutRoundType}
                          onChange={(e) => setKnockoutRoundType(e.target.value as any)}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none cursor-pointer"
                        >
                          <option value="quarter_finals">Quarter Finals (8 teams)</option>
                          <option value="semi_finals">Semi Finals (4 teams)</option>
                          <option value="finals">Finals (2 teams)</option>
                          <option value="third_place">Third Place Playoff (2 teams)</option>
                          <option value="playoff">Playoff (4 teams → 2)</option>
                          <option value="tiebreaker">⚔️ 3v3 Tiebreaker (2 teams)</option>
                        </select>
                      </div>

                      {/* Round Number */}
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5">
                          Round # <span className="text-purple-400 font-normal">(Auto-calculated)</span>
                        </label>
                        <input
                          type="number"
                          value={knockoutRoundNumber}
                          onChange={(e) => setKnockoutRoundNumber(parseInt(e.target.value))}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none"
                        />
                      </div>

                      {/* Number of Teams */}
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5">
                          Teams Required
                        </label>
                        <div className="w-full px-3 py-2 bg-slate-800/60 border border-slate-700/80 rounded-xl text-xs font-bold text-slate-300">
                          {knockoutNumTeams} teams ({knockoutRoundType.replace('_', ' ').toUpperCase()})
                        </div>
                      </div>

                      {/* Pairing Method */}
                      <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-1.5">
                          Pairing Method
                        </label>
                        <select
                          value={knockoutPairingMethod}
                          onChange={(e) => setKnockoutPairingMethod(e.target.value as any)}
                          className="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-slate-100 focus:ring-2 focus:ring-purple-500 focus:outline-none cursor-pointer"
                        >
                          <option value="standard">Standard (1 vs 8, 2 vs 7...)</option>
                          <option value="manual">Manual (Selection Order)</option>
                          <option value="random">Random Draw</option>
                        </select>
                      </div>
                    </div>

                    {/* Team Selection with Structure Preview */}
                    <div className="space-y-3 pt-2">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                          <span>Select Teams</span>
                          <span className={`px-2 py-0.5 rounded text-[10px] font-black ${
                            knockoutSelectedTeams.length === knockoutNumTeams
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                          }`}>
                            {knockoutSelectedTeams.length} / {knockoutNumTeams} Selected
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => loadAvailableTeamsForKnockout(selectedTournamentForFixtures)}
                          className="px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs rounded-xl font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer w-fit"
                        >
                          <BarChart2 className="w-3.5 h-3.5" />
                          <span>Load & Auto-Select Top Teams</span>
                        </button>
                      </div>

                      {availableTeamsForKnockout.length > 0 ? (
                        <>
                          {/* Knockout Structure Preview */}
                          {knockoutSelectedTeams.length === knockoutNumTeams && (
                            <div className="p-3 bg-slate-800/80 rounded-xl border border-slate-700 space-y-2">
                              <h4 className="text-[11px] font-black uppercase text-amber-400 tracking-wider flex items-center gap-1">
                                <Trophy className="w-3.5 h-3.5" /> Knockout Structure Preview
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                {knockoutPairingMethod === 'standard' && (
                                  Array.from({ length: knockoutNumTeams / 2 }, (_, i) => {
                                    const team1 = availableTeamsForKnockout.find(t => t.team_id === knockoutSelectedTeams[i]);
                                    const team2 = availableTeamsForKnockout.find(t => t.team_id === knockoutSelectedTeams[knockoutNumTeams - 1 - i]);
                                    return (
                                      <div key={i} className="flex items-center justify-between p-2 bg-slate-900 rounded-lg border border-slate-800 text-[11px]">
                                        <span className="font-bold text-slate-200 truncate max-w-[42%]">
                                          #{i + 1} {team1?.team_name || 'Team'}
                                        </span>
                                        <span className="text-amber-400 font-black px-1.5">VS</span>
                                        <span className="font-bold text-slate-200 truncate max-w-[42%] text-right">
                                          #{knockoutNumTeams - i} {team2?.team_name || 'Team'}
                                        </span>
                                      </div>
                                    );
                                  })
                                )}
                                {knockoutPairingMethod === 'manual' && (
                                  <p className="text-[11px] text-slate-400 col-span-2">Manual pairing: Teams will be paired in order of your click selection.</p>
                                )}
                                {knockoutPairingMethod === 'random' && (
                                  <p className="text-[11px] text-slate-400 col-span-2">Random draw: Teams will be randomly shuffled into pairings.</p>
                                )}
                              </div>
                            </div>
                          )}

                          {/* Team Grid */}
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 max-h-56 overflow-y-auto p-2 bg-slate-950/60 rounded-xl border border-slate-800 scrollbar-thin">
                            {availableTeamsForKnockout.map((team, index) => {
                              const isSelected = knockoutSelectedTeams.includes(team.team_id);
                              const selectionOrder = knockoutSelectedTeams.indexOf(team.team_id) + 1;
                              const isTopTeam = index < knockoutNumTeams;

                              return (
                                <button
                                  key={team.team_id}
                                  type="button"
                                  onClick={() => toggleKnockoutTeam(team.team_id)}
                                  className={`p-2.5 rounded-xl text-left text-xs transition-all relative border cursor-pointer ${
                                    isSelected
                                      ? 'bg-purple-600 text-white border-purple-400 shadow-xs ring-1 ring-purple-300/40'
                                      : isTopTeam
                                        ? 'bg-slate-800/90 hover:bg-slate-800 text-slate-200 border-emerald-500/30'
                                        : 'bg-slate-900 hover:bg-slate-800/80 text-slate-400 border-slate-800'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-1 mb-1">
                                    <span className={`text-[10px] font-bold ${isSelected ? 'text-purple-200' : 'text-slate-400'}`}>
                                      #{team.position || index + 1}
                                    </span>
                                    {team.group_name && (
                                      <span className={`text-[10px] px-1 py-0.2 rounded font-black ${
                                        isSelected ? 'bg-white/20 text-white' : 'bg-slate-700 text-slate-300'
                                      }`}>
                                        GRP {team.group_name}
                                      </span>
                                    )}
                                    {isSelected && (
                                      <span className="ml-auto bg-white text-purple-700 px-1.5 py-0.2 rounded text-[10px] font-black">
                                        #{selectionOrder}
                                      </span>
                                    )}
                                  </div>
                                  <div className="font-bold text-xs truncate">{team.team_name}</div>
                                  <div className="text-[10px] opacity-70 mt-0.5">
                                    {team.points || 0} pts {team.matches_played > 0 && `• ${team.wins || 0}W`}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </>
                      ) : (
                        <div className="p-6 bg-slate-950/40 rounded-xl border border-slate-800 text-center">
                          <Users className="w-8 h-8 mx-auto text-slate-600 mb-2" />
                          <p className="text-xs font-bold text-slate-300">No teams loaded yet</p>
                          <p className="text-[11px] text-slate-500">Click &ldquo;Load & Auto-Select Top Teams&rdquo; to pull the latest standings.</p>
                        </div>
                      )}
                    </div>

                    {/* Generate Knockout Round Button */}
                    <button
                      type="button"
                      onClick={handleGenerateKnockoutRound}
                      disabled={isGeneratingKnockoutRound || knockoutSelectedTeams.length !== knockoutNumTeams}
                      className="w-full py-3 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white rounded-xl font-bold text-xs sm:text-sm transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {isGeneratingKnockoutRound ? (
                        <>
                          <RefreshCw className="animate-spin h-4 w-4" />
                          <span>Generating Knockout Round...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-amber-300" />
                          <span>Generate {knockoutRoundType.replace('_', ' ').toUpperCase()} ({knockoutNumTeams} Teams)</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Section D: Action Toolbar */}
                  <div className="p-4 bg-slate-50/80 border border-slate-200/80 rounded-2xl flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2.5">
                      <button
                        type="button"
                        onClick={handleGenerateTournamentFixtures}
                        disabled={isGeneratingFixtures}
                        className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                      >
                        {isGeneratingFixtures ? (
                          <>
                            <RefreshCw className="animate-spin h-4 w-4" />
                            <span>Generating...</span>
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4" />
                            <span>Generate Fixtures</span>
                          </>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={handleGenerateKnockoutFixtures}
                        disabled={isGeneratingKnockout}
                        className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs sm:text-sm font-bold transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer"
                      >
                        {isGeneratingKnockout ? (
                          <>
                            <RefreshCw className="animate-spin h-4 w-4" />
                            <span>Generating...</span>
                          </>
                        ) : (
                          <>
                            <Trophy className="w-4 h-4 text-amber-300" />
                            <span>Generate Knockout Bracket</span>
                          </>
                        )}
                      </button>
                    </div>

                    {fixturesForSelectedTournament.length > 0 && (
                      <button
                        type="button"
                        onClick={handleDeleteTournamentFixtures}
                        disabled={isDeletingFixtures}
                        className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-xs sm:text-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 cursor-pointer ml-auto"
                      >
                        {isDeletingFixtures ? (
                          <>
                            <RefreshCw className="animate-spin h-4 w-4" />
                            <span>Deleting...</span>
                          </>
                        ) : (
                          <>
                            <Trash2 className="w-4 h-4 text-rose-600" />
                            <span>Delete All Fixtures</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Empty State when no fixtures generated */}
            {selectedTournamentForFixtures && fixturesForSelectedTournament.length === 0 && (
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm text-center">
                <div className="p-3 bg-blue-50 border border-blue-100 rounded-2xl w-fit mx-auto mb-3">
                  <ClipboardList className="w-8 h-8 text-blue-600" />
                </div>
                <h3 className="text-base font-bold text-gray-900 mb-1">No Fixtures Generated Yet</h3>
                <p className="text-xs text-gray-500 max-w-md mx-auto mb-4">
                  Make sure you have assigned teams to this tournament in the Teams or Groups tab, then click &ldquo;Configure & Generate&rdquo; above.
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => handleTabChange('teams')}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Users className="w-4 h-4" />
                    <span>Go to Teams Tab</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTabChange('groups')}
                    className="px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold rounded-xl border border-blue-200 transition-all flex items-center gap-1.5 cursor-pointer"
                  >
                    <Layers className="w-4 h-4" />
                    <span>Go to Groups Tab</span>
                  </button>
                </div>
              </div>
            )}

            {/* Fixtures List Section */}
            {selectedTournamentForFixtures && fixturesForSelectedTournament.length > 0 && (
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-4 sm:p-6 shadow-sm space-y-4">
                
                {/* Header & Controls Toolbar */}
                <div className="flex flex-col gap-3 pb-3 border-b border-slate-100">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-blue-50 text-blue-600 border border-blue-100">
                        <ClipboardList className="w-5 h-5" />
                      </div>
                      <div>
                        <h3 className="text-base sm:text-lg font-bold text-gray-900 flex items-center gap-2">
                          <span>Scheduled Fixtures</span>
                          <span className="text-xs font-normal text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
                            {filteredFixtures.length} of {fixturesForSelectedTournament.length}
                          </span>
                        </h3>
                      </div>
                    </div>

                    {selectedRound > 0 && filteredFixtures.length > 0 && (
                      <div className="shrink-0">
                        <RoundFixturesShareButton
                          roundNumber={selectedRound}
                          fixtures={filteredFixtures}
                          tournamentName={selectedTournament?.tournament_name || "SSPS League"}
                        />
                      </div>
                    )}
                  </div>

                  {/* Round Filter Toolbar */}
                  <div className="bg-slate-50 p-2.5 sm:p-3 rounded-2xl border border-slate-200/80 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
                    {/* Round Dropdown + Prev/Next Controls */}
                    <div className="flex items-center gap-1.5 w-full sm:w-auto">
                      <button
                        type="button"
                        onClick={() => handleRoundChange(selectedRound > 1 ? selectedRound - 1 : maxRounds)}
                        className="p-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl transition-all shadow-2xs cursor-pointer shrink-0"
                        title="Previous Round"
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>

                      <div className="relative flex-1 sm:w-56">
                        <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
                          <Calendar className="w-4 h-4 text-blue-600 mr-2 shrink-0" />
                          <select
                            value={selectedRound}
                            onChange={(e) => handleRoundChange(parseInt(e.target.value))}
                            className="w-full bg-transparent text-xs sm:text-sm font-bold text-slate-800 focus:outline-none cursor-pointer"
                          >
                            <option value={0}>All Rounds ({fixturesForSelectedTournament.length})</option>
                            {Array.from({ length: maxRounds }, (_, i) => i + 1).map(round => {
                              const count = fixturesForSelectedTournament.filter(f => f.round_number === round).length;
                              return (
                                <option key={round} value={round}>
                                  Round {round} ({count} {count === 1 ? 'match' : 'matches'})
                                </option>
                              );
                            })}
                          </select>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRoundChange(selectedRound > 0 && selectedRound < maxRounds ? selectedRound + 1 : 1)}
                        className="p-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl transition-all shadow-2xs cursor-pointer shrink-0"
                        title="Next Round"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Quick Round Pills */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-0.5 pt-0.5 scrollbar-none w-full sm:max-w-md">
                      <button
                        type="button"
                        onClick={() => handleRoundChange(0)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                          selectedRound === 0
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                        }`}
                      >
                        All
                      </button>
                      {Array.from({ length: maxRounds }, (_, i) => i + 1).map(round => (
                        <button
                          key={round}
                          type="button"
                          onClick={() => handleRoundChange(round)}
                          className={`px-2.5 py-1.5 rounded-xl text-xs font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                            selectedRound === round
                              ? 'bg-blue-600 text-white shadow-2xs'
                              : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200/80'
                          }`}
                        >
                          R{round}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Group Filter Toolbar (when tournament has groups) */}
                  {availableGroups.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      <span className="text-[11px] font-black uppercase text-slate-500 tracking-wider mr-1 shrink-0 flex items-center gap-1">
                        <Layers className="w-3.5 h-3.5 text-blue-500" /> Filter Group:
                      </span>
                      <button
                        type="button"
                        onClick={() => setSelectedGroup('all')}
                        className={`px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap cursor-pointer ${
                          selectedGroup === 'all'
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        All Groups
                      </button>
                      {availableGroups.map((grp: string) => {
                        const label = grp.toUpperCase().startsWith('GROUP') ? grp.toUpperCase() : `Group ${grp.toUpperCase()}`;
                        const isActive = selectedGroup.toLowerCase() === grp.toLowerCase();
                        const count = fixturesForSelectedTournament.filter(f => {
                          const fg = f.group_name || f.id?.match(/_grp([A-Za-z0-9]+)_/)?.[1] || '';
                          return fg.toLowerCase() === grp.toLowerCase();
                        }).length;

                        return (
                          <button
                            key={grp}
                            type="button"
                            onClick={() => setSelectedGroup(isActive ? 'all' : grp)}
                            className={`px-3 py-1 rounded-xl text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                              isActive
                                ? 'bg-blue-600 text-white shadow-2xs'
                                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
                            }`}
                          >
                            <span>{label}</span>
                            <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${isActive ? 'bg-blue-700 text-white' : 'bg-slate-100 text-slate-600'}`}>
                              {count}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Fixture Cards List */}
                <div className="space-y-3">
                  {filteredFixtures.map((fixture: any) => {
                    const isHomeWinner = fixture.result === 'home_win';
                    const isAwayWinner = fixture.result === 'away_win';
                    const isCompleted = fixture.status === 'completed';
                    const isLive = fixture.status === 'in_progress';
                    const isTTFixture = (fixture as any).scoring_system === 'triple_threat' || (fixture as any).knockout_format === 'triple_threat' || isTripleThreatTournament;
                    const fixtureGroupName = fixture.group_name || fixture.id?.match(/_grp([A-Za-z0-9]+)_/)?.[1] || null;
                    const formattedGroup = fixtureGroupName
                      ? (fixtureGroupName.toUpperCase().startsWith('GROUP')
                          ? fixtureGroupName.toUpperCase()
                          : `GROUP ${fixtureGroupName.toUpperCase()}`)
                      : null;

                    return (
                      <div
                        key={fixture.id}
                        className="group bg-slate-50/70 hover:bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/80 hover:border-blue-400/60 shadow-2xs hover:shadow-md transition-all space-y-3"
                      >
                        {/* Top Meta Bar */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pb-2.5 border-b border-slate-100 text-xs">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-black px-2 py-0.5 rounded-lg bg-slate-200/80 text-slate-800 text-[11px]">
                              R{fixture.round_number}
                            </span>
                            <span className="text-[11px] font-bold text-slate-500">
                              Match #{fixture.match_number}
                            </span>
                            {fixture.leg && fixture.leg !== 'single' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                                Leg {fixture.leg === 'first' ? '1' : fixture.leg === 'second' ? '2' : fixture.leg}
                              </span>
                            )}
                            {(fixture as any).knockout_round && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-purple-100 text-purple-800 border border-purple-200 uppercase">
                                {(fixture as any).knockout_round.replace('_', ' ')}
                              </span>
                            )}
                            {formattedGroup && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200 flex items-center gap-1 shadow-2xs tracking-wider">
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-500 shrink-0"></span>
                                {formattedGroup}
                              </span>
                            )}
                            {isTTFixture && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 border border-amber-300 flex items-center gap-1 shadow-2xs">
                                ⚡ Triple Threat
                              </span>
                            )}
                            {(fixture as any).knockout_format === 'triple_threat' && (
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-300">
                                3 Matchups
                              </span>
                            )}
                            {(fixture as any).clean_sweep_winner && (
                              <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-amber-500 text-white shadow-2xs">
                                ⚡ CLEAN SWEEP
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                              isCompleted
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : isLive
                                  ? 'bg-amber-50 text-amber-700 border-amber-200 animate-pulse'
                                  : 'bg-slate-100 text-slate-600 border-slate-200'
                            }`}>
                              ● {fixture.status || 'scheduled'}
                            </span>

                            <Link
                              href={`/dashboard/committee/team-management/fixture/${fixture.id}`}
                              className="px-3 py-1 bg-white hover:bg-blue-50 text-blue-600 hover:text-blue-700 font-bold text-xs rounded-lg border border-slate-200 hover:border-blue-200 transition-all flex items-center gap-1 shadow-2xs cursor-pointer"
                            >
                              <span>Manage</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Link>
                          </div>
                        </div>

                        {/* Matchup Teams & Score Center */}
                        <div className="grid grid-cols-12 items-center gap-2 sm:gap-4 py-1">
                          {/* Home Team */}
                          <div className={`col-span-5 flex items-center justify-end gap-2 sm:gap-3 text-right ${
                            isHomeWinner ? 'font-black text-emerald-700' : 'font-bold text-slate-800'
                          }`}>
                            <div className="truncate min-w-0">
                              <span className="text-xs sm:text-base leading-tight block truncate">
                                {fixture.home_team_name}
                              </span>
                              {isHomeWinner && (
                                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                                  Winner
                                </span>
                              )}
                            </div>
                            {(fixture.home_team_logo || fixture.home_team_logo_url || fixture.home_team_logoUrl) ? (
                              <img
                                src={fixture.home_team_logo || fixture.home_team_logo_url || fixture.home_team_logoUrl}
                                alt=""
                                className="w-7 h-7 sm:w-9 sm:h-9 rounded-full object-cover shrink-0 border border-slate-200 bg-white p-0.5 shadow-2xs"
                              />
                            ) : (
                              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs shrink-0 border border-slate-300">
                                {fixture.home_team_name?.slice(0, 2).toUpperCase() || 'H'}
                              </div>
                            )}
                          </div>

                          {/* Score / VS Display */}
                          <div className="col-span-2 flex flex-col items-center justify-center text-center">
                            {fixture.home_score !== undefined && fixture.away_score !== undefined && fixture.home_score !== null && fixture.away_score !== null ? (
                              <div className="px-2 sm:px-3 py-1 bg-white border border-slate-200 rounded-xl shadow-2xs font-mono font-black text-xs sm:text-base text-slate-900 tracking-tight whitespace-nowrap">
                                <span>{fixture.home_score}</span>
                                <span className="text-slate-400 mx-1 font-normal">-</span>
                                <span>{fixture.away_score}</span>
                              </div>
                            ) : (
                              <div className="px-2 sm:px-3 py-1 bg-white border border-slate-200 rounded-xl shadow-2xs text-[11px] font-black text-slate-500 tracking-wider">
                                VS
                              </div>
                            )}
                            {fixture.scheduled_date && (
                              <span className="text-[10px] text-slate-400 mt-1 font-mono hidden sm:block truncate max-w-full">
                                {new Date(fixture.scheduled_date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                              </span>
                            )}
                          </div>

                          {/* Away Team */}
                          <div className={`col-span-5 flex items-center justify-start gap-2 sm:gap-3 text-left ${
                            isAwayWinner ? 'font-black text-emerald-700' : 'font-bold text-slate-800'
                          }`}>
                            {(fixture.away_team_logo || fixture.away_team_logo_url || fixture.away_team_logoUrl) ? (
                              <img
                                src={fixture.away_team_logo || fixture.away_team_logo_url || fixture.away_team_logoUrl}
                                alt=""
                                className="w-7 h-7 sm:w-9 sm:h-9 rounded-full object-cover shrink-0 border border-slate-200 bg-white p-0.5 shadow-2xs"
                              />
                            ) : (
                              <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs shrink-0 border border-slate-300">
                                {fixture.away_team_name?.slice(0, 2).toUpperCase() || 'A'}
                              </div>
                            )}
                            <div className="truncate min-w-0">
                              <span className="text-xs sm:text-base leading-tight block truncate">
                                {fixture.away_team_name}
                              </span>
                              {isAwayWinner && (
                                <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                                  Winner
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'standings' && (
          <div className="space-y-6">
            {/* Tournament Selector */}
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
              <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-4">
                Tournament Standings
              </h2>

              <div>
                <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                  Select Tournament
                </label>
                <select
                  value={selectedTournamentForStandings}
                  onChange={(e) => handleTournamentChange(e.target.value)}
                  className="w-full px-4 py-3 bg-white/60 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500/70 transition-all"
                >
                  <option value="">-- Select a tournament --</option>
                  {tournaments.map((tournament) => (
                    <option key={tournament.id} value={tournament.id}>
                      {tournament.tournament_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Tournament Standings - Format-Aware */}
            {selectedTournamentForStandings ? (
              <TournamentStandings tournamentId={selectedTournamentForStandings} />
            ) : (
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
                <div className="text-center py-12 text-gray-500">
                  <Trophy className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                  <p className="font-medium mb-2">Select a tournament</p>
                  <p className="text-sm">Choose a tournament above to view its standings</p>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'groups' && (
          <div className="space-y-4 sm:space-y-6">
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 shadow-sm">
              {/* Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-slate-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 sm:w-11 sm:h-11 bg-slate-800 border border-slate-900 rounded-xl flex items-center justify-center shadow-md shadow-amber-500/5 flex-shrink-0">
                    <Layers className="w-5 h-5 text-amber-400" />
                  </div>
                  <div>
                    <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">STAGE CONFIGURATION</span>
                    <h2 className="text-lg sm:text-2xl font-extrabold text-slate-900 tracking-tight">
                      Manage Tournament Groups
                    </h2>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">
                      Assign teams to groups for group stage tournaments. Teams must be assigned to the tournament first.
                    </p>
                  </div>
                </div>
              </div>

              {/* Tournament Selector */}
              <div className="mb-6">
                <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2 font-mono flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-500" /> Select Tournament
                </label>
                <div className="relative">
                  <select
                    value={selectedTournamentForGroups}
                    onChange={(e) => handleTournamentChange(e.target.value)}
                    className="w-full px-4 py-3 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-xs sm:text-sm font-bold text-slate-800 transition-all appearance-none cursor-pointer pr-10"
                  >
                    <option value="">-- Select a tournament --</option>
                    {tournaments.filter(t => t.has_group_stage).map((tournament) => (
                      <option key={tournament.id} value={tournament.id}>
                        {tournament.tournament_name} ({tournament.status})
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              {selectedTournamentForGroups && (
                <>
                  {/* Action Toolbar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 p-3 sm:p-4 bg-slate-50/80 rounded-2xl border border-slate-200/80">
                    <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 font-mono shadow-xs">
                        <ClipboardList className="w-3.5 h-3.5 text-amber-500" />
                        <span>Groups: <strong className="text-slate-900">{numberOfGroups}</strong></span>
                        <span className="text-[10px] text-slate-400 font-normal hidden sm:inline">(from settings)</span>
                      </div>
                      <button
                        type="button"
                        onClick={handleAutoDistributeGroups}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-xs transition-all cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                        <span>Auto Distribute</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleClearGroups}
                        className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-white hover:bg-rose-50 text-slate-600 hover:text-rose-600 border border-slate-200 hover:border-rose-200 font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-xs transition-all cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Clear All</span>
                      </button>
                    </div>

                    <div className="flex items-center shrink-0">
                      <button
                        type="button"
                        onClick={handleSaveGroups}
                        disabled={isSavingGroups}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm hover:shadow transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                      >
                        {isSavingGroups ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Saving...</span>
                          </>
                        ) : (
                          <>
                            <CheckCircle className="w-3.5 h-3.5" />
                            <span>Save Groups</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Assigned Groups Section */}
                  {groupAssignments.length > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                        <h3 className="text-xs sm:text-sm font-black uppercase text-slate-900 tracking-wider font-mono flex items-center gap-2">
                          <Layers className="w-4 h-4 text-blue-600" />
                          <span>Assigned Groups</span>
                        </h3>
                        <span className="text-xs text-slate-500 font-mono">
                          {groupAssignments.length} teams assigned
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {Array.from(new Set(groupAssignments.map(a => a.group_name))).sort().map(groupName => {
                          const teamsInGroup = groupAssignments.filter(a => a.group_name === groupName);
                          return (
                            <div key={groupName} className="bg-slate-50/60 rounded-2xl border border-slate-200/80 p-4 shadow-xs hover:border-slate-300 transition-all">
                              <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-200/60">
                                <div className="flex items-center gap-2">
                                  <span className="w-6 h-6 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-700 font-mono font-black text-xs flex items-center justify-center">
                                    {groupName.replace('Group ', '')}
                                  </span>
                                  <h4 className="font-bold text-slate-900 text-sm">{groupName}</h4>
                                </div>
                                <span className="text-[11px] font-mono font-bold bg-white text-slate-700 border border-slate-200 px-2 py-0.5 rounded-full shadow-2xs">
                                  {teamsInGroup.length} {teamsInGroup.length === 1 ? 'team' : 'teams'}
                                </span>
                              </div>

                              <div className="space-y-2">
                                {teamsInGroup.map((assignment) => (
                                  <div key={assignment.team_id} className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-slate-200/70 shadow-2xs hover:border-slate-300 transition-all">
                                    <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
                                      <Shield className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                      <span className="text-xs font-bold text-slate-800 truncate">
                                        {assignment.team_name || assignment.team_id}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setGroupAssignments(groupAssignments.filter(a => a.team_id !== assignment.team_id));
                                        setUnassignedTeams([...unassignedTeams, { team_id: assignment.team_id, team_name: assignment.team_name }]);
                                      }}
                                      className="w-5 h-5 flex items-center justify-center rounded-md hover:bg-rose-50 text-slate-400 hover:text-rose-600 transition-colors text-xs font-bold shrink-0 cursor-pointer"
                                      title="Remove from group"
                                    >
                                      ✕
                                    </button>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Unassigned Teams Section */}
                  {unassignedTeams.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-2">
                        <h3 className="text-xs sm:text-sm font-black uppercase text-slate-900 tracking-wider font-mono flex items-center gap-2">
                          <Users className="w-4 h-4 text-purple-600" />
                          <span>Unassigned Teams</span>
                        </h3>
                        <span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 px-2.5 py-0.5 rounded-full font-mono font-bold">
                          {unassignedTeams.length} unassigned
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {unassignedTeams.map((team) => (
                          <div key={team.team_id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200/80 shadow-xs hover:border-slate-300 transition-all">
                            <div className="flex items-center gap-2.5 min-w-0 flex-1 mr-2">
                              <div className="w-7 h-7 rounded-lg bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0">
                                <Shield className="w-3.5 h-3.5 text-slate-500" />
                              </div>
                              <span className="text-xs font-bold text-slate-800 truncate">{team.team_name}</span>
                            </div>
                            <div className="relative shrink-0">
                              <select
                                onChange={(e) => {
                                  if (e.target.value) {
                                    setGroupAssignments([...groupAssignments, {
                                      team_id: team.team_id,
                                      team_name: team.team_name,
                                      group_name: e.target.value
                                    }]);
                                    setUnassignedTeams(unassignedTeams.filter(t => t.team_id !== team.team_id));
                                  }
                                }}
                                defaultValue=""
                                className="px-2.5 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-lg text-xs font-bold text-slate-700 transition-all cursor-pointer"
                              >
                                <option value="" disabled>Assign to...</option>
                                {Array.from({ length: numberOfGroups }, (_, i) => (
                                  <option key={i} value={`Group ${String.fromCharCode(65 + i)}`}>
                                    Group {String.fromCharCode(65 + i)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Empty state: No teams assigned to tournament */}
                  {groupAssignments.length === 0 && unassignedTeams.length === 0 && (
                    <div className="text-center py-12 bg-slate-50/60 rounded-2xl border border-slate-200/80 p-6">
                      <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-3">
                        <Target className="w-6 h-6 text-slate-400" />
                      </div>
                      <h3 className="text-base font-bold text-slate-900 mb-1">No Teams in Tournament</h3>
                      <p className="text-xs text-slate-500 font-mono mb-4 max-w-md mx-auto">
                        Please assign teams to this tournament first in the Teams tab before configuring groups.
                      </p>
                      <button
                        type="button"
                        onClick={() => handleTabChange('teams')}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-xs transition-all cursor-pointer"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <span>Go to Teams Tab</span>
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* Empty state: No tournament selected */}
              {!selectedTournamentForGroups && (
                <div className="text-center py-12 bg-slate-50/60 rounded-2xl border border-slate-200/80 p-6">
                  <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-3">
                    <Trophy className="w-6 h-6 text-amber-500" />
                  </div>
                  <h3 className="text-base font-bold text-slate-900 mb-1">Select a Tournament</h3>
                  <p className="text-xs text-slate-500 font-mono max-w-md mx-auto">
                    Choose a tournament with group stage enabled from the dropdown above to view and manage group assignments.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'management' && (
          <div className="space-y-6">
            {/* Create Tournament Form */}
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
                <h2 className="text-lg sm:text-2xl font-bold text-gray-900">
                  Create New Tournament
                </h2>
                <button
                  onClick={() => setShowCreateForm(!showCreateForm)}
                  className="w-full sm:w-auto px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer text-center"
                >
                  {showCreateForm ? 'Hide Form' : 'Show Form'}
                </button>
              </div>

              {showCreateForm && (
                <form onSubmit={handleCreateTournament} className="space-y-5 sm:space-y-6">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                        Tournament Type
                      </label>
                      <select
                        value={newTournament.tournament_type}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'triple_threat') {
                            setNewTournament(prev => ({
                              ...prev,
                              tournament_type: val,
                              has_group_stage: true,
                              has_league_stage: false,
                              has_knockout_stage: true,
                              number_of_groups: 4,
                              teams_per_group: 4,
                              teams_advancing_per_group: 2,
                              number_of_teams: 16,
                              playoff_teams: 8,
                              direct_semifinal_teams: 0,
                              is_two_legged: true,
                              away_deadline_time: '14:00',
                              result_deadline_time: '00:30',
                            }));
                          } else {
                            setNewTournament(prev => ({ ...prev, tournament_type: val }));
                          }
                        }}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                        required
                      >
                        <option value="league">⚽ League</option>
                        <option value="cup">🏆 Cup</option>
                        <option value="ucl">✨ Champions League</option>
                        <option value="uel">⭐ Europa League</option>
                        <option value="super_cup">🏅 Super Cup</option>
                        <option value="league_cup">🏆 League Cup</option>
                        <option value="triple_threat">⚡ SS Triple Threat</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                        Status
                      </label>
                      <select
                        value={newTournament.status}
                        onChange={(e) => setNewTournament({ ...newTournament, status: e.target.value })}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                        required
                      >
                        <option value="upcoming">Upcoming</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                        Tournament Name
                      </label>
                      <input
                        type="text"
                        value={newTournament.tournament_name}
                        onChange={(e) => setNewTournament({ ...newTournament, tournament_name: e.target.value })}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                        placeholder="Auto-generated"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                        Tournament Code
                      </label>
                      <input
                        type="text"
                        value={newTournament.tournament_code}
                        onChange={(e) => setNewTournament({ ...newTournament, tournament_code: e.target.value })}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                        placeholder="Auto-generated"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={newTournament.start_date}
                        onChange={(e) => setNewTournament({ ...newTournament, start_date: e.target.value })}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={newTournament.end_date}
                        onChange={(e) => setNewTournament({ ...newTournament, end_date: e.target.value })}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                        <Users className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Squad Size (Players per Match)
                      </label>
                      <input
                        type="number"
                        value={newTournament.squad_size}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val >= 1 && val <= 18) {
                            setNewTournament({ ...newTournament, squad_size: val });
                          } else if (e.target.value === '') {
                            setNewTournament({ ...newTournament, squad_size: '' as any });
                          }
                        }}
                        onBlur={(e) => {
                          if (e.target.value === '' || parseInt(e.target.value) < 1) {
                            setNewTournament({ ...newTournament, squad_size: 11 });
                          }
                        }}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                        placeholder="11"
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">Number of players each team can field (1-18)</p>
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                        <Activity className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Scoring Type
                        <span className="text-xs text-gray-500 ml-2">(How team wins are calculated)</span>
                      </label>
                      <select
                        value={newTournament.scoring_type || 'goals'}
                        onChange={(e) => setNewTournament({ ...newTournament, scoring_type: e.target.value })}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                      >
                        <option value="goals">Goal-Based (Total Goals) - Default</option>
                        <option value="wins">Win-Based (Matchup Wins)</option>
                        <option value="hybrid">Hybrid (Wins + Goals Tiebreaker)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        {newTournament.scoring_type === 'wins' ? (
                          <>
                            <strong>Win-Based:</strong> Team with most matchup wins wins the fixture.
                            Example: Team A wins 3 matchups, Team B wins 2 &rarr; Team A wins
                          </>
                        ) : newTournament.scoring_type === 'hybrid' ? (
                          <>
                            <strong>Hybrid:</strong> Matchup wins decide; total goals break ties.
                            Example: Both win 2 matchups &rarr; Team with more goals wins
                          </>
                        ) : (
                          <>
                            <strong>Goal-Based (Default):</strong> Team with most total goals wins.
                            Example: Team A: 6 goals, Team B: 7 goals &rarr; Team B wins
                          </>
                        )}
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                        <Trophy className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Number of Participating Teams
                      </label>
                      <input
                        type="number"
                        min="2"
                        max="32"
                        value={newTournament.number_of_teams}
                        onChange={(e) => {
                          const val = parseInt(e.target.value) || 16;
                          setNewTournament({
                            ...newTournament,
                            number_of_teams: val,
                          });
                        }}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                        placeholder="16"
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">Total teams in the tournament (2-32)</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                      Description
                    </label>
                    <textarea
                      value={newTournament.description}
                      onChange={(e) => setNewTournament({ ...newTournament, description: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                      placeholder="Optional description..."
                    />
                  </div>

                  {/* Format Settings */}
                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Tournament Format</h3>

                    <div className="space-y-4">
                      <label className="flex items-start p-4 bg-white/50 rounded-xl border border-gray-200 cursor-pointer hover:border-blue-300 transition-all">
                        <input
                          type="checkbox"
                          checked={newTournament.has_league_stage}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setNewTournament({
                              ...newTournament,
                              has_league_stage: checked,
                              // Uncheck group if league is checked
                              has_group_stage: checked ? false : newTournament.has_group_stage
                            });
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-1 mr-3"
                        />
                        <div className="flex-1">
                          <span className="font-medium text-gray-900"><Activity className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Include League Stage</span>
                          <p className="text-xs text-gray-500 mt-1">Round-robin format where all teams play each other</p>
                        </div>
                      </label>

                      <label className="flex items-start p-4 bg-white/50 rounded-xl border border-gray-200 cursor-pointer hover:border-blue-300 transition-all">
                        <input
                          type="checkbox"
                          checked={newTournament.has_group_stage}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setNewTournament({
                              ...newTournament,
                              has_group_stage: checked,
                              // Uncheck league if group is checked
                              has_league_stage: checked ? false : newTournament.has_league_stage
                            });
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-1 mr-3"
                        />
                        <div className="flex-1">
                          <span className="font-medium text-gray-900"><Trophy className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Include Group Stage</span>
                          <p className="text-xs text-gray-500 mt-1">Divide teams into groups (e.g., Group A, B, C, D)</p>
                        </div>
                      </label>

                      <label className="flex items-start p-4 bg-white/50 rounded-xl border border-gray-200 cursor-pointer hover:border-blue-300 transition-all">
                        <input
                          type="checkbox"
                          checked={newTournament.has_knockout_stage}
                          onChange={(e) => setNewTournament({ ...newTournament, has_knockout_stage: e.target.checked })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-1 mr-3"
                        />
                        <div className="flex-1">
                          <span className="font-medium text-gray-900"><Trophy className="w-4 h-4 inline-block text-amber-500 fill-amber-500 mr-1 align-text-bottom" /> Include Knockout Stage</span>
                          <p className="text-xs text-gray-500 mt-1">Add playoff bracket (quarters, semis, final)</p>
                        </div>
                      </label>

                      {/* Group Stage Configuration */}
                      {newTournament.has_group_stage && (
                        <div className="ml-0 sm:ml-6 lg:ml-8 mt-3 p-3.5 sm:p-5 bg-blue-50/50 rounded-xl border border-blue-200 space-y-3 sm:space-y-4">
                          <h4 className="font-semibold text-gray-900 text-sm">Group Stage Settings</h4>

                          {/* Group Assignment Mode */}
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Group Assignment Mode</label>
                            <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-4">
                              <label className="flex items-center cursor-pointer">
                                <input
                                  type="radio"
                                  value="auto"
                                  checked={newTournament.group_assignment_mode === 'auto'}
                                  onChange={(e) => setNewTournament({ ...newTournament, group_assignment_mode: e.target.value })}
                                  className="mr-2"
                                />
                                <span className="text-sm"><Bot className="w-4 h-4 text-slate-500" /> Automatic (evenly distributed)</span>
                              </label>
                              <label className="flex items-center cursor-pointer">
                                <input
                                  type="radio"
                                  value="manual"
                                  checked={newTournament.group_assignment_mode === 'manual'}
                                  onChange={(e) => setNewTournament({ ...newTournament, group_assignment_mode: e.target.value })}
                                  className="mr-2"
                                />
                                <span className="text-sm">✋ Manual (assign teams to groups)</span>
                              </label>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Number of Groups</label>
                              <input
                                type="number"
                                min="1"
                                max="8"
                                value={newTournament.number_of_groups}
                                onChange={(e) => setNewTournament({ ...newTournament, number_of_groups: parseInt(e.target.value) || 4 })}
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Teams per Group</label>
                              <input
                                type="number"
                                min="2"
                                max="8"
                                value={newTournament.teams_per_group}
                                onChange={(e) => setNewTournament({ ...newTournament, teams_per_group: parseInt(e.target.value) || 4 })}
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Teams Advancing</label>
                              <input
                                type="number"
                                min="1"
                                max="4"
                                value={newTournament.teams_advancing_per_group}
                                onChange={(e) => setNewTournament({ ...newTournament, teams_advancing_per_group: parseInt(e.target.value) || 2 })}
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Knockout Stage Configuration - ONLY for League+Knockout (not Group+Knockout) */}
                      {newTournament.has_knockout_stage && !newTournament.has_group_stage && (
                        <div className="ml-0 sm:ml-6 lg:ml-8 mt-3 p-3.5 sm:p-5 bg-purple-50/50 rounded-xl border border-purple-200 space-y-3 sm:space-y-4">
                          <h4 className="font-semibold text-gray-900 text-sm">Knockout Stage Settings</h4>
                          <p className="text-xs text-gray-600 mb-2"><Lightbulb className="w-4 h-4 text-amber-500" /> These settings control the playoff bracket after league stage</p>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Playoff Teams</label>
                              <input
                                type="number"
                                min="2"
                                max="16"
                                value={newTournament.playoff_teams}
                                onChange={(e) => setNewTournament({ ...newTournament, playoff_teams: parseInt(e.target.value) || 4 })}
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
                              />
                              <p className="text-xs text-gray-500 mt-1">Total teams in knockout</p>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Direct Semifinal</label>
                              <input
                                type="number"
                                min="0"
                                max="4"
                                value={newTournament.direct_semifinal_teams}
                                onChange={(e) => setNewTournament({ ...newTournament, direct_semifinal_teams: parseInt(e.target.value) || 2 })}
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
                              />
                              <p className="text-xs text-gray-500 mt-1">Top teams skip quarters</p>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Qualification %</label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={newTournament.qualification_threshold}
                                onChange={(e) => setNewTournament({ ...newTournament, qualification_threshold: parseInt(e.target.value) || 75 })}
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
                              />
                              <p className="text-xs text-gray-500 mt-1">Min % points to qualify</p>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Info for Group+Knockout */}
                      {newTournament.has_knockout_stage && newTournament.has_group_stage && (
                        <div className="ml-0 sm:ml-6 lg:ml-8 mt-3 p-3.5 sm:p-5 bg-purple-50/50 rounded-xl border border-purple-200">
                          <h4 className="font-semibold text-gray-900 text-sm mb-2"><Info className="w-4 h-4 text-blue-500" /> Knockout Stage (Auto-configured)</h4>
                          <p className="text-xs text-gray-700">
                            Knockout bracket is automatically created based on group results:
                          </p>
                          <div className="mt-2 bg-white/60 rounded-lg p-3 border border-purple-100">
                            <p className="text-xs text-purple-900 font-medium">
                              🎯 {newTournament.number_of_groups} groups × top {newTournament.teams_advancing_per_group} = {' '}
                              <span className="font-bold text-purple-700">
                                {newTournament.number_of_groups * newTournament.teams_advancing_per_group} teams in knockout
                              </span>
                            </p>
                            <p className="text-xs text-gray-600 mt-1">
                              Bracket size and stages are determined automatically (e.g., 8 teams = Quarters, 16 teams = Round of 16)
                            </p>
                          </div>
                        </div>
                      )}

                      <label className="flex items-start p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-300 cursor-pointer hover:border-blue-500 transition-all shadow-sm">
                        <input
                          type="checkbox"
                          checked={newTournament.is_primary}
                          onChange={(e) => setNewTournament({ ...newTournament, is_primary: e.target.checked })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-1 mr-3"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900"><Star className="w-4 h-4 inline-block text-amber-400 fill-amber-400 mr-1 align-text-bottom" /> Set as Primary Tournament</span>
                            <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-semibold">IMPORTANT</span>
                          </div>
                          <p className="text-sm text-gray-700 mt-2 font-medium">Primary tournament is the main league competition for this season:</p>
                          <ul className="text-xs text-gray-600 mt-1 ml-4 list-disc space-y-1">
                            <li>Automatically generates news on season lifecycle events (creation, activation, completion)</li>
                            <li>Shown as the main tournament on dashboard and public pages</li>
                            <li>Only ONE tournament should be marked as primary per season</li>
                          </ul>
                        </div>
                      </label>

                      <label className="flex items-start p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border-2 border-green-200 cursor-pointer hover:border-green-400 transition-all shadow-sm">
                        <input
                          type="checkbox"
                          checked={newTournament.include_in_fantasy}
                          onChange={(e) => setNewTournament({ ...newTournament, include_in_fantasy: e.target.checked })}
                          className="rounded border-gray-300 text-green-600 focus:ring-green-500 mt-1 mr-3"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900">⚡ Include in Fantasy League</span>
                            <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-full font-semibold">IMPORTANT</span>
                          </div>
                          <p className="text-sm text-gray-700 mt-2 font-medium">Player stats from this tournament will count towards fantasy league:</p>
                          <ul className="text-xs text-gray-600 mt-1 ml-4 list-disc space-y-1">
                            <li>Fantasy league points and rankings</li>
                            <li>Fantasy team scoring calculations</li>
                          </ul>
                        </div>
                      </label>

                      <label className="flex items-start p-4 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl border-2 border-amber-200 cursor-pointer hover:border-amber-400 transition-all shadow-sm">
                        <input
                          type="checkbox"
                          checked={newTournament.include_in_awards}
                          onChange={(e) => setNewTournament({ ...newTournament, include_in_awards: e.target.checked })}
                          className="rounded border-gray-300 text-amber-600 focus:ring-amber-500 mt-1 mr-3"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900"><Trophy className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Include in Player Awards</span>
                            <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded-full font-semibold">IMPORTANT</span>
                          </div>
                          <p className="text-sm text-gray-700 mt-2 font-medium">Player stats from this tournament will count towards end-of-season awards:</p>
                          <ul className="text-xs text-gray-600 mt-1 ml-4 list-disc space-y-1">
                            <li>Golden Boot (Top Goal Scorer)</li>
                            <li>Golden Glove (Most Clean Sheets)</li>
                            <li>Golden Ball (Most Points)</li>
                            <li>Category-specific awards (Legend/Classic)</li>
                          </ul>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Lineup Category Requirements */}
                  <div className="border-t border-gray-200 pt-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <div>
                        <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-1">Lineup Category Requirements</h3>
                        <p className="text-xs sm:text-sm text-gray-600">Set minimum players required from each category in starting XI</p>
                      </div>
                      <label className="self-start sm:self-auto flex items-center gap-3 bg-white/50 px-4 py-2.5 rounded-xl border-2 border-gray-200 cursor-pointer hover:border-blue-500/50 transition-all shrink-0">
                        <span className="text-xs sm:text-sm font-medium text-gray-700">Enable Requirements</span>
                        <div className="relative">
                          <input
                            type="checkbox"
                            checked={newTournament.enable_category_requirements ?? false}
                            onChange={(e) => {
                              const enabled = e.target.checked;
                              setNewTournament({
                                ...newTournament,
                                enable_category_requirements: enabled,
                                // Reset requirements if disabled
                                lineup_category_requirements: enabled ? (newTournament.lineup_category_requirements || {}) : {}
                              });
                            }}
                            className="sr-only peer"
                          />
                          <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-500/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                        </div>
                      </label>
                    </div>

                    {!newTournament.enable_category_requirements ? (
                      <div className="bg-gray-50 border border-gray-200 rounded-xl p-5 sm:p-6 text-center">
                        <div className="text-3xl sm:text-4xl mb-2 sm:mb-3"><CheckCircle className="w-5 h-5 sm:w-6 sm:h-6 inline-block text-emerald-500 mr-1 align-text-bottom" /></div>
                        <p className="text-gray-700 font-medium mb-1 text-sm sm:text-base">Category Requirements Disabled</p>
                        <p className="text-xs sm:text-sm text-gray-600">Teams can create lineups without category restrictions</p>
                      </div>
                    ) : categories.length === 0 ? (
                      <div className="text-center py-8 bg-gray-50 rounded-xl">
                        <p className="text-gray-500 text-sm">No categories available</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                        {categories.map((category) => (
                          <div key={category.id} className="p-3.5 sm:p-4 bg-white/50 rounded-xl border border-gray-200">
                            <label className="flex flex-col">
                              <span className="font-medium text-gray-900 mb-2 flex items-center gap-1.5 text-xs sm:text-sm">
                                <span className={`w-2.5 h-2.5 rounded-full ring-2 ${getColorDotStyles(category.name)} inline-block flex-shrink-0`} /> {category.name}
                              </span>
                              <input
                                type="number"
                                min="0"
                                max="5"
                                value={(newTournament.lineup_category_requirements as any)?.[category.id] || 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setNewTournament({
                                    ...newTournament,
                                    lineup_category_requirements: {
                                      ...newTournament.lineup_category_requirements,
                                      [category.id]: val
                                    }
                                  });
                                }}
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm"
                                placeholder="0"
                              />
                              <span className="text-xs text-gray-500 mt-1">Min players in starting XI</span>
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Submit Button */}
                  <div className="flex flex-col-reverse sm:flex-row justify-end gap-3 pt-4">
                    <button
                      type="button"
                      onClick={() => setShowCreateForm(false)}
                      className="w-full sm:w-auto px-6 py-2.5 sm:py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-all font-medium text-xs sm:text-sm text-center"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isCreatingTournament}
                      className="w-full sm:w-auto px-6 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:shadow-lg transition-all font-medium text-xs sm:text-sm disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
                    >
                      {isCreatingTournament ? (
                        <>
                          <RefreshCw className="animate-spin h-4 w-4 sm:h-5 sm:w-5 mr-1 sm:mr-2" />
                          Creating...
                        </>
                      ) : (
                        <>
                          <Plus className="w-4 h-4 sm:w-5 sm:h-5 mr-1 sm:mr-2" />
                          Create Tournament
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </div>

            {/* Edit Tournament Form */}
            {editingTournament && (
              <div className="console-card bg-white border border-blue-300 rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 shadow-sm mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4 sm:mb-6">
                  <h2 className="text-lg sm:text-xl font-bold text-gray-900 break-words">
                    Edit Tournament: {editingTournament.tournament_name}
                  </h2>
                  <button
                    onClick={() => setEditingTournament(null)}
                    className="w-full sm:w-auto px-4 py-2 bg-gray-600 text-white rounded-xl hover:bg-gray-700 transition-all text-xs sm:text-sm font-medium text-center"
                  >
                    Cancel
                  </button>
                </div>

                <form onSubmit={async (e) => {
                  e.preventDefault();
                  try {
                    // Compute is_pure_knockout before submission
                    const isPureKnockout = editingTournament.has_knockout_stage && !editingTournament.has_league_stage && !editingTournament.has_group_stage;

                    // Update tournament basic info
                    const tournamentRes = await fetchWithTokenRefresh(`/api/tournaments/${editingTournament.id}`, {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        tournament_type: editingTournament.tournament_type,
                        tournament_name: editingTournament.tournament_name,
                        tournament_code: editingTournament.tournament_code,
                        status: editingTournament.status,
                        start_date: editingTournament.start_date,
                        end_date: editingTournament.end_date,
                        description: editingTournament.description,
                        is_primary: editingTournament.is_primary,
                        include_in_fantasy: editingTournament.include_in_fantasy,
                        include_in_awards: editingTournament.include_in_awards,
                        has_league_stage: editingTournament.has_league_stage ?? true,
                        has_group_stage: editingTournament.has_group_stage,
                        group_assignment_mode: editingTournament.group_assignment_mode || 'auto',
                        number_of_groups: editingTournament.number_of_groups,
                        teams_per_group: editingTournament.teams_per_group,
                        teams_advancing_per_group: editingTournament.teams_advancing_per_group,
                        has_knockout_stage: editingTournament.has_knockout_stage,
                        playoff_teams: editingTournament.playoff_teams,
                        direct_semifinal_teams: editingTournament.direct_semifinal_teams,
                        qualification_threshold: editingTournament.qualification_threshold,
                        is_pure_knockout: isPureKnockout,
                      })
                    });

                    // Update tournament settings (squad_size, etc.)
                    const settingsRes = await fetchWithTokenRefresh('/api/tournament-settings', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        tournament_id: editingTournament.id,
                        squad_size: editingTournament.squad_size || 11,
                        tournament_system: editingTournament.tournament_system || 'match_round',
                        scoring_type: editingTournament.scoring_type || 'goals',
                        home_deadline_time: editingTournament.home_deadline_time || '17:00',
                        away_deadline_time: editingTournament.away_deadline_time || '17:00',
                        result_day_offset: editingTournament.result_day_offset || 2,
                        result_deadline_time: editingTournament.result_deadline_time || '00:30',
                        has_knockout_stage: editingTournament.has_knockout_stage || false,
                        playoff_teams: editingTournament.playoff_teams,
                        direct_semifinal_teams: editingTournament.direct_semifinal_teams,
                        qualification_threshold: editingTournament.qualification_threshold,
                        enable_category_requirements: editingTournament.enable_category_requirements ?? false,
                        lineup_category_requirements: editingTournament.lineup_category_requirements || {},
                      })
                    });

                    const tournamentData = await tournamentRes.json();
                    const settingsData = await settingsRes.json();

                    if (tournamentData.success && settingsData.success) {
                      showAlert({
                        type: 'success',
                        title: 'Tournament Updated',
                        message: 'Tournament and settings updated successfully!'
                      });
                      setEditingTournament(null);
                      await loadTournaments(activeSeasonId!);
                    } else {
                      showAlert({
                        type: 'error',
                        title: 'Update Failed',
                        message: tournamentData.error || settingsData.error || 'Failed to update tournament'
                      });
                    }
                  } catch (error: any) {
                    showAlert({
                      type: 'error',
                      title: 'Error',
                      message: 'Failed to update tournament: ' + error.message
                    });
                  }
                }} className="space-y-5 sm:space-y-6">
                  {/* Basic Info */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                        Tournament Type
                      </label>
                      <select
                        value={editingTournament.tournament_type}
                        onChange={(e) => setEditingTournament({ ...editingTournament, tournament_type: e.target.value })}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                        required
                      >
                        <option value="league">⚽ League</option>
                        <option value="cup">🏆 Cup</option>
                        <option value="ucl">✨ Champions League</option>
                        <option value="uel">⭐ Europa League</option>
                        <option value="super_cup">🏅 Super Cup</option>
                        <option value="league_cup">🏆 League Cup</option>
                        <option value="triple_threat">⚡ SS Triple Threat</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                        Status
                      </label>
                      <select
                        value={editingTournament.status}
                        onChange={(e) => setEditingTournament({ ...editingTournament, status: e.target.value })}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                        required
                      >
                        <option value="upcoming">Upcoming</option>
                        <option value="active">Active</option>
                        <option value="completed">Completed</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                        <Activity className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Scoring Type
                        <span className="text-xs text-gray-500 ml-2">(How team wins are calculated)</span>
                      </label>
                      <select
                        value={editingTournament.scoring_type || 'goals'}
                        onChange={(e) => setEditingTournament({ ...editingTournament, scoring_type: e.target.value })}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                      >
                        <option value="goals">Goal-Based (Total Goals)</option>
                        <option value="wins">Win-Based (Matchup Wins)</option>
                        <option value="hybrid">Hybrid (Wins + Goals Tiebreaker)</option>
                      </select>
                      <p className="text-xs text-gray-500 mt-1">
                        {editingTournament.scoring_type === 'wins' ? (
                          <>
                            <strong>Win-Based:</strong> Team with most matchup wins wins the fixture.
                            Example: Team A wins 3 matchups, Team B wins 2 &rarr; Team A wins
                          </>
                        ) : editingTournament.scoring_type === 'hybrid' ? (
                          <>
                            <strong>Hybrid:</strong> Matchup wins decide; total goals break ties.
                            Example: Both win 2 matchups &rarr; Team with more goals wins
                          </>
                        ) : (
                          <>
                            <strong>Goal-Based (Default):</strong> Team with most total goals wins.
                            Example: Team A: 6 goals, Team B: 7 goals &rarr; Team B wins
                          </>
                        )}
                      </p>
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                        Tournament Name
                      </label>
                      <input
                        type="text"
                        value={editingTournament.tournament_name}
                        onChange={(e) => setEditingTournament({ ...editingTournament, tournament_name: e.target.value })}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                        Tournament Code
                      </label>
                      <input
                        type="text"
                        value={editingTournament.tournament_code}
                        onChange={(e) => setEditingTournament({ ...editingTournament, tournament_code: e.target.value })}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={editingTournament.start_date}
                        onChange={(e) => setEditingTournament({ ...editingTournament, start_date: e.target.value })}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={editingTournament.end_date}
                        onChange={(e) => setEditingTournament({ ...editingTournament, end_date: e.target.value })}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                        <Users className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Squad Size (Players per Match)
                      </label>
                      <input
                        type="number"
                        value={editingTournament.squad_size || 11}
                        onChange={(e) => {
                          const val = parseInt(e.target.value);
                          if (!isNaN(val) && val >= 1 && val <= 18) {
                            setEditingTournament({ ...editingTournament, squad_size: val });
                          } else if (e.target.value === '') {
                            setEditingTournament({ ...editingTournament, squad_size: '' as any });
                          }
                        }}
                        onBlur={(e) => {
                          if (e.target.value === '' || parseInt(e.target.value) < 1) {
                            setEditingTournament({ ...editingTournament, squad_size: 11 });
                          }
                        }}
                        className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                        placeholder="11"
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">Number of players each team can field (1-18)</p>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                      Description
                    </label>
                    <textarea
                      value={editingTournament.description}
                      onChange={(e) => setEditingTournament({ ...editingTournament, description: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                      placeholder="Optional description..."
                    />
                  </div>

                  {/* Format Settings */}
                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-lg font-semibold text-gray-800 mb-4">Tournament Format</h3>

                    <div className="space-y-4">
                      <label className="flex items-start p-4 bg-white/50 rounded-xl border border-gray-200 cursor-pointer hover:border-blue-300 transition-all">
                        <input
                          type="checkbox"
                          checked={editingTournament.has_league_stage ?? true}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setEditingTournament({
                              ...editingTournament,
                              has_league_stage: checked,
                              // Uncheck group if league is checked
                              has_group_stage: checked ? false : editingTournament.has_group_stage
                            });
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-1 mr-3"
                        />
                        <div className="flex-1">
                          <span className="font-medium text-gray-900"><Activity className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Include League Stage</span>
                          <p className="text-xs text-gray-500 mt-1">Round-robin format where all teams play each other</p>
                        </div>
                      </label>

                      <label className="flex items-start p-4 bg-white/50 rounded-xl border border-gray-200 cursor-pointer hover:border-blue-300 transition-all">
                        <input
                          type="checkbox"
                          checked={editingTournament.has_group_stage}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setEditingTournament({
                              ...editingTournament,
                              has_group_stage: checked,
                              // Uncheck league if group is checked
                              has_league_stage: checked ? false : editingTournament.has_league_stage
                            });
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-1 mr-3"
                        />
                        <div className="flex-1">
                          <span className="font-medium text-gray-900"><Trophy className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Include Group Stage</span>
                          <p className="text-xs text-gray-500 mt-1">Divide teams into groups (e.g., Group A, B, C, D)</p>
                        </div>
                      </label>

                      <label className="flex items-start p-4 bg-white/50 rounded-xl border border-gray-200 cursor-pointer hover:border-blue-300 transition-all">
                        <input
                          type="checkbox"
                          checked={editingTournament.has_knockout_stage}
                          onChange={(e) => setEditingTournament({ ...editingTournament, has_knockout_stage: e.target.checked })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-1 mr-3"
                        />
                        <div className="flex-1">
                          <span className="font-medium text-gray-900"><Trophy className="w-4 h-4 inline-block text-amber-500 fill-amber-500 mr-1 align-text-bottom" /> Include Knockout Stage</span>
                          <p className="text-xs text-gray-500 mt-1">Add playoff bracket (quarters, semis, final)</p>
                        </div>
                      </label>

                      {/* Group Stage Configuration */}
                      {editingTournament.has_group_stage && (
                        <div className="ml-0 sm:ml-6 lg:ml-8 mt-3 p-3.5 sm:p-5 bg-blue-50/50 rounded-xl border border-blue-200 space-y-3 sm:space-y-4">
                          <h4 className="font-semibold text-gray-900 text-sm">Group Stage Settings</h4>

                          {/* Group Assignment Mode */}
                          <div>
                            <label className="block text-xs font-medium text-gray-700 mb-1">Group Assignment Mode</label>
                            <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-4">
                              <label className="flex items-center cursor-pointer">
                                <input
                                  type="radio"
                                  value="auto"
                                  checked={(editingTournament.group_assignment_mode || 'auto') === 'auto'}
                                  onChange={(e) => setEditingTournament({ ...editingTournament, group_assignment_mode: e.target.value })}
                                  className="mr-2"
                                />
                                <span className="text-sm"><Bot className="w-4 h-4 text-slate-500" /> Automatic (evenly distributed)</span>
                              </label>
                              <label className="flex items-center cursor-pointer">
                                <input
                                  type="radio"
                                  value="manual"
                                  checked={(editingTournament.group_assignment_mode || 'auto') === 'manual'}
                                  onChange={(e) => setEditingTournament({ ...editingTournament, group_assignment_mode: e.target.value })}
                                  className="mr-2"
                                />
                                <span className="text-sm">✋ Manual (assign teams to groups)</span>
                              </label>
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Number of Groups</label>
                              <input
                                type="number"
                                min="1"
                                max="8"
                                value={editingTournament.number_of_groups || 4}
                                onChange={(e) => setEditingTournament({ ...editingTournament, number_of_groups: parseInt(e.target.value) || 4 })}
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Teams per Group</label>
                              <input
                                type="number"
                                min="2"
                                max="8"
                                value={editingTournament.teams_per_group || 4}
                                onChange={(e) => setEditingTournament({ ...editingTournament, teams_per_group: parseInt(e.target.value) || 4 })}
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Teams Advancing</label>
                              <input
                                type="number"
                                min="1"
                                max="4"
                                value={editingTournament.teams_advancing_per_group || 2}
                                onChange={(e) => setEditingTournament({ ...editingTournament, teams_advancing_per_group: parseInt(e.target.value) || 2 })}
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
                              />
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Knockout Stage Configuration */}
                      {editingTournament.has_knockout_stage && (
                        <div className="ml-0 sm:ml-6 lg:ml-8 mt-3 p-3.5 sm:p-5 bg-purple-50/50 rounded-xl border border-purple-200 space-y-3 sm:space-y-4">
                          <h4 className="font-semibold text-gray-900 text-sm">Knockout Stage Settings</h4>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Playoff Teams</label>
                              <input
                                type="number"
                                min="2"
                                max="16"
                                value={editingTournament.playoff_teams || 4}
                                onChange={(e) => setEditingTournament({ ...editingTournament, playoff_teams: parseInt(e.target.value) || 4 })}
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
                              />
                              <p className="text-xs text-gray-500 mt-1">Total teams in knockout</p>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Direct Semifinal</label>
                              <input
                                type="number"
                                min="0"
                                max="4"
                                value={editingTournament.direct_semifinal_teams || 2}
                                onChange={(e) => setEditingTournament({ ...editingTournament, direct_semifinal_teams: parseInt(e.target.value) || 2 })}
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
                              />
                              <p className="text-xs text-gray-500 mt-1">Top teams skip quarters</p>
                            </div>
                            <div>
                              <label className="block text-xs font-medium text-gray-700 mb-1">Qualification %</label>
                              <input
                                type="number"
                                min="0"
                                max="100"
                                value={editingTournament.qualification_threshold || 75}
                                onChange={(e) => setEditingTournament({ ...editingTournament, qualification_threshold: parseInt(e.target.value) || 75 })}
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm"
                              />
                              <p className="text-xs text-gray-500 mt-1">Min % points to qualify</p>
                            </div>
                          </div>
                        </div>
                      )}

                      <label className="flex items-start p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border-2 border-blue-300 cursor-pointer hover:border-blue-500 transition-all shadow-sm">
                        <input
                          type="checkbox"
                          checked={editingTournament.is_primary}
                          onChange={(e) => setEditingTournament({ ...editingTournament, is_primary: e.target.checked })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mt-1 mr-3"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900"><Star className="w-4 h-4 inline-block text-amber-400 fill-amber-400 mr-1 align-text-bottom" /> Set as Primary Tournament</span>
                            <span className="text-xs bg-blue-600 text-white px-2 py-0.5 rounded-full font-semibold">IMPORTANT</span>
                          </div>
                          <p className="text-sm text-gray-700 mt-2 font-medium">Primary tournament is the main league competition for this season:</p>
                          <ul className="text-xs text-gray-600 mt-1 ml-4 list-disc space-y-1">
                            <li>Automatically generates news on season lifecycle events (creation, activation, completion)</li>
                            <li>Shown as the main tournament on dashboard and public pages</li>
                            <li>Only ONE tournament should be marked as primary per season</li>
                          </ul>
                        </div>
                      </label>

                      <label className="flex items-start p-4 bg-gradient-to-r from-green-50 to-emerald-50 rounded-xl border-2 border-green-200 cursor-pointer hover:border-green-400 transition-all shadow-sm">
                        <input
                          type="checkbox"
                          checked={editingTournament.include_in_fantasy}
                          onChange={(e) => setEditingTournament({ ...editingTournament, include_in_fantasy: e.target.checked })}
                          className="rounded border-gray-300 text-green-600 focus:ring-green-500 mt-1 mr-3"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900">⚡ Include in Fantasy League</span>
                            <span className="text-xs bg-green-600 text-white px-2 py-0.5 rounded-full font-semibold">IMPORTANT</span>
                          </div>
                          <p className="text-sm text-gray-700 mt-2 font-medium">Player stats from this tournament will count towards fantasy league:</p>
                          <ul className="text-xs text-gray-600 mt-1 ml-4 list-disc space-y-1">
                            <li>Fantasy league points and rankings</li>
                            <li>Fantasy team scoring calculations</li>
                          </ul>
                        </div>
                      </label>

                      <label className="flex items-start p-4 bg-gradient-to-r from-amber-50 to-yellow-50 rounded-xl border-2 border-amber-200 cursor-pointer hover:border-amber-400 transition-all shadow-sm">
                        <input
                          type="checkbox"
                          checked={editingTournament.include_in_awards}
                          onChange={(e) => setEditingTournament({ ...editingTournament, include_in_awards: e.target.checked })}
                          className="rounded border-gray-300 text-amber-600 focus:ring-amber-500 mt-1 mr-3"
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-gray-900"><Trophy className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Include in Player Awards</span>
                            <span className="text-xs bg-amber-600 text-white px-2 py-0.5 rounded-full font-semibold">IMPORTANT</span>
                          </div>
                          <p className="text-sm text-gray-700 mt-2 font-medium">Player stats from this tournament will count towards end-of-season awards:</p>
                          <ul className="text-xs text-gray-600 mt-1 ml-4 list-disc space-y-1">
                            <li>Golden Boot (Top Goal Scorer)</li>
                            <li>Golden Glove (Most Clean Sheets)</li>
                            <li>Golden Ball (Most Points)</li>
                            <li>Category-specific awards (Legend/Classic)</li>
                          </ul>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Lineup Category Requirements */}
                  <div className="border-t border-gray-200 pt-6">
                    <h3 className="text-base sm:text-lg font-semibold text-gray-800 mb-1">Lineup Category Requirements</h3>
                    <p className="text-xs sm:text-sm text-gray-600 mb-4">Set the minimum number of players required from each category in the starting 11</p>

                    {categories.length === 0 ? (
                      <div className="text-center py-8 bg-gray-50 rounded-xl">
                        <p className="text-gray-500 text-sm">No categories available</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
                        {categories.map((category) => (
                          <div key={category.id} className="p-3.5 sm:p-4 bg-white/50 rounded-xl border border-gray-200">
                            <label className="flex flex-col">
                              <span className="font-medium text-gray-900 mb-2 flex items-center gap-1.5 text-xs sm:text-sm">
                                <span className={`w-2.5 h-2.5 rounded-full ring-2 ${getColorDotStyles(category.name)} inline-block flex-shrink-0`} /> {category.name}
                              </span>
                              <input
                                type="number"
                                min="0"
                                max="5"
                                value={editingTournament.lineup_category_requirements?.[category.id] || 0}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setEditingTournament({
                                    ...editingTournament,
                                    lineup_category_requirements: {
                                      ...editingTournament.lineup_category_requirements,
                                      [category.id]: val
                                    }
                                  });
                                }}
                                className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 text-sm"
                                placeholder="0"
                              />
                              <span className="text-xs text-gray-500 mt-1">Min players in starting XI</span>
                            </label>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col-reverse sm:flex-row gap-3 pt-4">
                    <button
                      type="submit"
                      className="w-full sm:w-auto px-6 py-2.5 sm:py-3 bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-xl hover:shadow-lg transition-all font-medium text-xs sm:text-sm text-center"
                    >
                      Save Changes
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditingTournament(null)}
                      className="w-full sm:w-auto px-6 py-2.5 sm:py-3 bg-gray-200 text-gray-700 rounded-xl hover:bg-gray-300 transition-all font-medium text-xs sm:text-sm text-center"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Existing Tournaments */}
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl sm:rounded-3xl p-4 sm:p-6 lg:p-8 shadow-sm">
              <h2 className="text-lg sm:text-xl font-bold text-gray-900 mb-4 sm:mb-6">
                Existing Tournaments ({tournaments.length})
              </h2>

              {tournaments.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <Trophy className="w-16 h-16 mx-auto text-slate-300 mb-4" />
                  <p className="font-medium mb-2">No tournaments found</p>
                  <p className="text-sm">Create a tournament above to get started</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {tournaments.map((tournament) => (
                    <div key={tournament.id} className="p-4 sm:p-5 bg-white/70 rounded-2xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all">
                      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 mb-2">
                            <h3 className="text-base sm:text-lg font-bold text-gray-900 break-words">{tournament.tournament_name}</h3>
                            {tournament.is_primary && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium shrink-0">
                                Primary
                              </span>
                            )}
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${tournament.status === 'active' ? 'bg-green-100 text-green-700' :
                              tournament.status === 'upcoming' ? 'bg-yellow-100 text-yellow-700' :
                                tournament.status === 'completed' ? 'bg-gray-100 text-gray-700' :
                                  'bg-red-100 text-red-700'
                              }`}>
                              {tournament.status}
                            </span>
                          </div>

                          <p className="text-xs sm:text-sm text-gray-600 mb-2 font-mono">
                            <span className="font-medium text-slate-800">Code:</span> {tournament.tournament_code} •{' '}
                            <span className="font-medium text-slate-800">Type:</span> {tournament.tournament_type}
                          </p>

                          {tournament.description && (
                            <p className="text-xs text-gray-500 mb-2 leading-relaxed">{tournament.description}</p>
                          )}

                          <div className="flex flex-wrap gap-1.5 sm:gap-2 text-xs">
                            {tournament.has_knockout_stage && (
                              <span className="bg-purple-50 text-purple-700 px-2 py-1 rounded-md font-medium">
                                <Swords className="w-4 h-4 text-rose-500 inline-block mr-1 align-text-bottom" /> Knockout
                              </span>
                            )}
                            {tournament.has_group_stage && (
                              <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-md font-medium">
                                <Users className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Groups: {tournament.number_of_groups}
                              </span>
                            )}
                            {tournament.include_in_fantasy && (
                              <span className="bg-green-50 text-green-700 px-2 py-1 rounded-md font-medium">
                                ⚡ Fantasy
                              </span>
                            )}
                            {tournament.include_in_awards && (
                              <span className="bg-amber-50 text-amber-700 px-2 py-1 rounded-md font-medium">
                                <Trophy className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Awards
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 pt-3 border-t border-slate-100 lg:border-t-0 lg:pt-0 lg:ml-4 shrink-0">
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetchWithTokenRefresh(`/api/tournaments/${tournament.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    include_in_fantasy: !tournament.include_in_fantasy
                                  })
                                });
                                const data = await res.json();
                                if (data.success) {
                                  await loadTournaments(activeSeasonId!);
                                  showAlert({
                                    type: 'success',
                                    title: 'Updated',
                                    message: `Fantasy league ${tournament.include_in_fantasy ? 'disabled' : 'enabled'} for this tournament`
                                  });
                                }
                              } catch (error: any) {
                                showAlert({
                                  type: 'error',
                                  title: 'Error',
                                  message: 'Failed to update tournament'
                                });
                              }
                            }}
                            className={`w-full sm:w-auto px-3 py-2 rounded-lg transition-colors text-xs font-medium text-center inline-flex items-center justify-center gap-1 ${tournament.include_in_fantasy
                              ? 'bg-green-600 text-white hover:bg-green-700'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              }`}
                            title={tournament.include_in_fantasy ? 'Fantasy Enabled - Click to disable' : 'Fantasy Disabled - Click to enable'}
                          >
                            {tournament.include_in_fantasy ? '⚡ Fantasy' : '⚡ Off'}
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetchWithTokenRefresh(`/api/tournaments/${tournament.id}`, {
                                  method: 'PATCH',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({
                                    include_in_awards: !tournament.include_in_awards
                                  })
                                });
                                const data = await res.json();
                                if (data.success) {
                                  await loadTournaments(activeSeasonId!);
                                  showAlert({
                                    type: 'success',
                                    title: 'Updated',
                                    message: `Awards ${tournament.include_in_awards ? 'disabled' : 'enabled'} for this tournament`
                                  });
                                }
                              } catch (error: any) {
                                showAlert({
                                  type: 'error',
                                  title: 'Error',
                                  message: 'Failed to update tournament'
                                });
                              }
                            }}
                            className={`w-full sm:w-auto px-3 py-2 rounded-lg transition-colors text-xs font-medium text-center inline-flex items-center justify-center gap-1 ${tournament.include_in_awards
                              ? 'bg-amber-600 text-white hover:bg-amber-700'
                              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                              }`}
                            title={tournament.include_in_awards ? 'Awards Enabled - Click to disable' : 'Awards Disabled - Click to enable'}
                          >
                            {tournament.include_in_awards ? (
                              <>
                                <Trophy className="w-3.5 h-3.5 inline-block text-amber-200" /> Awards
                              </>
                            ) : (
                              <>
                                <Trophy className="w-3.5 h-3.5 inline-block text-gray-400" /> Off
                              </>
                            )}
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                // Fetch tournament settings
                                const settingsRes = await fetchWithTokenRefresh(`/api/tournament-settings?tournament_id=${tournament.id}`);
                                const settingsData = await settingsRes.json();

                                // Merge tournament data with settings
                                setEditingTournament({
                                  ...tournament,
                                  squad_size: settingsData.settings?.squad_size || tournament.squad_size || 11,
                                  tournament_system: settingsData.settings?.tournament_system || tournament.tournament_system || 'match_round',
                                  scoring_type: settingsData.settings?.scoring_type || 'goals',
                                  home_deadline_time: settingsData.settings?.home_deadline_time || tournament.home_deadline_time || '17:00',
                                  away_deadline_time: settingsData.settings?.away_deadline_time || tournament.away_deadline_time || '17:00',
                                  result_day_offset: settingsData.settings?.result_day_offset ?? tournament.result_day_offset ?? 2,
                                  result_deadline_time: settingsData.settings?.result_deadline_time || tournament.result_deadline_time || '00:30',
                                  has_knockout_stage: settingsData.settings?.has_knockout_stage ?? tournament.has_knockout_stage ?? false,
                                  playoff_teams: settingsData.settings?.playoff_teams ?? tournament.playoff_teams ?? null,
                                  direct_semifinal_teams: settingsData.settings?.direct_semifinal_teams ?? tournament.direct_semifinal_teams ?? null,
                                  qualification_threshold: settingsData.settings?.qualification_threshold ?? tournament.qualification_threshold ?? null,
                                  lineup_category_requirements: settingsData.settings?.lineup_category_requirements || {},
                                });
                              } catch (error: any) {
                                console.error('Error fetching tournament settings:', error);
                                setEditingTournament({
                                  ...tournament,
                                  squad_size: tournament.squad_size || 11,
                                  lineup_category_requirements: {},
                                });
                              }
                            }}
                            className="w-full sm:w-auto px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs font-medium text-center inline-flex items-center justify-center gap-1"
                          >
                            <Pencil className="w-3.5 h-3.5 text-blue-100" /> Edit
                          </button>
                          <button
                            onClick={() => handleDeleteTournament(tournament.id, tournament.tournament_name)}
                            className="w-full sm:w-auto px-3 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-xs font-medium text-center inline-flex items-center justify-center gap-1"
                          >
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

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

export default function TournamentDashboardPage() {
  return (

    <Suspense
      fallback={
        <div className="console-bg min-h-screen flex items-center justify-center relative font-mono text-slate-800">
          <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
          <div className="text-center relative z-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
            <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold animate-pulse">Loading tournament console...</p>
          </div>
        </div>
      }
    >
      <TournamentDashboardPageContent />
    </Suspense>

  );
}
