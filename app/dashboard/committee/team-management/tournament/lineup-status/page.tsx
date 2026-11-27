'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import {
  ArrowLeft,
  Settings,
  Plus,
  Trash2,
  Trophy,
  Calendar,
  Users,
  Activity,
  CheckCircle,
  AlertTriangle,
  Info,
  Clock,
  Layers,
  Search,
  Sparkles,
  Award,
  ChevronRight,
  Shield,
  Eye,
  FileText,
  Play,
  Share2,
  HelpCircle,
  X,
  ChevronLeft,
  Download,
  Shuffle,
  Check,
  RefreshCw,
  Pencil
} from 'lucide-react';
import AuthGuard from '@/components/auth/AuthGuard';
import TripleThreatLineupSubmission from '@/components/TripleThreatLineupSubmission';

interface FixtureLineupStatus {
  fixture_id: string;
  season_id?: string;
  round_number: number;
  match_number: number;
  home_team_id: string;
  home_team_name: string;
  away_team_id: string;
  away_team_name: string;
  home_lineup_submitted: boolean;
  away_lineup_submitted: boolean;
  home_lineup_count: number;
  away_lineup_count: number;
  home_total_players: number;
  away_total_players: number;
  status: string;
  leg: string;
}

interface TournamentInfo {
  id: string;
  tournament_name: string;
  season_id: string;
  tournament_type?: string;
}

export default function LineupStatusPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [fixtures, setFixtures] = useState<FixtureLineupStatus[]>([]);
  const [tournaments, setTournaments] = useState<TournamentInfo[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<string>('');
  const [isTripleThreat, setIsTripleThreat] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingTournaments, setIsLoadingTournaments] = useState(true);
  const [error, setError] = useState('');

  // Lineup setting modal state (standard tournaments)
  const [showLineupModal, setShowLineupModal] = useState(false);
  // Triple Threat lineup modal state
  const [showTTLineupModal, setShowTTLineupModal] = useState(false);
  const [ttExistingLineup, setTtExistingLineup] = useState<any>(null);
  const [ttOpponentLineup, setTtOpponentLineup] = useState<any>(null);
  const [isLoadingTTLineup, setIsLoadingTTLineup] = useState(false);
  const [selectedFixture, setSelectedFixture] = useState<FixtureLineupStatus | null>(null);
  const [selectedTeamType, setSelectedTeamType] = useState<'home' | 'away'>('home');
  const [availablePlayers, setAvailablePlayers] = useState<any[]>([]);
  const [selectedPlayers, setSelectedPlayers] = useState<Array<{
    player_id: string;
    player_name: string;
    position: number;
    is_substitute: boolean;
  }>>([]);
  const [isLoadingPlayers, setIsLoadingPlayers] = useState(false);
  const [isSavingLineup, setIsSavingLineup] = useState(false);

  // View lineup modal state
  const [showViewLineupModal, setShowViewLineupModal] = useState(false);
  const [viewLineupData, setViewLineupData] = useState<any>(null);
  const [isLoadingViewLineup, setIsLoadingViewLineup] = useState(false);

  useEffect(() => {
    const fetchTournaments = async () => {
      if (!user) return;

      setIsLoadingTournaments(true);
      try {
        const response = await fetchWithTokenRefresh('/api/tournaments');
        if (response.ok) {
          const data = await response.json();
          console.log('Tournaments fetched:', data);
          console.log('Tournaments array:', data.tournaments);
          console.log('Tournaments count:', data.tournaments?.length || 0);
          setTournaments(data.tournaments || []);
          if (data.tournaments && data.tournaments.length > 0) {
            console.log('Setting selected tournament to:', data.tournaments[0].id);
            setSelectedTournament(data.tournaments[0].id);
          } else {
            console.warn('No tournaments found in response');
          }
        } else {
          console.error('Failed to fetch tournaments:', response.status, response.statusText);
          const errorData = await response.json().catch(() => ({}));
          console.error('Error details:', errorData);
          setError('Failed to load tournaments');
        }
      } catch (err: any) {
        console.error('Error fetching tournaments:', err);
        setError('Failed to load tournaments');
      } finally {
        setIsLoadingTournaments(false);
      }
    };

    fetchTournaments();
  }, [user]);

  const refreshLineupStatus = async (tournamentId: string) => {
    if (!tournamentId) return;
    const response = await fetchWithTokenRefresh(
      `/api/tournaments/${tournamentId}/lineup-status`
    );

    if (response.ok) {
      const data = await response.json();
      console.log('Fixtures loaded:', data.fixtures?.length || 0);
      setFixtures(data.fixtures || []);
      setIsTripleThreat(Boolean(data.is_triple_threat));
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.error('Failed to load lineup status:', response.status, errorData);
      setError('Failed to load lineup status');
    }
  };

  // Fetch lineup status
  useEffect(() => {
    const fetchLineupStatus = async () => {
      if (!selectedTournament) {
        console.log('No tournament selected yet, skipping fixture fetch');
        return;
      }

      const selectedTourObj = tournaments.find(t => t.id === selectedTournament);
      setIsTripleThreat(
        selectedTourObj?.tournament_type === 'triple_threat' ||
        selectedTournament.toLowerCase().includes('triple_threat')
      );

      console.log('Fetching lineup status for tournament:', selectedTournament);
      setIsLoading(true);
      setError('');

      try {
        await refreshLineupStatus(selectedTournament);
      } catch (err: any) {
        console.error('Error fetching lineup status:', err);
        setError('Failed to load lineup status');
      } finally {
        setIsLoading(false);
      }
    };

    fetchLineupStatus();
  }, [selectedTournament, tournaments]);

  // Open lineup modal
  const openLineupModal = async (fixture: FixtureLineupStatus, teamType: 'home' | 'away') => {
    setSelectedFixture(fixture);
    setSelectedTeamType(teamType);

    if (isTripleThreat) {
      setShowTTLineupModal(true);
      setTtExistingLineup(null);
      setTtOpponentLineup(null);
      setIsLoadingTTLineup(true);

      try {
        const targetTeamId = teamType === 'home' ? fixture.home_team_id : fixture.away_team_id;
        const oppTeamId = teamType === 'home' ? fixture.away_team_id : fixture.home_team_id;

        const requests: Promise<Response>[] = [
          fetchWithTokenRefresh(`/api/lineups?fixture_id=${fixture.fixture_id}&team_id=${targetTeamId}`),
        ];
        if (teamType === 'home') {
          requests.push(
            fetchWithTokenRefresh(`/api/lineups?fixture_id=${fixture.fixture_id}&team_id=${oppTeamId}`)
          );
        }

        const [teamRes, oppRes] = await Promise.all(requests);
        if (teamRes.ok) {
          const teamData = await teamRes.json();
          setTtExistingLineup(teamData.success ? teamData.lineups : null);
        }
        if (oppRes && oppRes.ok) {
          const oppData = await oppRes.json();
          setTtOpponentLineup(oppData.success ? oppData.lineups : null);
        }
      } catch (err) {
        console.error('Error fetching Triple Threat lineup:', err);
        setError('Failed to load Triple Threat lineup');
      } finally {
        setIsLoadingTTLineup(false);
      }
      return;
    }

    setShowLineupModal(true);
    setSelectedPlayers([]);

    // Fetch available players
    setIsLoadingPlayers(true);
    try {
      const response = await fetchWithTokenRefresh(
        `/api/fixtures/${fixture.fixture_id}/admin-set-lineup?team_type=${teamType}`
      );

      if (response.ok) {
        const data = await response.json();
        setAvailablePlayers(data.players || []);
      } else {
        setError('Failed to load players');
      }
    } catch (err: any) {
      console.error('Error fetching players:', err);
      setError('Failed to load players');
    } finally {
      setIsLoadingPlayers(false);
    }
  };

  // View lineup function
  const viewLineup = async (fixture: FixtureLineupStatus, teamType: 'home' | 'away') => {
    setSelectedFixture(fixture);
    setSelectedTeamType(teamType);
    setShowViewLineupModal(true);
    setViewLineupData(null);

    setIsLoadingViewLineup(true);
    try {
      const url = `/api/fixtures/${fixture.fixture_id}/lineup?team_type=${teamType}`;
      console.log('Fetching lineup from:', url);
      
      const response = await fetchWithTokenRefresh(url);

      console.log('Lineup response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Lineup data received:', data);
        setViewLineupData(data);
      } else {
        const errorData = await response.json().catch(() => ({}));
        console.error('Failed to load lineup:', response.status, errorData);
        setError('Failed to load lineup: ' + (errorData.error || 'Unknown error'));
      }
    } catch (err: any) {
      console.error('Error fetching lineup:', err);
      setError('Failed to load lineup');
    } finally {
      setIsLoadingViewLineup(false);
    }
  };

  // Copy lineup to clipboard in WhatsApp format
  const copyLineupToClipboard = () => {
    if (!viewLineupData || !selectedFixture) return;

    const teamName = selectedTeamType === 'home' 
      ? selectedFixture.home_team_name 
      : selectedFixture.away_team_name;

    if (viewLineupData.triple_threat_lineup) {
      const tt = viewLineupData.triple_threat_lineup;
      const formatNames = (items: any) =>
        (Array.isArray(items) ? items : [items])
          .filter(Boolean)
          .map((p: any) => p.player_name || p.name || String(p))
          .join(' & ');

      let message = `*${teamName} - Round ${selectedFixture.round_number} (Triple Threat)*\n\n`;
      message += `*Mode 1: Co-op (2v2)*\n${formatNames(tt.coop)}\n\n`;
      message += `*Mode 2: Duo (2 × 1v1)*\n1v1 #1: ${tt.duo?.[0]?.player_name || 'N/A'}\n1v1 #2: ${tt.duo?.[1]?.player_name || 'N/A'}\n\n`;
      message += `*Mode 3: Single (1v1)*\n${formatNames(tt.single)}\n`;

      navigator.clipboard.writeText(message);
      alert('Lineup copied to clipboard! You can now paste it in WhatsApp.');
      return;
    }

    const playing = viewLineupData.lineup?.filter((p: any) => !p.is_substitute) || [];
    const substitutes = viewLineupData.lineup?.filter((p: any) => p.is_substitute) || [];

    let message = `*${teamName} - Round ${selectedFixture.round_number}*\n\n`;
    message += `*Starting Lineup:*\n`;
    playing.forEach((player: any, index: number) => {
      message += `${index + 1}. ${player.player_name}\n`;
    });

    if (substitutes.length > 0) {
      message += `\n*Substitutes:*\n`;
      substitutes.forEach((player: any, index: number) => {
        message += `${index + 1}. ${player.player_name}\n`;
      });
    }

    navigator.clipboard.writeText(message);
    alert('Lineup copied to clipboard! You can now paste it in WhatsApp.');
  };

  // Toggle player selection
  const togglePlayerSelection = (player: any) => {
    const isSelected = selectedPlayers.some(p => p.player_id === player.player_id);

    if (isSelected) {
      // Remove player and update positions
      const updatedPlayers = selectedPlayers
        .filter(p => p.player_id !== player.player_id)
        .map((p, index) => ({
          ...p,
          position: index + 1,
          is_substitute: index >= 5, // First 5 are playing, rest are subs
        }));
      setSelectedPlayers(updatedPlayers);
    } else {
      if (selectedPlayers.length >= 7) {
        alert('You can only select up to 7 players');
        return;
      }

      // Add player with automatic substitute status based on position
      const newPosition = selectedPlayers.length + 1;
      setSelectedPlayers([...selectedPlayers, {
        player_id: player.player_id,
        player_name: player.player_name,
        position: newPosition,
        is_substitute: newPosition > 5, // Players 6 and 7 are automatically subs
      }]);
    }
  };

  // Save lineup
  const saveLineup = async () => {
    if (selectedPlayers.length < 5 || selectedPlayers.length > 7) {
      alert('Please select between 5 and 7 players');
      return;
    }

    const playingCount = selectedPlayers.filter(p => !p.is_substitute).length;
    if (playingCount !== 5) {
      alert('Please select exactly 5 playing players (the rest will be substitutes)');
      return;
    }

    setIsSavingLineup(true);
    try {
      const response = await fetchWithTokenRefresh(
        `/api/fixtures/${selectedFixture?.fixture_id}/admin-set-lineup`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            players: selectedPlayers,
            team_type: selectedTeamType,
          }),
        }
      );

      if (response.ok) {
        alert('Lineup saved successfully');
        setShowLineupModal(false);

        // Refresh lineup status
        const statusResponse = await fetchWithTokenRefresh(
          `/api/tournaments/${selectedTournament}/lineup-status`
        );
        if (statusResponse.ok) {
          const data = await statusResponse.json();
          setFixtures(data.fixtures || []);
        }
      } else {
        const data = await response.json();
        alert(data.error || 'Failed to save lineup');
      }
    } catch (err: any) {
      console.error('Error saving lineup:', err);
      alert('Failed to save lineup');
    } finally {
      setIsSavingLineup(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono mt-4">Loading...</p>
        </div>
      </div>
    );
  }

  const submittedCount = fixtures.filter(
    f => f.home_lineup_submitted && f.away_lineup_submitted
  ).length;
  const partialCount = fixtures.filter(
    f => (f.home_lineup_submitted && !f.away_lineup_submitted) ||
      (!f.home_lineup_submitted && f.away_lineup_submitted)
  ).length;
  const pendingCount = fixtures.filter(
    f => !f.home_lineup_submitted && !f.away_lineup_submitted
  ).length;

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Decorative glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Navigation & Selector */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex flex-wrap gap-3">
            <Link
              href="/dashboard/committee/team-management/tournament"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" /> Back to Tournaments
            </Link>
          </div>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <CheckCircle className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">SYSTEM CONTROL</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Lineup Submission Status
              </h1>
              <p className="text-xs text-slate-550 font-mono mt-1">
                Track and configure team lineup submissions for all matches
              </p>
            </div>
          </div>

          {/* Tournament Selector */}
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 border-t border-slate-100 pt-6">
            <label className="text-xs font-black uppercase text-slate-700 tracking-wider flex-shrink-0">Tournament:</label>
            {isLoadingTournaments ? (
              <div className="flex items-center gap-2 px-4 py-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-500"></div>
                <span className="text-xs text-slate-550 font-mono">Loading tournaments...</span>
              </div>
            ) : tournaments.length === 0 ? (
              <div className="px-4 py-2 text-xs text-red-600 bg-red-50 rounded-xl">
                No tournaments found. Please create a tournament first.
              </div>
            ) : (
              <select
                value={selectedTournament}
                onChange={(e) => setSelectedTournament(e.target.value)}
                className="px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all cursor-pointer"
              >
                {tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.tournament_name}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm text-center">
            <div className="text-2xl md:text-3xl font-black text-slate-900">{fixtures.length}</div>
            <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1">Total Fixtures</div>
          </div>
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm text-center">
            <div className="text-2xl md:text-3xl font-black text-emerald-650">{submittedCount}</div>
            <div className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider mt-1">Both Submitted</div>
          </div>
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm text-center">
            <div className="text-2xl md:text-3xl font-black text-amber-600">{partialCount}</div>
            <div className="text-[10px] text-amber-600 font-bold uppercase tracking-wider mt-1">Partial</div>
          </div>
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm text-center">
            <div className="text-2xl md:text-3xl font-black text-rose-600">{pendingCount}</div>
            <div className="text-[10px] text-rose-650 font-bold uppercase tracking-wider mt-1">Pending</div>
          </div>
        </div>

        {/* Fixtures List */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
              <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono mt-4">Loading fixtures...</p>
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-600">{error}</p>
            </div>
          ) : fixtures.length === 0 ? (
            <div className="text-center py-12">
              <svg className="w-16 h-16 mx-auto text-gray-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              <p className="text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono mt-4">No fixtures found for this tournament</p>
            </div>
          ) : (
            <div className="overflow-x-auto -mx-4 md:mx-0">
              <div className="inline-block min-w-full align-middle">
                <div className="overflow-hidden">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-slate-50/50">
                      <tr>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-550 uppercase tracking-wider">
                          Round
                        </th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-550 uppercase tracking-wider">
                          Home Team
                        </th>
                        <th className="px-6 py-4 text-center text-[10px] font-black text-slate-550 uppercase tracking-wider">
                          Home
                        </th>
                        <th className="px-6 py-4 text-left text-[10px] font-black text-slate-550 uppercase tracking-wider">
                          Away Team
                        </th>
                        <th className="px-6 py-4 text-center text-[10px] font-black text-slate-550 uppercase tracking-wider">
                          Away
                        </th>
                        <th className="px-6 py-4 text-center text-[10px] font-black text-slate-550 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-4 text-center text-[10px] font-black text-slate-550 uppercase tracking-wider">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {fixtures.map((fixture) => {
                        const bothSubmitted = fixture.home_lineup_submitted && fixture.away_lineup_submitted;
                        const noneSubmitted = !fixture.home_lineup_submitted && !fixture.away_lineup_submitted;

                        return (

                          <tr key={fixture.fixture_id} className="hover:bg-white/50 transition-colors">
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap">
                              <div className="text-sm font-medium text-gray-900">
                                R{fixture.round_number}
                              </div>
                              <div className="text-xs text-gray-500">{fixture.leg}</div>
                            </td>
                            <td className="px-3 md:px-6 py-4">
                              <div className="text-sm font-medium text-gray-900 max-w-[150px] md:max-w-none truncate">
                                {fixture.home_team_name}
                              </div>
                            </td>
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-center">
                              {fixture.home_lineup_submitted ? (
                                <div className="flex flex-col items-center">
                                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-100 font-bold text-xs">
                                    Yes {fixture.home_lineup_count}
                                  </span>
                                  <span className="text-xs text-gray-500 mt-1 hidden md:block">
                                    {fixture.home_lineup_count}
                                  </span>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-100 font-bold text-xs">
                                  No
                                </span>
                              )}
                            </td>
                            <td className="px-3 md:px-6 py-4">
                              <div className="text-sm font-medium text-gray-900 max-w-[150px] md:max-w-none truncate">
                                {fixture.away_team_name}
                              </div>
                            </td>
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-center">
                              {fixture.away_lineup_submitted ? (
                                <div className="flex flex-col items-center">
                                  <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-100 font-bold text-xs">
                                    Yes {isTripleThreat ? fixture.away_lineup_count : fixture.home_lineup_count}
                                  </span>
                                  <span className="text-xs text-gray-500 mt-1 hidden md:block">
                                    {fixture.away_lineup_count}
                                  </span>
                                </div>
                              ) : (
                                <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-rose-50 text-rose-800 border border-rose-100 font-bold text-xs">
                                  No
                                </span>
                              )}
                            </td>
                            <td className="px-3 md:px-6 py-4 whitespace-nowrap text-center">
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded font-black text-[10px] uppercase border ${
                                bothSubmitted
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                                  : noneSubmitted
                                  ? 'bg-rose-50 text-rose-800 border-rose-100'
                                  : 'bg-amber-50 text-amber-800 border-amber-100'
                              }`}>
                                {bothSubmitted ? 'Ready' : noneSubmitted ? 'Pending' : 'Partial'}
                              </span>
                            </td>
                            <td className="px-3 md:px-6 py-4 text-center">
                              <div className="flex gap-1 md:gap-2 justify-center flex-wrap">
                                {!fixture.home_lineup_submitted && (
                                  <button
                                    onClick={() => openLineupModal(fixture, 'home')}
                                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-mono font-bold text-xs uppercase tracking-wider cursor-pointer shadow-sm transition-all"
                                  >
                                    Set H
                                  </button>
                                )}
                                {fixture.home_lineup_submitted && (
                                  <>
                                    <button
                                      onClick={() => viewLineup(fixture, 'home')}
                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white rounded-xl font-mono font-bold text-xs uppercase tracking-wider cursor-pointer shadow-sm transition-all"
                                    >
                                      View H
                                    </button>
                                    {isTripleThreat && (
                                      <button
                                        onClick={() => openLineupModal(fixture, 'home')}
                                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-mono font-bold text-xs uppercase tracking-wider cursor-pointer shadow-sm transition-all"
                                      >
                                        Edit H
                                      </button>
                                    )}
                                  </>
                                )}
                                {!fixture.away_lineup_submitted && (
                                  <button
                                    onClick={() => openLineupModal(fixture, 'away')}
                                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-mono font-bold text-xs uppercase tracking-wider cursor-pointer shadow-sm transition-all"
                                  >
                                    Set A
                                  </button>
                                )}
                                {fixture.away_lineup_submitted && (
                                  <>
                                    <button
                                      onClick={() => viewLineup(fixture, 'away')}
                                      className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white rounded-xl font-mono font-bold text-xs uppercase tracking-wider cursor-pointer shadow-sm transition-all"
                                    >
                                      View A
                                    </button>
                                    {isTripleThreat && (
                                      <button
                                        onClick={() => openLineupModal(fixture, 'away')}
                                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-mono font-bold text-xs uppercase tracking-wider cursor-pointer shadow-sm transition-all"
                                      >
                                        Edit A
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            </td>
                          </tr>

  );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>

              </div>

      {/* Modals outside stacking context */}
      {/* Lineup Setting Modal */}
        {showLineupModal && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-[9999] p-3 sm:p-6 overflow-y-auto font-mono">
            <div className="console-card bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl p-5 sm:p-8 max-w-4xl w-full max-h-[calc(100vh-2rem)] sm:max-h-[90vh] my-auto overflow-y-auto shadow-2xl relative">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-sm font-black uppercase text-slate-900 tracking-wider">Set Lineup</h2>
                  <p className="text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono mt-4 mt-1">
                    {selectedTeamType === 'home' ? selectedFixture?.home_team_name : selectedFixture?.away_team_name}
                    {' - '}Round {selectedFixture?.round_number}
                  </p>
                </div>
                <button
                  onClick={() => setShowLineupModal(false)}
                  className="p-2 hover:bg-white/50 rounded-xl transition-colors"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              {isLoadingPlayers ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
                  <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono mt-4">Loading players...</p>
                </div>
              ) : (
                <>
                  {/* Selected Players */}
                  <div className="mb-6">
                    <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider mb-3">
                      Selected Players ({selectedPlayers.length}) - First 5 are playing, rest are subs
                    </h3>
                    {selectedPlayers.length > 0 ? (
                      <div className="space-y-2">
                        {selectedPlayers.map((player, index) => (
                          <div
                            key={player.player_id}
                            className="flex items-center justify-between p-3 bg-slate-50 border border-slate-100 rounded-xl"
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-sm font-medium text-gray-500 w-6">
                                {index + 1}.
                              </span>
                              <span className="font-medium">{player.player_name}</span>
                              {player.is_substitute && (
                                <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full font-medium">
                                  SUB
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => togglePlayerSelection(player)}
                              className="px-3 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-100 rounded-lg text-xs font-bold transition-all cursor-pointer"
                            >
                              Remove
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-gray-500 text-sm">No players selected yet</p>
                    )}
                  </div>

                  {/* Available Players */}
                  <div className="mb-6">
                    <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider mb-3">Available Players</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-64 overflow-y-auto">
                      {availablePlayers
                        .filter(p => !selectedPlayers.some(sp => sp.player_id === p.player_id))
                        .map((player) => (
                          <button
                            key={player.player_id}
                            onClick={() => togglePlayerSelection(player)}
                            className="p-3 bg-slate-50 border border-slate-200/60 rounded-xl text-left transition-all hover:bg-slate-100/75 text-xs font-bold"
                          >
                            <div className="font-medium">{player.player_name}</div>
                          </button>
                        ))}
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex gap-3 justify-end">
                    <button
                      onClick={() => setShowLineupModal(false)}
                      className="px-6 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-705 font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={saveLineup}
                      disabled={
                        isSavingLineup ||
                        selectedPlayers.length < 5 ||
                        selectedPlayers.length > 7 ||
                        selectedPlayers.filter(p => !p.is_substitute).length !== 5
                      }
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
                    >
                      {isSavingLineup ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Saving...
                        </>
                      ) : (
                        'Save Lineup'
                      )}
                    </button>
                  </div>

                  {/* Validation Messages */}
                  {selectedPlayers.length > 0 && (selectedPlayers.length < 5 || selectedPlayers.length > 7) && (
                    <div className="mt-4">
                      <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                        <AlertTriangle className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Please select between 5 and 7 players (first 5 will be playing, rest will be subs)
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}

      {/* View Lineup Modal */}
        {showViewLineupModal && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-[9999] p-3 sm:p-6 overflow-y-auto font-mono">
            <div className="console-card bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl p-5 sm:p-8 max-w-2xl w-full max-h-[calc(100vh-2rem)] sm:max-h-[90vh] my-auto overflow-y-auto shadow-2xl relative">
              <div className="flex items-start md:items-center justify-between mb-4 md:mb-6">
                <div className="flex-1 min-w-0 pr-2">
                  <h2 className="text-sm font-black uppercase text-slate-900 tracking-wider">View Lineup</h2>
                  <p className="text-sm md:text-base text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono mt-4 mt-1 truncate">
                    {selectedTeamType === 'home' ? selectedFixture?.home_team_name : selectedFixture?.away_team_name}
                    {' - '}Round {selectedFixture?.round_number}
                  </p>
                </div>
                <button
                  onClick={() => setShowViewLineupModal(false)}
                  className="p-2 hover:bg-white/50 rounded-xl transition-colors flex-shrink-0"
                >
                  <X className="w-5 h-5 text-slate-500" />
                </button>
              </div>

              {isLoadingViewLineup ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
                  <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono mt-4">Loading lineup...</p>
                </div>
              ) : viewLineupData ? (
                <>
                  {viewLineupData.triple_threat_lineup ? (
                    <div className="space-y-3 mb-5">
                      <div className="p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-2xl">
                        <div className="text-[11px] font-black uppercase tracking-wider text-indigo-800 mb-2">
                          Mode 1: Co-op (2v2)
                        </div>
                        <div className="space-y-1.5">
                          {(viewLineupData.triple_threat_lineup.coop || []).map((player: any, idx: number) => (
                            <div key={player.player_id || idx} className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-indigo-100 text-sm font-bold text-slate-900">
                              <span className="text-xs text-indigo-500 w-5">{idx + 1}.</span>
                              <span className="truncate">{player.player_name}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="p-3.5 bg-emerald-50/70 border border-emerald-200 rounded-2xl">
                        <div className="text-[11px] font-black uppercase tracking-wider text-emerald-800 mb-2">
                          Mode 2: Duo (2 × 1v1 Goal Based)
                        </div>
                        <div className="space-y-1.5">
                          {(viewLineupData.triple_threat_lineup.duo || []).map((player: any, idx: number) => (
                            <div key={player.player_id || idx} className="flex items-center justify-between gap-2.5 p-2 bg-white rounded-xl border border-emerald-100 text-sm font-bold text-slate-900">
                              <div className="flex items-center gap-2.5 min-w-0">
                                <span className="text-[10px] font-black uppercase px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 shrink-0">
                                  1v1 #{idx + 1}
                                </span>
                                <span className="truncate">{player.player_name}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-2xl">
                        <div className="text-[11px] font-black uppercase tracking-wider text-amber-800 mb-2">
                          Mode 3: Single (1v1)
                        </div>
                        <div className="space-y-1.5">
                          {(viewLineupData.triple_threat_lineup.single || []).map((player: any, idx: number) => (
                            <div key={player.player_id || idx} className="flex items-center gap-2.5 p-2 bg-white rounded-xl border border-amber-100 text-sm font-bold text-slate-900">
                              <span className="text-xs text-amber-600 w-5">1.</span>
                              <span className="truncate">{player.player_name}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                  {/* Starting Lineup */}
                  <div className="mb-4 md:mb-6">
                    <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider mb-3 flex items-center gap-2">
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                      <span className="text-sm md:text-base">Starting Lineup ({viewLineupData.lineup?.filter((p: any) => !p.is_substitute).length || 0})</span>
                    </h3>
                    {viewLineupData.lineup && viewLineupData.lineup.length > 0 ? (
                      <div className="space-y-2">
                        {viewLineupData.lineup
                          ?.filter((p: any) => !p.is_substitute)
                          .sort((a: any, b: any) => a.position - b.position)
                          .map((player: any, index: number) => (
                            <div
                              key={player.player_id}
                              className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-xl"
                            >
                              <span className="text-xs md:text-sm font-medium text-gray-500 w-5 md:w-6 flex-shrink-0">
                                {index + 1}.
                              </span>
                              <span className="text-sm md:text-base font-medium truncate">{player.player_name}</span>
                            </div>
                          ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No starting players found</p>
                    )}
                  </div>

                  {/* Substitutes */}
                  {viewLineupData.lineup?.filter((p: any) => p.is_substitute).length > 0 && (
                    <div className="mb-4 md:mb-6">
                      <h3 className="text-xs font-black uppercase text-slate-700 tracking-wider mb-3 flex items-center gap-2">
                        <span className="w-2 h-2 bg-yellow-500 rounded-full"></span>
                        <span className="text-sm md:text-base">Substitutes ({viewLineupData.lineup?.filter((p: any) => p.is_substitute).length || 0})</span>
                      </h3>
                      <div className="space-y-2">
                        {viewLineupData.lineup
                          ?.filter((p: any) => p.is_substitute)
                          .sort((a: any, b: any) => a.position - b.position)
                          .map((player: any, index: number) => (
                            <div
                              key={player.player_id}
                              className="flex items-center gap-3 p-3 bg-amber-50/40 border border-amber-100 rounded-xl"
                            >
                              <span className="text-xs md:text-sm font-medium text-gray-500 w-5 md:w-6 flex-shrink-0">
                                {index + 1}.
                              </span>
                              <span className="text-sm md:text-base font-medium truncate flex-1">{player.player_name}</span>
                              <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 text-xs rounded-full font-medium flex-shrink-0">
                                SUB
                              </span>
                            </div>
                          ))}
                      </div>
                    </div>
                  )}
                    </>
                  )}

                  {/* Action Buttons */}
                  <div className="flex flex-col sm:flex-row gap-2 md:gap-3 sm:justify-end">
                    <button
                      onClick={() => setShowViewLineupModal(false)}
                      className="px-6 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
                    >
                      Close
                    </button>
                    {isTripleThreat && selectedFixture && (
                      <button
                        onClick={() => {
                          setShowViewLineupModal(false);
                          openLineupModal(selectedFixture, selectedTeamType);
                        }}
                        className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-2"
                      >
                        <Pencil className="w-4 h-4" />
                        <span>Edit Lineup</span>
                      </button>
                    )}
                    <button
                      onClick={copyLineupToClipboard}
                      className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center gap-2"
                    >
                      <Share2 className="w-4 h-4 mr-1" />
                      <span className="hidden sm:inline">Copy for WhatsApp</span>
                      <span className="sm:hidden">Copy</span>
                    </button>
                  </div>
                </>
              ) : (
                <div className="text-center py-12">
                  <p className="text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono mt-4">No lineup data available</p>
                </div>
              )}
            </div>
          </div>
        )}

      {/* Triple Threat Lineup Setting Modal */}
        {showTTLineupModal && selectedFixture && (
          <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center z-[9999] p-3 sm:p-6 overflow-y-auto font-mono">
            <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-3xl shadow-2xl max-w-2xl w-full max-h-[calc(100vh-2rem)] sm:max-h-[90vh] flex flex-col my-auto overflow-hidden">
              <div className="px-4 py-3 sm:px-6 sm:py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
                <div className="min-w-0 pr-2">
                  <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase font-mono tracking-wider bg-amber-500 text-slate-950">
                    ⚡ SS Triple Threat
                  </span>
                  <h2 className="text-sm sm:text-base font-black tracking-tight mt-1 truncate">
                    {selectedTeamType === 'home' ? selectedFixture.home_team_name : selectedFixture.away_team_name} — Mode Lineup
                  </h2>
                  <p className="text-[11px] sm:text-xs text-slate-400 font-mono">
                    Round {selectedFixture.round_number} • {selectedTeamType === 'home' ? 'Home Team Lineup' : 'Away Team Lineup'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTTLineupModal(false)}
                  className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="p-3.5 sm:p-6 flex-1 overflow-y-auto overscroll-contain">
                {isLoadingTTLineup ? (
                  <div className="text-center py-12">
                    <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mx-auto"></div>
                    <p className="mt-4 text-xs text-slate-500 uppercase tracking-wider font-extrabold font-mono">
                      Loading lineup...
                    </p>
                  </div>
                ) : (
                  <TripleThreatLineupSubmission
                    fixtureId={selectedFixture.fixture_id}
                    teamId={selectedTeamType === 'home' ? selectedFixture.home_team_id : selectedFixture.away_team_id}
                    seasonId={
                      selectedFixture.season_id ||
                      tournaments.find((t) => t.id === selectedTournament)?.season_id ||
                      ''
                    }
                    isHomeTeam={selectedTeamType === 'home'}
                    opponentTeamName={
                      selectedTeamType === 'home' ? selectedFixture.away_team_name : selectedFixture.home_team_name
                    }
                    existingLineup={ttExistingLineup}
                    opponentLineup={ttOpponentLineup}
                    bypassDeadline={true}
                    onSubmitSuccess={() => {
                      setShowTTLineupModal(false);
                      refreshLineupStatus(selectedTournament);
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        )}
    </div>
  
    </AuthGuard>
  );
}
