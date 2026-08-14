'use client';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Users, CheckCircle, XCircle, AlertCircle, RefreshCw, ToggleLeft, ToggleRight } from 'lucide-react';
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
      }
    } catch (error) {
      console.error('Failed to check status:', error);
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
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-slate-600 font-semibold">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard/committee"
            className="inline-flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-semibold text-sm transition-colors mb-4"
          >
            ← Back to Committee Dashboard
          </Link>
          <div className="flex items-center gap-4">
            <div className="p-3 bg-indigo-50 text-indigo-600 rounded-2xl shadow-sm border border-indigo-100">
              <Users className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Enable Fantasy Teams</h1>
              <p className="text-slate-500 mt-0.5">Manage fantasy league participation for all teams</p>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm mb-6">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-indigo-600 mt-0.5" />
            <div>
              <h3 className="text-base font-bold text-slate-900 mb-1">What does this do?</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                This tool enables fantasy league participation for all teams registered in a season. 
                This is useful when creating a fantasy league for seasons where teams weren't asked 
                about fantasy participation during registration.
              </p>
              <p className="text-xs text-slate-400 mt-2 font-medium">
                Note: Teams can still be individually managed later through the fantasy league settings.
              </p>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="bg-white border border-slate-200 p-12 rounded-2xl shadow-sm mb-6">
            <div className="text-center">
              <RefreshCw className="w-10 h-10 text-indigo-600 animate-spin mx-auto mb-4" />
              <p className="text-slate-600 font-semibold">Loading team status...</p>
            </div>
          </div>
        )}

        {/* Status Display */}
        {status && (
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm mb-6">
            <h2 className="text-lg font-bold text-slate-900 mb-4">Current Status</h2>
            
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                <p className="text-xs text-slate-400 font-bold uppercase mb-1">Total Teams</p>
                <p className="text-2xl font-bold text-slate-950">{status.total_teams}</p>
              </div>
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <CheckCircle className="w-4 h-4 text-emerald-600" />
                  <p className="text-xs text-emerald-700 font-bold uppercase">Fantasy Enabled</p>
                </div>
                <p className="text-2xl font-bold text-emerald-800">{status.fantasy_enabled_count}</p>
              </div>
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <XCircle className="w-4 h-4 text-amber-600" />
                  <p className="text-xs text-amber-700 font-bold uppercase">Fantasy Disabled</p>
                </div>
                <p className="text-2xl font-bold text-amber-800">{status.fantasy_disabled_count}</p>
              </div>
            </div>

            {/* All Teams List with Toggle */}
            <div className="mb-6">
              <h3 className="text-base font-bold text-slate-900 mb-3">All Teams</h3>
              <div className="space-y-2">
                {/* Teams with Fantasy */}
                {status.teams_with_fantasy.map(team => (
                  <div key={team.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                      <span className="font-semibold text-slate-800 text-sm">{team.name}</span>
                    </div>
                    <button
                      onClick={() => toggleTeam(team.id, team.fantasy_participating)}
                      disabled={togglingTeams.has(team.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold text-slate-700 disabled:opacity-50 transition-colors"
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
                  <div key={team.id} className="flex items-center justify-between p-3 bg-white rounded-xl border border-slate-200">
                    <div className="flex items-center gap-2">
                      <XCircle className="w-4 h-4 text-slate-400" />
                      <span className="font-semibold text-slate-800 text-sm">{team.name}</span>
                    </div>
                    <button
                      onClick={() => toggleTeam(team.id, team.fantasy_participating)}
                      disabled={togglingTeams.has(team.id)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-700 disabled:opacity-50 transition-colors"
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
                className="w-full px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-2 transition-all"
              >
                {isEnabling ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Enabling...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    Enable Fantasy for All {status.fantasy_disabled_count} Teams
                  </>
                )}
              </button>
            )}

            {status.fantasy_disabled_count === 0 && (
              <div className="text-center py-8">
                <CheckCircle className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
                <p className="text-base font-bold text-slate-900">All teams already have fantasy enabled!</p>
              </div>
            )}
          </div>
        )}

        {/* Result Display */}
        {result && (
          <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle className="w-8 h-8 text-emerald-600" />
              <div>
                <h2 className="text-lg font-bold text-slate-900">Success!</h2>
                <p className="text-slate-500 text-sm">{result.message}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-emerald-50 rounded-xl p-4 border border-emerald-100">
                <p className="text-xs text-emerald-700 font-bold uppercase mb-1">Newly Enabled</p>
                <p className="text-2xl font-bold text-emerald-800">{result.details.newly_enabled}</p>
              </div>
              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100">
                <p className="text-xs text-indigo-700 font-bold uppercase mb-1">Already Enabled</p>
                <p className="text-2xl font-bold text-indigo-800">{result.details.already_enabled}</p>
              </div>
            </div>

            {result.details.updated_teams.length > 0 && (
              <div className="mt-4 border-t pt-4">
                <p className="text-xs text-slate-400 font-bold uppercase mb-2">Updated Teams:</p>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 max-h-32 overflow-y-auto">
                  <ul className="text-xs text-slate-600 space-y-1.5">
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
