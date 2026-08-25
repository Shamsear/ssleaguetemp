'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { ArrowLeft, Crown, Star, Clock, Lock, CheckCircle, AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import AlertModal from '@/components/modals/AlertModal';
import { useModal } from '@/hooks/useModal';
import AuthGuard from '@/components/auth/AuthGuard';

interface Player {
  real_player_id: string;
  player_name: string;
  position: string | null;
  real_team_name: string | null;
}

interface CurrentWindow {
  window_id: string;
  round_id: string;
  round_name: string | null;
  window_status: string;
  opens_at: string;
  closes_at: string;
  time_remaining_seconds: number;
  is_open: boolean;
}

interface CurrentSelections {
  captain_player_id: string | null;
  captain_player_name: string | null;
  vice_captain_player_id: string | null;
  vice_captain_player_name: string | null;
}

export default function CaptainSelectionPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [myTeam, setMyTeam] = useState<any>(null);
  const [squad, setSquad] = useState<Player[]>([]);
  const [currentWindow, setCurrentWindow] = useState<CurrentWindow | null>(null);
  const [currentSelections, setCurrentSelections] = useState<CurrentSelections | null>(null);
  const [selectedCaptain, setSelectedCaptain] = useState<string>('');
  const [selectedViceCaptain, setSelectedViceCaptain] = useState<string>('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<string>('');

  const { alertState, showAlert, closeAlert } = useModal();

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user]);

  useEffect(() => {
    if (currentWindow && currentWindow.is_open) {
      const interval = setInterval(() => {
        updateTimeRemaining();
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [currentWindow]);

  const updateTimeRemaining = () => {
    if (!currentWindow) return;
    
    const now = new Date();
    const closes = new Date(currentWindow.closes_at);
    const diff = closes.getTime() - now.getTime();
    
    if (diff <= 0) {
      setTimeRemaining('Window closed');
      return;
    }

    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    if (days > 0) {
      setTimeRemaining(`${days}d ${hours}h ${minutes}m`);
    } else if (hours > 0) {
      setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`);
    } else {
      setTimeRemaining(`${minutes}m ${seconds}s`);
    }
  };

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Get my team
      console.log('Fetching my team for user:', user?.uid);
      
      const teamResponse = await fetchWithTokenRefresh(`/api/fantasy/teams/my-team?user_id=${user?.uid}`);
      if (!teamResponse.ok) throw new Error('Failed to fetch team');
      const teamData = await teamResponse.json();
      
      console.log('My team response:', teamData);
      console.log('Team ID from response:', teamData.team?.id, 'or team_id:', teamData.team?.team_id);
      
      setMyTeam(teamData.team);

      // Get squad players from team API
      const teamIdToUse = teamData.team.team_id || teamData.team.id;
      console.log('Fetching squad for team:', teamIdToUse);
      
      const squadResponse = await fetchWithTokenRefresh(
        `/api/fantasy/teams/${teamIdToUse}`
      );
      
      console.log('Squad response status:', squadResponse.status);
      
      if (!squadResponse.ok) {
        let errorData;
        try {
          errorData = await squadResponse.json();
        } catch (e) {
          errorData = { error: `HTTP ${squadResponse.status}` };
        }
        console.error('Squad fetch error:', errorData);
        throw new Error(errorData.error || `Failed to fetch squad (${squadResponse.status})`);
      }
      
      const squadData = await squadResponse.json();
      console.log('Squad data received:', squadData);
      
      // Extract players from the team response
      const players = squadData.players || [];
      console.log('Number of players in squad:', players.length);
      
      setSquad(players);
      
      if (players.length === 0) {
        console.warn('⚠️ No players found in squad - team may not have drafted players yet');
        showAlert({
          type: 'warning',
          title: 'Empty Squad',
          message: 'Your team has no players yet. Complete the draft first before selecting captain.'
        });
      }

      // Get current captain window
      const leagueId = teamData.team.fantasy_league_id || teamData.team.league_id;
      const teamIdForWindow = teamIdToUse;
      
      console.log('Fetching captain window for league:', leagueId, 'team:', teamIdForWindow);
      
      const windowResponse = await fetchWithTokenRefresh(
        `/api/fantasy/captain-windows/current?league_id=${leagueId}&team_id=${teamIdForWindow}`
      );
      if (!windowResponse.ok) throw new Error('Failed to fetch captain window');
      const windowData = await windowResponse.json();
      
      setCurrentWindow(windowData.current_window);
      setCurrentSelections(windowData.current_selections);
      
      // Set initial selections if they exist
      if (windowData.current_selections) {
        setSelectedCaptain(windowData.current_selections.captain_player_id || '');
        setSelectedViceCaptain(windowData.current_selections.vice_captain_player_id || '');
      }
    } catch (error) {
      console.error('Error loading data:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to load captain selection data'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedCaptain || !selectedViceCaptain) {
      showAlert({
        type: 'warning',
        title: 'Missing Selection',
        message: 'Please select both captain and vice-captain'
      });
      return;
    }

    if (selectedCaptain === selectedViceCaptain) {
      showAlert({
        type: 'warning',
        title: 'Invalid Selection',
        message: 'Captain and vice-captain must be different players'
      });
      return;
    }

    if (!currentWindow) {
      showAlert({
        type: 'error',
        title: 'No Active Window',
        message: 'No captain selection window is currently open'
      });
      return;
    }

    setIsSaving(true);
    try {
      const teamId = myTeam.team_id || myTeam.id;
      const response = await fetchWithTokenRefresh('/api/fantasy/captain-windows/set-captains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          window_id: currentWindow.window_id,
          team_id: teamId,
          captain_player_id: selectedCaptain,
          vice_captain_player_id: selectedViceCaptain,
          user_id: user?.uid
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save captain selections');
      }

      showAlert({
        type: 'success',
        title: 'Selections Saved',
        message: `${data.captain.player_name} (C) and ${data.vice_captain.player_name} (VC) set successfully!`
      });

      // Reload data to get updated selections
      loadData();
    } catch (error: any) {
      showAlert({
        type: 'error',
        title: 'Save Failed',
        message: error.message || 'Failed to save captain selections'
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading...</p>
        </div>
      </div>
    );
  }

  const isWindowOpen = currentWindow?.is_open && currentWindow.window_status === 'open';

  return (
    <AuthGuard requiredRole="team">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      <AlertModal {...alertState} onClose={closeAlert} />
      
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/team/fantasy/my-team"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to My Team
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-amber-500 rounded-2xl flex items-center justify-center text-white shadow-sm shrink-0">
              <Crown className="w-8 h-8" />
            </div>
            <div className="flex-1">
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">FANTASY CAPTAIN</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 uppercase">
                Select Captain & Vice-Captain
              </h1>
              {currentWindow && (
                <p className="text-xs text-slate-400 font-mono mt-1">
                  {currentWindow.round_name || `Round ${currentWindow.round_id}`}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Window Status Card */}
        {!currentWindow ? (
          <div className="console-card bg-slate-50 border border-slate-200/60 rounded-2xl p-8 text-center">
            <Lock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-700 uppercase tracking-wide mb-2">No Active Window</h3>
            <p className="text-sm text-slate-500 font-mono">
              Captain selection window is not currently open. Check back later!
            </p>
          </div>
        ) : !isWindowOpen ? (
          <div className="console-card bg-rose-50 border border-rose-200/60 rounded-2xl p-8 text-center">
            <Lock className="w-16 h-16 text-rose-300 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-rose-700 uppercase tracking-wide mb-2">Window Closed</h3>
            <p className="text-sm text-rose-600 font-mono mb-4">
              The captain selection window for {currentWindow.round_name || currentWindow.round_id} is currently closed.
            </p>
            {currentSelections?.captain_player_id && (
              <div className="bg-white border border-rose-200 rounded-xl p-4 max-w-sm mx-auto">
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-2">Your Selections:</p>
                <div className="space-y-2 text-left">
                  <div className="flex items-center gap-2">
                    <Crown className="w-4 h-4 text-amber-500" />
                    <span className="text-sm font-bold text-slate-900">{currentSelections.captain_player_name}</span>
                    <span className="text-[10px] text-amber-600 font-bold uppercase">(2x Points)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Star className="w-4 h-4 text-blue-500" />
                    <span className="text-sm font-bold text-slate-900">{currentSelections.vice_captain_player_name}</span>
                    <span className="text-[10px] text-blue-600 font-bold uppercase">(Backup 2x)</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Countdown Timer */}
            <div className="console-card bg-emerald-50 border border-emerald-200/60 rounded-2xl p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-emerald-600" />
                  <div>
                    <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Window Closes In</p>
                    <p className="text-2xl font-black text-emerald-700 font-mono">{timeRemaining}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider">Deadline</p>
                  <p className="text-sm font-bold text-emerald-700 font-mono">
                    {new Date(currentWindow.closes_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <div className="mt-3 h-2 bg-emerald-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-500 transition-all"
                  style={{ width: `${Math.max(0, Math.min(100, (currentWindow.time_remaining_seconds / 86400) * 100))}%` }}
                />
              </div>
            </div>

            {/* Captain Selection */}
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Crown className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Captain (2x Points)</h3>
              </div>
              <div className="space-y-2">
                {squad.length === 0 ? (
                  <p className="text-sm text-slate-500 font-mono">No players in squad</p>
                ) : (
                  squad.map(player => (
                    <label
                      key={player.real_player_id}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        selectedCaptain === player.real_player_id
                          ? 'border-amber-500 bg-amber-50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="captain"
                        value={player.real_player_id}
                        checked={selectedCaptain === player.real_player_id}
                        onChange={(e) => setSelectedCaptain(e.target.value)}
                        className="w-4 h-4 text-amber-500"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-900">{player.player_name}</p>
                        <p className="text-[10px] text-slate-500 font-mono uppercase">
                          {player.position || 'N/A'} • {player.real_team_name || 'No Team'}
                        </p>
                      </div>
                      {selectedCaptain === player.real_player_id && (
                        <CheckCircle className="w-5 h-5 text-amber-500" />
                      )}
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Vice-Captain Selection */}
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Star className="w-5 h-5 text-blue-500" />
                <h3 className="text-sm font-black text-slate-900 uppercase tracking-wider">Vice-Captain (Backup 2x)</h3>
              </div>
              <p className="text-xs text-slate-500 font-mono mb-4">
                Vice-captain gets 2x points only if captain doesn't play
              </p>
              <div className="space-y-2">
                {squad.length === 0 ? (
                  <p className="text-sm text-slate-500 font-mono">No players in squad</p>
                ) : (
                  squad.map(player => (
                    <label
                      key={player.real_player_id}
                      className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                        selectedViceCaptain === player.real_player_id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-slate-200 hover:border-slate-300 bg-white'
                      } ${
                        player.real_player_id === selectedCaptain ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="vice_captain"
                        value={player.real_player_id}
                        checked={selectedViceCaptain === player.real_player_id}
                        onChange={(e) => setSelectedViceCaptain(e.target.value)}
                        disabled={player.real_player_id === selectedCaptain}
                        className="w-4 h-4 text-blue-500"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-bold text-slate-900">{player.player_name}</p>
                        <p className="text-[10px] text-slate-500 font-mono uppercase">
                          {player.position || 'N/A'} • {player.real_team_name || 'No Team'}
                        </p>
                      </div>
                      {selectedViceCaptain === player.real_player_id && (
                        <CheckCircle className="w-5 h-5 text-blue-500" />
                      )}
                      {player.real_player_id === selectedCaptain && (
                        <span className="text-[10px] text-slate-400 font-bold uppercase">Already Captain</span>
                      )}
                    </label>
                  ))
                )}
              </div>
            </div>

            {/* Info Card */}
            <div className="console-card bg-blue-50 border border-blue-200/60 rounded-2xl p-6">
              <div className="flex gap-3">
                <AlertTriangle className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-xs font-bold text-blue-900 mb-2">Important Information</p>
                  <ul className="text-[11px] text-blue-700 space-y-1 font-mono">
                    <li>• You can change your selections anytime before the window closes</li>
                    <li>• Captain gets 2x points multiplier for the round</li>
                    <li>• Vice-captain gets 2x points only if captain doesn't play</li>
                    <li>• Choose wisely based on upcoming fixtures!</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSave}
              disabled={isSaving || !selectedCaptain || !selectedViceCaptain}
              className="w-full px-6 py-4 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white rounded-2xl font-bold text-sm uppercase tracking-wider shadow-lg transition-all cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {isSaving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                  Saving Selections...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Save Captain & Vice-Captain
                </>
              )}
            </button>
          </>
        )}
      </div>
    </div>
  
    </AuthGuard>
  );
}
