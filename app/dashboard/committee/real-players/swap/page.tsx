'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePermissions } from '@/hooks/usePermissions';
import AuthGuard from '@/components/auth/AuthGuard';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { ArrowLeft, RefreshCw, UserCheck, UserX, AlertTriangle, Shield } from 'lucide-react';

interface RealPlayer {
  id: string;
  player_id: string;
  name: string;
  team_id?: string | null;
  team_name?: string;
  category_id?: string | null;
  category_name?: string;
  is_available?: boolean;
}

interface Team {
  id: string;
  team_name: string;
}

interface Category {
  id: string;
  name: string;
  color?: string;
}

export default function MidSeasonPlayerSwapPage() {
  const { user, loading } = useAuth();
  const { userSeasonId, isCommitteeAdmin } = usePermissions();
  const router = useRouter();
  const searchParams = useSearchParams();

  const initialTeamId = searchParams.get('teamId') || '';
  const initialPlayerId = searchParams.get('playerId') || '';

  const [realPlayers, setRealPlayers] = useState<RealPlayer[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form states
  const [selectedTeamId, setSelectedTeamId] = useState(initialTeamId);
  const [departingPlayerId, setDepartingPlayerId] = useState(initialPlayerId);
  const [incomingPlayerId, setIncomingPlayerId] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [reason, setReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Modal system
  const { alertState, showAlert, closeAlert } = useModal();

  useEffect(() => {
    const fetchData = async () => {
      if (!userSeasonId) {
        setIsLoading(false);
        return;
      }

      try {
        setIsLoading(true);
        // 1. Fetch registered players for this season
        const rpRes = await fetchWithTokenRefresh(`/api/realplayers/season-players?seasonId=${userSeasonId}`);
        const rpJson = await rpRes.json();
        const playersData = (rpJson.data || []).map((row: any) => ({
          id: row.id || row.player_id,
          player_id: row.player_id || row.id,
          name: row.player_name || row.name || row.display_name || '',
          team_id: row.team_id || null,
          team_name: row.team || row.team_name || '',
          category_id: row.category || row.category_id || null,
          category_name: row.category || row.category_name || '',
          is_available: !row.team_id || row.team_id === '',
        }));
        setRealPlayers(playersData);

        // 2. Fetch registered teams for this season
        const tsRes = await fetchWithTokenRefresh(`/api/team/all?season_id=${userSeasonId}`);
        const tsJson = await tsRes.json();
        const rawTeams = tsJson.data?.teams || (Array.isArray(tsJson.data) ? tsJson.data : tsJson.teams) || [];
        const registeredTeams: Team[] = (Array.isArray(rawTeams) ? rawTeams : []).map((t: any) => ({
          id: t.team?.id || t.team_id || t.id,
          team_name: t.team?.name || t.team_name || t.name || 'Unknown Team',
        }));
        setTeams(registeredTeams);

        // 3. Fetch categories
        const catRes = await fetchWithTokenRefresh('/api/categories');
        const catJson = await catRes.json();
        if (catJson.success) setCategories(catJson.data || []);
      } catch (err) {
        console.error('Error fetching data for player replacement page:', err);
      } finally {
        setIsLoading(false);
      }
    };

    if (isCommitteeAdmin && userSeasonId) {
      fetchData();
    }
  }, [userSeasonId, isCommitteeAdmin]);

  // Sync category when departing player changes
  useEffect(() => {
    if (departingPlayerId) {
      const p = realPlayers.find((player) => player.id === departingPlayerId || player.player_id === departingPlayerId);
      if (p?.category_id) {
        setSelectedCategoryId(p.category_id);
      }
    }
  }, [departingPlayerId, realPlayers]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!userSeasonId || !selectedTeamId || !departingPlayerId || !incomingPlayerId) {
      showAlert({
        type: 'warning',
        title: 'Missing Required Fields',
        message: 'Please select a team, departing player, and replacement player.',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await fetchWithTokenRefresh('/api/committee/player-replacement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          season_id: userSeasonId,
          team_id: selectedTeamId,
          departing_player_id: departingPlayerId,
          incoming_player_id: incomingPlayerId,
          category_id: selectedCategoryId || undefined,
          reason: reason || undefined,
        }),
      });

      const result = await response.json();

      if (response.ok && result.success) {
        showAlert({
          type: 'success',
          title: 'Player Swap Completed',
          message: result.message || 'Player replaced successfully!',
        });

        // Reset inputs
        setDepartingPlayerId('');
        setIncomingPlayerId('');
        setReason('');

        // Reload data after delay
        setTimeout(() => {
          router.push('/dashboard/committee/real-players');
        }, 1800);
      } else {
        showAlert({
          type: 'error',
          title: 'Replacement Failed',
          message: result.error || 'Failed to replace player',
        });
      }
    } catch (error: any) {
      console.error('Error in player replacement submit:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: error.message || 'An error occurred while processing player replacement.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const departingPlayers = realPlayers.filter((p) => p.team_id === selectedTeamId);
  const freeAgents = realPlayers.filter((p) => !p.team_id && p.id !== departingPlayerId);

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center font-mono">
        <div className="text-center">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-500 uppercase tracking-wider font-bold">Loading player replacement portal...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthGuard requiredRole="committee_admin">
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-12 px-4 sm:px-6 font-mono">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* Top Bar */}
          <div className="flex items-center justify-between gap-4">
            <Link
              href="/dashboard/committee/real-players"
              className="inline-flex items-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm"
            >
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Real Players
            </Link>
            <span className="px-3 py-1 bg-amber-50 border border-amber-200 text-amber-800 rounded-full text-xs font-bold uppercase tracking-wider">
              Season: {userSeasonId}
            </span>
          </div>

          {/* Header Card */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center text-amber-600">
                <RefreshCw className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black uppercase text-slate-900 tracking-wide">
                  Mid-Season Player Replacement / Swap
                </h1>
                <p className="text-xs text-slate-500 uppercase font-semibold mt-0.5">
                  Replace departing mid-season players with free agents while keeping historical stats intact
                </p>
              </div>
            </div>

            {/* Replacement Form */}
            <form onSubmit={handleSubmit} className="mt-6 space-y-5">
              {/* 1. Team Selector */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1.5">
                  1. Select Target Team <span className="text-rose-500">*</span>
                </label>
                <select
                  value={selectedTeamId}
                  onChange={(e) => {
                    setSelectedTeamId(e.target.value);
                    setDepartingPlayerId('');
                  }}
                  required
                  className="w-full py-3 px-4 bg-white border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-xs font-bold uppercase outline-none"
                >
                  <option value="">Choose a team...</option>
                  {teams.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.team_name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 2. Departing Player */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <UserX className="w-4 h-4 text-rose-500" />
                  2. Departing Player (Leaving Team & Becoming Free Agent) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={departingPlayerId}
                  onChange={(e) => setDepartingPlayerId(e.target.value)}
                  required
                  disabled={!selectedTeamId}
                  className="w-full py-3 px-4 bg-white border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-xs font-bold uppercase outline-none disabled:bg-slate-100 disabled:cursor-not-allowed"
                >
                  <option value="">Choose departing roster player...</option>
                  {departingPlayers.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.player_id}) {p.category_name ? `[${p.category_name}]` : ''}
                    </option>
                  ))}
                </select>
                {selectedTeamId && departingPlayers.length === 0 && (
                  <p className="text-[10px] text-amber-600 font-bold uppercase mt-1">
                    No assigned players found for this team.
                  </p>
                )}
              </div>

              {/* 3. Replacement Free Agent */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <UserCheck className="w-4 h-4 text-emerald-600" />
                  3. Replacement Player (Free Agent / Unassigned) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={incomingPlayerId}
                  onChange={(e) => setIncomingPlayerId(e.target.value)}
                  required
                  className="w-full py-3 px-4 bg-white border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-xs font-bold uppercase outline-none"
                >
                  <option value="">Choose replacement free agent...</option>
                  {freeAgents.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.player_id})
                    </option>
                  ))}
                </select>
              </div>

              {/* 4. Category */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1.5">
                  4. Assign Category
                </label>
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  className="w-full py-3 px-4 bg-white border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-xs font-bold uppercase outline-none"
                >
                  <option value="">Same as Departing Player Category (or select...)</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 5. Reason */}
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-700 mb-1.5">
                  5. Reason for Replacement (Optional)
                </label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Player left in middle of season, replaced by free agent"
                  rows={2}
                  className="w-full py-3 px-4 bg-white border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-xs font-bold uppercase outline-none"
                />
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 flex items-center justify-end gap-3">
                <Link
                  href="/dashboard/committee/real-players"
                  className="px-6 py-3 border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-50 transition-colors font-bold text-xs uppercase tracking-wider"
                >
                  Cancel
                </Link>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-6 py-3 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-all flex items-center disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Processing Replacement...
                    </>
                  ) : (
                    'Confirm & Process Replacement'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        <AlertModal
          isOpen={alertState.isOpen}
          onClose={closeAlert}
          title={alertState.title}
          message={alertState.message}
          type={alertState.type}
        />
      </div>
    </AuthGuard>
  );
}
