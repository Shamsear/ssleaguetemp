'use client';
import { 
  CheckCircle, 
  XCircle, 
  Search, 
  Users, 
  RefreshCw, 
  Zap, 
  CheckSquare, 
  Square, 
  Filter,
  Check
} from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import { usePermissions } from '@/hooks/usePermissions';
import { Season } from '@/types/season';
import { normalizeStr } from '@/lib/utils/normalizeStr';
import AuthGuard from '@/components/auth/AuthGuard';

export default function TeamRegistrationPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { isCommitteeAdmin, isSuperAdmin, userSeasonId } = usePermissions();
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  
  const [registeredTeamsCount, setRegisteredTeamsCount] = useState(0);
  const [totalTeamsCount, setTotalTeamsCount] = useState(0);
  const [teams, setTeams] = useState<any[]>([]);
  const [teamRegistrationStatuses, setTeamRegistrationStatuses] = useState<Record<string, string>>({});
  const [registeringTeamId, setRegisteringTeamId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  // Bulk registration and filter states
  const [selectedTeamIds, setSelectedTeamIds] = useState<Set<string>>(new Set());
  const [isBulkRegistering, setIsBulkRegistering] = useState(false);
  const [bulkStatusMessage, setBulkStatusMessage] = useState<string | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'pending' | 'registered'>('all');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Fetch team registration statuses for a specific season
  const fetchTeamStatuses = async (seasonId: string) => {
    try {
      const res = await fetch(`/api/team-seasons?season_id=${seasonId}`);
      const json = await res.json();
      const teamSeasons = json.data || json.teamSeasons || [];
      const statuses: Record<string, string> = {};
      let regCount = 0;
      teamSeasons.forEach((ts: any) => {
        const teamId = ts.team_id || (ts.id && ts.id.includes('_') ? ts.id.split('_')[0] : ts.id);
        if (teamId) {
          statuses[teamId] = ts.status;
          if (ts.status === 'registered') regCount++;
        }
      });
      setTeamRegistrationStatuses(statuses);
      setRegisteredTeamsCount(regCount);
      return { statuses, regCount };
    } catch (err: any) {
      console.error('[Registration] Error fetching team statuses:', err);
      return { statuses: {}, regCount: 0 };
    }
  };

  const loadAllData = async () => {
    try {
      setLoadingData(true);

      // 1. Determine target seasonId: either userSeasonId or active season from /api/seasons/current
      let targetSeasonId = userSeasonId;
      if (!targetSeasonId) {
        try {
          const curRes = await fetch('/api/seasons/current');
          if (curRes.ok) {
            const curJson = await curRes.json();
            targetSeasonId = curJson.season?.id || curJson.season?.season_id;
          }
        } catch (e) {
          console.error('[Registration] Failed to fetch current season:', e);
        }
      }

      if (!targetSeasonId) {
        console.warn('[Registration] No target season ID found');
        setLoadingData(false);
        return;
      }

      console.log('[Registration] Loading data for season:', targetSeasonId);

      // 2. Fetch full season details
      const seasonRes = await fetch(`/api/seasons/${targetSeasonId}`);
      const seasonJson = await seasonRes.json();
      const season = seasonJson.data || seasonJson;
      setCurrentSeason(season);

      // 3. Fetch all league teams
      const teamsRes = await fetch('/api/teams');
      const teamsJson = await teamsRes.json();
      const teamsList = (teamsJson.teams || teamsJson.data || []).map((t: any) => ({
        id: t.id,
        ...t
      }));

      // Sort teams alphabetically
      teamsList.sort((a: any, b: any) => {
        const nameA = (a.team_name || a.name || '').toUpperCase();
        const nameB = (b.team_name || b.name || '').toUpperCase();
        return nameA.localeCompare(nameB);
      });

      setTeams(teamsList);
      setTotalTeamsCount(teamsList.length);

      // 4. Fetch team registration statuses
      await fetchTeamStatuses(targetSeasonId);
    } catch (error: any) {
      console.error('[Registration] Error loading registration data:', error);
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (!loading && (isCommitteeAdmin || isSuperAdmin)) {
      loadAllData();
    } else if (!loading && !isCommitteeAdmin && !isSuperAdmin) {
      setLoadingData(false);
    }
  }, [loading, isCommitteeAdmin, isSuperAdmin, userSeasonId]);

  const handleRefresh = async () => {
    if (!currentSeason || isRefreshing) return;
    setIsRefreshing(true);
    await fetchTeamStatuses(currentSeason.id);
    setIsRefreshing(false);
  };

  const toggleTeamRegistration = async () => {
    if (!currentSeason || isToggling) return;

    const confirmMessage = currentSeason.is_team_registration_open
      ? `Close team registration for ${currentSeason.name}?`
      : `Open team registration for ${currentSeason.name}?`;
    
    if (!confirm(confirmMessage)) return;

    try {
      setIsToggling(true);
      const newValue = !currentSeason.is_team_registration_open;
      
      await fetch(`/api/seasons/${currentSeason.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_team_registration_open: newValue }),
      });

      setCurrentSeason({
        ...currentSeason,
        is_team_registration_open: newValue
      });

      alert(
        newValue 
          ? 'Team registration opened successfully!' 
          : 'Team registration closed successfully!'
      );
    } catch (error: any) {
      console.error('Error toggling team registration:', error);
      alert('Failed to toggle team registration');
    } finally {
      setIsToggling(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }).catch(() => {
      alert('Failed to copy link');
    });
  };

  // Single team registration
  const handleRegisterTeam = async (team: any) => {
    if (!currentSeason) return;
    
    const ownerUid = team.owner_uid || team.userId || team.uid || team.id;

    if (!confirm(`Are you sure you want to register ${team.team_name || team.name} for ${currentSeason.name}?`)) {
      return;
    }

    try {
      setRegisteringTeamId(team.id);
      
      const response = await fetch(`/api/seasons/${currentSeason.id}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'join',
          teamId: team.id,
          userId: ownerUid,
          joinFantasy: true,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Optimistically and immediately update local state
        setTeamRegistrationStatuses(prev => ({
          ...prev,
          [team.id]: 'registered',
        }));
        setRegisteredTeamsCount(prev => prev + 1);
        setSelectedTeamIds(prev => {
          const next = new Set(prev);
          next.delete(team.id);
          return next;
        });

        // Background sync
        fetchTeamStatuses(currentSeason.id);

        alert(`Successfully registered ${team.team_name || team.name} for ${currentSeason.name}!`);
      } else {
        alert(`Failed to register team: ${result.message || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Error registering team:', error);
      alert('An error occurred while registering the team.');
    } finally {
      setRegisteringTeamId(null);
    }
  };

  // Bulk registration: selected teams
  const handleRegisterSelected = async () => {
    if (!currentSeason || selectedTeamIds.size === 0 || isBulkRegistering) return;

    const count = selectedTeamIds.size;
    if (!confirm(`Are you sure you want to register ${count} selected team(s) for ${currentSeason.name}?`)) {
      return;
    }

    try {
      setIsBulkRegistering(true);
      setBulkStatusMessage(`Registering ${count} teams...`);

      const response = await fetch(`/api/seasons/${currentSeason.id}/register-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamIds: Array.from(selectedTeamIds),
          joinFantasy: true,
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Update local statuses immediately
        const newStatuses = { ...teamRegistrationStatuses };
        const newlyRegistered = result.registeredTeams || [];
        newlyRegistered.forEach((t: any) => {
          newStatuses[t.teamId] = 'registered';
        });
        selectedTeamIds.forEach((id) => {
          newStatuses[id] = 'registered';
        });

        setTeamRegistrationStatuses(newStatuses);
        setSelectedTeamIds(new Set());
        
        // Sync fresh statuses
        await fetchTeamStatuses(currentSeason.id);

        alert(
          `Bulk registration complete!\n\n` +
          `• Newly registered: ${result.registeredCount || newlyRegistered.length}\n` +
          `• Already registered: ${result.alreadyRegisteredCount || 0}\n` +
          (result.errorCount > 0 ? `• Errors: ${result.errorCount}\n` : '')
        );
      } else {
        alert(`Bulk registration failed: ${result.message || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Error during bulk registration:', error);
      alert('An error occurred during bulk registration.');
    } finally {
      setIsBulkRegistering(false);
      setBulkStatusMessage(null);
    }
  };

  // Bulk registration: all pending teams
  const handleRegisterAllPending = async () => {
    if (!currentSeason || isBulkRegistering) return;

    const pendingTeams = teams.filter(t => teamRegistrationStatuses[t.id] !== 'registered');
    if (pendingTeams.length === 0) {
      alert('All teams in the league are already registered for this season!');
      return;
    }

    if (!confirm(
      `⚡ Register ALL ${pendingTeams.length} pending teams for ${currentSeason.name}?\n\n` +
      `This will automatically enroll every pending team, assign their budget, and join fantasy.`
    )) {
      return;
    }

    try {
      setIsBulkRegistering(true);
      setBulkStatusMessage(`Registering all ${pendingTeams.length} pending teams...`);

      const response = await fetch(`/api/seasons/${currentSeason.id}/register-bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          all: true,
          joinFantasy: true,
        }),
      });

      const result = await response.json();

      if (result.success) {
        setSelectedTeamIds(new Set());
        await fetchTeamStatuses(currentSeason.id);

        alert(
          `All pending teams registered successfully!\n\n` +
          `• Newly Registered: ${result.registeredCount}\n` +
          `• Previously Registered: ${result.alreadyRegisteredCount}\n` +
          (result.errorCount > 0 ? `• Errors: ${result.errorCount}` : '')
        );
      } else {
        alert(`Failed to register all teams: ${result.message || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Error registering all pending teams:', error);
      alert('An error occurred during bulk registration.');
    } finally {
      setIsBulkRegistering(false);
      setBulkStatusMessage(null);
    }
  };

  // Checkbox toggle helpers
  const toggleSelectTeam = (teamId: string) => {
    if (teamRegistrationStatuses[teamId] === 'registered') return;
    setSelectedTeamIds(prev => {
      const next = new Set(prev);
      if (next.has(teamId)) {
        next.delete(teamId);
      } else {
        next.add(teamId);
      }
      return next;
    });
  };

  const pendingTeamsCount = useMemo(() => {
    return teams.filter(t => teamRegistrationStatuses[t.id] !== 'registered').length;
  }, [teams, teamRegistrationStatuses]);

  const filteredTeams = useMemo(() => {
    return teams.filter(team => {
      const status = teamRegistrationStatuses[team.id] || 'pending';
      const isRegistered = status === 'registered';

      if (filterTab === 'pending' && isRegistered) return false;
      if (filterTab === 'registered' && !isRegistered) return false;

      if (searchQuery.trim()) {
        const q = normalizeStr(searchQuery);
        return (
          normalizeStr(team.team_name || team.name || '').includes(q) ||
          normalizeStr(team.id).includes(q) ||
          normalizeStr(team.owner_name || team.manager_name || '').includes(q)
        );
      }
      return true;
    });
  }, [teams, teamRegistrationStatuses, filterTab, searchQuery]);

  const pendingVisibleTeams = useMemo(() => {
    return filteredTeams.filter(t => teamRegistrationStatuses[t.id] !== 'registered');
  }, [filteredTeams, teamRegistrationStatuses]);

  const allVisiblePendingSelected = 
    pendingVisibleTeams.length > 0 && 
    pendingVisibleTeams.every(t => selectedTeamIds.has(t.id));

  const toggleSelectAllVisiblePending = () => {
    setSelectedTeamIds(prev => {
      const next = new Set(prev);
      if (allVisiblePendingSelected) {
        pendingVisibleTeams.forEach(t => next.delete(t.id));
      } else {
        pendingVisibleTeams.forEach(t => next.add(t.id));
      }
      return next;
    });
  };

  if (loading || loadingData) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading Registration Details...</p>
        </div>
      </div>
    );
  }

  if (!currentSeason) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative px-4">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-8 max-w-md w-full mx-auto text-center relative z-10 font-mono">
          <div className="text-amber-500 mb-4 animate-pulse">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider mb-2">No Active Season Found</h2>
          <p className="text-xs text-slate-500 uppercase font-semibold mb-6">
            Unable to locate an active season for registration management.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={loadAllData}
              className="inline-flex items-center justify-center px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-slate-900 rounded-xl text-xs uppercase tracking-wider font-bold transition-all shadow-sm w-full cursor-pointer"
            >
              Retry Loading
            </button>
            <Link 
              href="/dashboard/committee" 
              className="inline-flex items-center justify-center px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl text-xs uppercase tracking-wider font-bold transition-all shadow-sm w-full"
            >
              Back to Dashboard
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const teamRegistrationLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/register/team?season=${currentSeason.id}`;
  const availableTeams = totalTeamsCount - registeredTeamsCount;

  return (
    <AuthGuard requiredRole={['committee_admin', 'super_admin']}>
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 font-mono">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-wider text-slate-800">Team Registration</h1>
            <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
              Active Season: <span className="font-extrabold text-amber-500">{currentSeason.name}</span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={isRefreshing}
              title="Refresh registration statuses"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all text-xs uppercase tracking-wider font-bold cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-500' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <Link 
              href="/dashboard/committee" 
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all text-xs uppercase tracking-wider font-bold"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to Dashboard</span>
            </Link>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 font-mono">
          <div className="console-card bg-white rounded-2xl p-5 border border-slate-200/60 hover:border-blue-400/40 transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 rounded-xl bg-blue-50 text-blue-600 border border-blue-100/50">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
            </div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Total Teams</div>
            <div className="text-2xl font-black text-slate-800">{totalTeamsCount}</div>
          </div>

          <div className="console-card bg-white rounded-2xl p-5 border border-slate-200/60 hover:border-green-500/40 transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 rounded-xl bg-green-50 text-green-600 border border-green-100/50">
                <CheckCircle className="w-6 h-6 text-green-600" />
              </div>
            </div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Registered</div>
            <div className="text-2xl font-black text-green-600">{registeredTeamsCount}</div>
          </div>

          <div className="console-card bg-white rounded-2xl p-5 border border-slate-200/60 hover:border-amber-500/40 transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 rounded-xl bg-amber-50 text-amber-600 border border-amber-100/50">
                <svg className="w-6 h-6 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Pending</div>
            <div className="text-2xl font-black text-amber-600">{availableTeams}</div>
          </div>
        </div>

        {/* Registration Control */}
        <div className="console-card bg-white rounded-3xl p-6 shadow-sm border border-slate-200/60 font-mono">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">Registration Status:</span>
              {currentSeason.is_team_registration_open ? (
                <span className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold bg-green-50 text-green-700 border border-green-200/40 uppercase tracking-wider">
                  <CheckCircle className="w-3.5 h-3.5 mr-1.5 text-green-700" />
                  OPEN
                </span>
              ) : (
                <span className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold bg-red-50 text-red-700 border border-red-200/40 uppercase tracking-wider">
                  <XCircle className="w-3.5 h-3.5 mr-1.5 text-red-700" />
                  CLOSED
                </span>
              )}
            </div>
            
            <button
              onClick={toggleTeamRegistration}
              disabled={isToggling}
              className={`inline-flex items-center px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                currentSeason.is_team_registration_open
                  ? 'bg-red-600 hover:bg-red-500 text-white border border-red-700'
                  : 'bg-green-600 hover:bg-green-500 text-white border border-green-700'
              }`}
            >
              {isToggling ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : currentSeason.is_team_registration_open ? (
                <>
                  <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Close Registration
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Open Registration
                </>
              )}
            </button>
          </div>

          {currentSeason.is_team_registration_open ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50/50 border border-green-200/50 rounded-xl">
                <p className="text-[10px] uppercase font-bold text-green-850 flex items-start leading-relaxed tracking-wider">
                  <svg className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5 text-green-650" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span><strong>Registration Active:</strong> Share the link below with teams to register for {currentSeason.name}.</span>
                </p>
              </div>
              
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">Registration Link</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={teamRegistrationLink}
                    readOnly
                    onClick={(e) => e.currentTarget.select()}
                    className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-400/20 text-xs font-mono text-slate-700 font-bold"
                  />
                  <button
                    onClick={() => copyToClipboard(teamRegistrationLink)}
                    className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-slate-900 font-bold text-xs uppercase tracking-wider transition-all shadow-sm flex items-center justify-center cursor-pointer"
                  >
                    <svg className="w-4 h-4 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                    <span>{copiedUrl ? 'Copied!' : 'Copy Link'}</span>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="p-4 bg-red-50/50 border border-red-200/50 rounded-xl">
              <p className="text-[10px] uppercase font-bold text-red-850 flex items-start leading-relaxed tracking-wider">
                <svg className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5 text-red-650" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span><strong>Registration Closed:</strong> Teams cannot register at this time. Click &quot;Open Registration&quot; to allow teams to join.</span>
              </p>
            </div>
          )}
        </div>

        {/* Teams Directory & Bulk Management */}
        <div className="console-card bg-white rounded-3xl p-6 shadow-sm border border-slate-200/60 font-mono">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center">
                <Users className="w-4 h-4 mr-2 text-amber-500" />
                League Teams Roster ({teams.length})
              </h2>
              <p className="text-[10px] text-slate-550 font-bold uppercase mt-1 leading-relaxed">
                Monitor, select, or bulk-register teams directly into {currentSeason.name}.
              </p>
            </div>

            {/* Quick Bulk Actions */}
            <div className="flex flex-wrap items-center gap-2">
              {pendingTeamsCount > 0 && (
                <button
                  onClick={handleRegisterAllPending}
                  disabled={isBulkRegistering}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span>Register All Pending ({pendingTeamsCount})</span>
                </button>
              )}

              {selectedTeamIds.size > 0 && (
                <button
                  onClick={handleRegisterSelected}
                  disabled={isBulkRegistering}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-black text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                >
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>Register Selected ({selectedTeamIds.size})</span>
                </button>
              )}

              {selectedTeamIds.size > 0 && (
                <button
                  onClick={() => setSelectedTeamIds(new Set())}
                  disabled={isBulkRegistering}
                  className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-bold uppercase rounded-xl transition-all cursor-pointer"
                >
                  Clear Selection
                </button>
              )}
            </div>
          </div>

          {/* Bulk registering indicator */}
          {isBulkRegistering && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200/80 rounded-2xl flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-amber-500 border-t-transparent flex-shrink-0" />
              <span className="text-xs font-black uppercase tracking-wider text-amber-800">
                {bulkStatusMessage || 'Processing registrations, please wait...'}
              </span>
            </div>
          )}

          {/* Filter Tabs and Search Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-4">
            {/* Filter Tabs */}
            <div className="flex items-center bg-slate-100/80 p-1 rounded-xl gap-1 text-[11px] font-bold uppercase tracking-wider">
              <button
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  filterTab === 'all'
                    ? 'bg-white text-slate-800 shadow-sm font-black'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                All ({teams.length})
              </button>
              <button
                onClick={() => setFilterTab('pending')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  filterTab === 'pending'
                    ? 'bg-amber-500 text-slate-950 shadow-sm font-black'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Pending ({pendingTeamsCount})
              </button>
              <button
                onClick={() => setFilterTab('registered')}
                className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer ${
                  filterTab === 'registered'
                    ? 'bg-green-600 text-white shadow-sm font-black'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Registered ({registeredTeamsCount})
              </button>
            </div>

            {/* Search bar */}
            <div className="relative flex-1 sm:max-w-xs">
              <input
                type="text"
                placeholder="Search team or owner..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 pl-9 bg-slate-50/80 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:border-amber-400 focus:bg-white transition-all font-sans"
              />
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            </div>
          </div>

          {/* Teams Table */}
          <div className="overflow-x-auto rounded-2xl border border-slate-200/60">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-550/5 border-b border-slate-200/60 select-none">
                  <th className="px-3 py-3 w-10 text-center">
                    <button
                      onClick={toggleSelectAllVisiblePending}
                      disabled={pendingVisibleTeams.length === 0}
                      title={allVisiblePendingSelected ? 'Deselect all pending' : 'Select all pending'}
                      className="cursor-pointer text-slate-500 hover:text-amber-600 disabled:opacity-30 disabled:cursor-not-allowed"
                    >
                      {allVisiblePendingSelected ? (
                        <CheckSquare className="w-4 h-4 text-amber-500" />
                      ) : (
                        <Square className="w-4 h-4" />
                      )}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 tracking-wider">Logo</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 tracking-wider">Team Name</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 tracking-wider">Manager / Owner</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 tracking-wider">Status</th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-500 tracking-wider text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTeams.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-xs font-bold uppercase text-slate-400">
                      {searchQuery ? "No matching teams found" : "No teams in this category"}
                    </td>
                  </tr>
                ) : (
                  filteredTeams.map((team) => {
                    const status = teamRegistrationStatuses[team.id] || 'pending';
                    const isRegistered = status === 'registered';
                    const isRegistering = registeringTeamId === team.id;
                    const isSelected = selectedTeamIds.has(team.id);

                    return (
                      <tr 
                        key={team.id} 
                        className={`hover:bg-slate-50/60 transition-colors ${
                          isSelected ? 'bg-amber-50/30' : ''
                        }`}
                      >
                        {/* Checkbox */}
                        <td className="px-3 py-3 text-center">
                          {isRegistered ? (
                            <span title="Already registered" className="inline-flex text-green-600 opacity-60">
                              <Check className="w-4 h-4" />
                            </span>
                          ) : (
                            <button
                              onClick={() => toggleSelectTeam(team.id)}
                              className="cursor-pointer text-slate-400 hover:text-amber-500 transition-colors"
                            >
                              {isSelected ? (
                                <CheckSquare className="w-4 h-4 text-amber-500" />
                              ) : (
                                <Square className="w-4 h-4" />
                              )}
                            </button>
                          )}
                        </td>

                        {/* Logo */}
                        <td className="px-4 py-3">
                          {team.logo_url || team.teamLogo ? (
                            <div className="w-8 h-8 rounded-lg bg-slate-50 border border-slate-200/40 overflow-hidden flex items-center justify-center relative">
                              <img
                                src={team.logo_url || team.teamLogo}
                                alt={team.team_name || team.name}
                                className="absolute inset-0 w-full h-full object-cover"
                                style={{
                                  objectPosition: `${(team as any).logo_position_x_square ?? 50}% ${(team as any).logo_position_y_square ?? 50}%`,
                                  transform: `scale(${(team as any).logo_scale_square ?? 1})`,
                                  transformOrigin: `${(team as any).logo_position_x_square ?? 50}% ${(team as any).logo_position_y_square ?? 50}%`,
                                }}
                                onError={(e) => {
                                  e.currentTarget.src = "/placeholder-logo.png";
                                }}
                              />
                            </div>
                          ) : (
                            <div className="w-8 h-8 rounded-lg bg-slate-100 border border-slate-200/40 flex items-center justify-center text-xs font-black text-slate-400 uppercase">
                              {(team.team_name || team.name || "T").substring(0, 2)}
                            </div>
                          )}
                        </td>

                        {/* Team Name */}
                        <td className="px-4 py-3 text-xs font-black text-slate-800 uppercase tracking-wide">
                          {team.team_name || team.name}
                        </td>

                        {/* Owner / Manager */}
                        <td className="px-4 py-3 text-xs font-bold text-slate-550 uppercase tracking-wider">
                          {team.owner_name || team.manager_name || "Owner"}
                          <div className="text-[9px] font-mono text-slate-450 mt-0.5 select-all normal-case">
                            {team.owner_uid || team.userId || team.uid || team.id}
                          </div>
                        </td>

                        {/* Status */}
                        <td className="px-4 py-3">
                          {isRegistered ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black tracking-wider bg-green-50 text-green-700 border border-green-200/40 uppercase">
                              <CheckCircle className="w-3 h-3 mr-1 text-green-600" />
                              Registered
                            </span>
                          ) : status === 'declined' ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black tracking-wider bg-red-50 text-red-700 border border-red-200/40 uppercase">
                              <XCircle className="w-3 h-3 mr-1 text-red-600" />
                              Declined
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-black tracking-wider bg-slate-100 text-slate-600 border border-slate-200 uppercase">
                              Pending
                            </span>
                          )}
                        </td>

                        {/* Action */}
                        <td className="px-4 py-3 text-right">
                          {!isRegistered ? (
                            <button
                              onClick={() => handleRegisterTeam(team)}
                              disabled={isRegistering || isBulkRegistering || !currentSeason}
                              className="inline-flex items-center px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg bg-slate-800 hover:bg-slate-700 hover:text-amber-400 text-white border border-slate-900 transition-all shadow-sm hover:shadow disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                            >
                              {isRegistering ? (
                                <>
                                  <svg className="animate-spin w-3 h-3 mr-1 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                  </svg>
                                  Registering...
                                </>
                              ) : (
                                "Register Team"
                              )}
                            </button>
                          ) : (
                            <span className="inline-flex items-center text-[10px] font-extrabold text-green-600 uppercase tracking-wider mr-2">
                              <CheckCircle className="w-3.5 h-3.5 mr-1" />
                              Joined
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Info Section */}
        <div className="console-card bg-white rounded-3xl p-6 shadow-sm border border-slate-200/60 font-mono">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center mb-4">
            <svg className="w-4 h-4 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Registration Information
          </h3>
          <div className="space-y-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <p>
              <span className="text-slate-700">1. Single &amp; Bulk Registration:</span> Committee admins can register teams individually with the &quot;Register Team&quot; button, select multiple teams with checkboxes, or use &quot;Register All Pending&quot; to enroll everyone at once.
            </p>
            <p>
              <span className="text-slate-700">2. Budgets &amp; Fantasy:</span> Registration automatically assigns the dual-currency budgets (Euro football budget &amp; Real Player USD budget) and registers each team into the season&apos;s Fantasy League.
            </p>
            <p>
              <span className="text-slate-700">3. Registration Link:</span> If team registration is open, teams can also register themselves using the public registration link above.
            </p>
          </div>
        </div>

      </div>
    </div>
    </AuthGuard>
  );
}