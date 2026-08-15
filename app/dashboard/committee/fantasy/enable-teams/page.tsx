'use client';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, CheckCircle, XCircle, AlertCircle, RefreshCw, ToggleLeft, ToggleRight, ArrowLeft } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

interface TeamStatus {
  id: string;
  name: string;
  fantasy_participating: boolean;
  fantasy_joined_at: any;
}

interface StatusCheck {
  total_teams: number;
  fantasy_enabled_count: number;
  fantasy_disabled_count: number;
  teams_with_fantasy: TeamStatus[];
  teams_without_fantasy: TeamStatus[];
}

export default function EnableFantasyTeamsPage() {
  const { user, loading } = useAuth();
  const { userSeasonId } = usePermissions();
  const router = useRouter();

  const [status, setStatus] = useState<StatusCheck | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isEnabling, setIsEnabling] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [togglingTeams, setTogglingTeams] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && user.role !== 'committee_admin' && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (userSeasonId) {
      checkStatus();
    }
  }, [userSeasonId]);

  const checkStatus = async () => {
    if (!userSeasonId) return;

    setIsLoading(true);
    setResult(null);
    try {
      const res = await fetchWithTokenRefresh(`/api/fantasy/teams/enable-all?season_id=${userSeasonId}`);
      const data = await res.json();
      
      if (res.ok) {
        setStatus(data);
      } else {
        console.error('Failed to check status:', data.error);
        // Show error to user
        if (data.error) {
          alert(`Error: ${data.error}`);
        }
      }
    } catch (error) {
      console.error('Failed to check status:', error);
      alert('Failed to load team status. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const enableAll = async () => {
    if (!userSeasonId) return;

    if (!confirm('This will enable fantasy participation for ALL teams in this season. Continue?')) {
      return;
    }

    setIsEnabling(true);
    setResult(null);
    try {
      const res = await fetchWithTokenRefresh('/api/fantasy/teams/enable-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ season_id: userSeasonId }),
      });

      const data = await res.json();
      
      if (res.ok) {
        setResult(data);
        checkStatus();
      } else {
        alert(data.error || 'Failed to enable teams');
      }
    } catch (error) {
      console.error('Failed to enable teams:', error);
      alert('Failed to enable teams');
    } finally {
      setIsEnabling(false);
    }
  };

  const toggleTeam = async (teamId: string, currentStatus: boolean) => {
    if (!userSeasonId) return;

    setTogglingTeams(prev => new Set(prev).add(teamId));
    try {
      const res = await fetchWithTokenRefresh('/api/fantasy/teams/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          team_id: teamId,
          league_id: userSeasonId.replace('SSPSLS', 'SSPSLFLS'), // Convert season ID to fantasy league ID
          enable: !currentStatus 
        }),
      });

      if (res.ok) {
        checkStatus();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to toggle team');
      }
    } catch (error) {
      console.error('Failed to toggle team:', error);
      alert('Failed to toggle team');
    } finally {
      setTogglingTeams(prev => {
        const newSet = new Set(prev);
        newSet.delete(teamId);
        return newSet;
      });
    }
  };

  if (loading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading team data...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/committee"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">FANTASY CONSOLE</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 uppercase">
              Enable Fantasy Teams
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Manage fantasy league participation for all teams
            </p>
          </div>
          <div className="w-16 h-16 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center text-amber-400 shadow-sm shrink-0">
            <Users className="w-8 h-8" />
          </div>
        </div>

        {/* Info Box */}
        <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-1.5">What does this do?</h3>
              <p className="text-[11px] text-slate-600 font-bold uppercase leading-relaxed">
                This tool enables fantasy league participation for all teams registered in a season. 
                This is useful when creating a fantasy league for seasons where teams weren't asked 
                about fantasy participation during registration.
              </p>
              <p className="text-[10px] text-slate-450 mt-2 font-bold uppercase">
                Note: Teams can still be individually managed later through the fantasy league settings.
              </p>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="console-card bg-white border border-slate-200/60 p-12 rounded-3xl shadow-sm">
            <div className="text-center">
              <RefreshCw className="w-10 h-10 text-amber-500 animate-spin mx-auto mb-4" />
              <p className="text-xs font-black text-slate-550 uppercase tracking-wider">Loading team status...</p>
            </div>
          </div>
        )}

        {/* Status Display */}
        {status && !isLoading && (
          <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-6">
            <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider">Current Status</h2>
            
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4">
                <p className="text-[9px] text-slate-450 font-bold uppercase mb-1">Total Teams</p>
                <p className="text-xl font-black text-slate-850">{status.total_teams}</p>
              </div>
              <div className="bg-emerald-50 border border-emerald-200/60 rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <p className="text-[9px] text-emerald-700 font-black uppercase">Fantasy Enabled</p>
                </div>
                <p className="text-xl font-black text-emerald-800">{status.fantasy_enabled_count}</p>
              </div>
              <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-4">
                <div className="flex items-center gap-1.5 mb-1">
                  <XCircle className="w-3.5 h-3.5 text-amber-600" />
                  <p className="text-[9px] text-amber-700 font-black uppercase">Fantasy Disabled</p>
                </div>
                <p className="text-xl font-black text-amber-800">{status.fantasy_disabled_count}</p>
              </div>
            </div>

            {/* All Teams List with Toggle */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">All Teams</h3>
              
              <div className="space-y-2">
                {/* Teams with Fantasy */}
                {status.teams_with_fantasy.map(team => (
                  <div key={team.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200/60">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <span className="font-bold text-slate-800 text-xs uppercase">{team.name}</span>
                    </div>
                    <button
                      onClick={() => toggleTeam(team.id, team.fantasy_participating)}
                      disabled={togglingTeams.has(team.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200/60 rounded-lg text-[10px] font-black uppercase text-slate-700 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {togglingTeams.has(team.id) ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ToggleRight className="w-4.5 h-4.5 text-emerald-600" />
                      )}
                      Disable
                    </button>
                  </div>
                ))}
                
                {/* Teams without Fantasy */}
                {status.teams_without_fantasy.map(team => (
                  <div key={team.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200/60">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-slate-450" />
                      <span className="font-bold text-slate-800 text-xs uppercase">{team.name}</span>
                    </div>
                    <button
                      onClick={() => toggleTeam(team.id, team.fantasy_participating)}
                      disabled={togglingTeams.has(team.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg text-[10px] font-black uppercase text-amber-700 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {togglingTeams.has(team.id) ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ToggleLeft className="w-4.5 h-4.5 text-slate-400" />
                      )}
                      Enable
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* Enable Button */}
            {status.fantasy_disabled_count > 0 && (
              <button
                onClick={enableAll}
                disabled={isEnabling}
                className="w-full px-6 py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold border border-amber-600 rounded-xl shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 transition-all text-xs uppercase tracking-wider cursor-pointer font-black"
              >
                {isEnabling ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Enabling...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Enable Fantasy for All {status.fantasy_disabled_count} Teams
                  </>
                )}
              </button>
            )}

            {status.fantasy_disabled_count === 0 && (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
                <p className="text-xs font-black text-slate-800 uppercase">All teams already have fantasy enabled!</p>
              </div>
            )}
          </div>
        )}

        {/* Result Display */}
        {result && (
          <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
              <div>
                <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">Success!</h2>
                <p className="text-slate-500 text-xs font-bold uppercase">{result.message}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-50 border border-emerald-200/60 rounded-xl p-4">
                <p className="text-[9px] text-emerald-700 font-black uppercase mb-1">Newly Enabled</p>
                <p className="text-xl font-black text-emerald-800">{result.details.newly_enabled}</p>
              </div>
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4">
                <p className="text-[9px] text-slate-455 font-black uppercase mb-1">Already Enabled</p>
                <p className="text-xl font-black text-slate-850">{result.details.already_enabled}</p>
              </div>
            </div>

            {result.details.updated_teams.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <p className="text-[10px] text-slate-400 font-bold uppercase mb-2">Updated Teams:</p>
                <div className="bg-slate-50 border border-slate-250/60 rounded-xl p-3 max-h-32 overflow-y-auto">
                  <ul className="text-[11px] text-slate-600 font-bold uppercase space-y-1.5">
                    {result.details.updated_teams.map((team: string) => (
                      <li key={team} className="flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5 text-emerald-600" /> {team}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
