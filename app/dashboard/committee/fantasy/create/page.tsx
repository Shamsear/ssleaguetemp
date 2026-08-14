'use client';
import { CheckCircle, Trophy, AlertCircle, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

interface Season {
  id: string;
  season_id: string;
  season_name: string;
  status: string;
}

export default function CreateFantasyLeaguePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeasonId, setSelectedSeasonId] = useState('');
  const [leagueName, setLeagueName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [existingLeague, setExistingLeague] = useState<any>(null);

  const { alertState, showAlert, closeAlert } = useModal();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user) {
      if (user.role !== 'committee_admin' && user.role !== 'super_admin') {
        router.push('/dashboard');
      }
    }
  }, [user, loading, router]);

  useEffect(() => {
    const loadCurrentSeason = async () => {
      try {
        const userSeasonId = (user as any)?.seasonId;
        
        if (userSeasonId) {
          try {
            const response = await fetchWithTokenRefresh(`/api/fantasy/leagues/${userSeasonId}`);
            const data = await response.json();
            
            if (response.ok && data.success) {
              setExistingLeague(data.league);
              setIsLoading(false);
              return;
            } else if (response.status === 404 && data.message && data.message.includes('tournament')) {
              showAlert({
                type: 'error',
                title: 'Tournament Not Created',
                message: data.message || 'Please create the tournament/season first before creating a fantasy league.',
              });
              setIsLoading(false);
              return;
            }
          } catch (error) {
            console.log('Error checking for existing league:', error);
          }
        }
        
        const seasonsResponse = await fetchWithTokenRefresh('/api/seasons');
        if (!seasonsResponse.ok) {
          throw new Error('Failed to fetch seasons');
        }
        
        const seasonsData = await seasonsResponse.json();
        const activeSeasonsData = seasonsData.filter((s: any) => s.status !== 'completed');
        
        if (activeSeasonsData.length === 0) {
          showAlert({
            type: 'error',
            title: 'No Active Season',
            message: 'No available seasons found. Please create a season first.',
          });
        } else {
          setSeasons(activeSeasonsData);
          if (userSeasonId) {
            const currentSeason = activeSeasonsData.find((s: any) => s.season_id === userSeasonId);
            if (currentSeason) {
              setSelectedSeasonId(currentSeason.season_id);
              setLeagueName(`${currentSeason.season_name} Fantasy League`);
            }
          }
        }
      } catch (error) {
        console.error('Error loading current season:', error);
        showAlert({
          type: 'error',
          title: 'Error',
          message: 'Failed to load season data.',
        });
      } finally {
        setIsLoading(false);
      }
    };

    if (user) {
      loadCurrentSeason();
    }
  }, [user]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeasonId || !leagueName.trim()) {
      showAlert({
        type: 'error',
        title: 'Validation Error',
        message: 'Please fill in all required fields.',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetchWithTokenRefresh('/api/fantasy/leagues', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          season_id: selectedSeasonId,
          name: leagueName.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create fantasy league');
      }

      showAlert({
        type: 'success',
        title: 'Success',
        message: 'Fantasy league created successfully!',
      });

      setTimeout(() => {
        router.push(`/dashboard/committee/fantasy/${data.league_id || data.id}`);
      }, 1500);
    } catch (error) {
      console.error('Error creating league:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: error instanceof Error ? error.message : 'Failed to create fantasy league.',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) return null;

  // If league already exists, show existing league card
  if (existingLeague) {
    return (
      <div className="min-h-screen bg-slate-50 py-8 px-4">
        <AlertModal {...alertState} onClose={closeAlert} />

        <div className="max-w-3xl mx-auto">
          {/* Header */}
          <div className="mb-8">
            <Link
              href="/dashboard/committee"
              className="inline-flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-semibold text-sm transition-colors mb-4"
            >
              ← Back to Dashboard
            </Link>

            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
                <Trophy className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-slate-900">Fantasy League Exists</h1>
                <p className="text-slate-500 mt-1 font-semibold text-sm">Only one fantasy league per season is allowed</p>
              </div>
            </div>
          </div>

          {/* Existing League Card */}
          <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-6 mb-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0 text-white shadow-sm">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-emerald-950 mb-2">{existingLeague.name || existingLeague.league_name}</h2>
                  <div className="space-y-1 text-xs font-semibold text-emerald-800 uppercase tracking-wider">
                    <p>📅 Status: {existingLeague.status || 'DRAFT'}</p>
                    <p>🏆 League ID: {existingLeague.league_id || existingLeague.id}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5 mb-6 text-indigo-800">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs font-semibold leading-relaxed">
                  A fantasy league already exists for this season. You can proceed to manage the active league options directly.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <Link
                href="/dashboard/committee"
                className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors text-center text-sm shadow-sm"
              >
                &larr; Back to Dashboard
              </Link>
              <Link
                href={`/dashboard/committee/fantasy/${existingLeague.league_id || existingLeague.season_id || existingLeague.id}`}
                className="flex-1 px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg text-center text-sm"
              >
                Manage League &rarr;
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <AlertModal {...alertState} onClose={closeAlert} />

      <div className="max-w-3xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard/committee"
            className="inline-flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-semibold text-sm transition-colors mb-4"
          >
            ← Back to Dashboard
          </Link>

          <div className="flex items-center gap-4">
            <div className="w-16 h-16 bg-indigo-50 border border-indigo-100 rounded-2xl flex items-center justify-center text-indigo-600 shadow-sm">
              <Trophy className="w-8 h-8" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-slate-900">Create Fantasy League</h1>
              <p className="text-slate-500 mt-1 font-semibold text-sm">Set up a new fantasy league for the season</p>
            </div>
          </div>
        </div>

        {/* Form Card */}
        <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Season Selection/Display */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                {seasons.length === 1 ? 'Season (Current Admin Season)' : 'Select Season *'}
              </label>
              
              {seasons.length === 0 ? (
                <div className="w-full px-4 py-3 border border-slate-200 bg-slate-50 rounded-xl text-slate-400 text-sm">
                  Loading season options...
                </div>
              ) : seasons.length === 1 ? (
                <>
                  <div className="w-full px-4 py-3 border border-indigo-200 bg-indigo-50/50 rounded-xl text-indigo-900 flex items-center justify-between text-sm">
                    <span className="font-bold">
                      {seasons[0]?.season_name || seasons[0]?.season_id || 'Unknown Season'}
                    </span>
                    <span className="px-2.5 py-0.5 bg-indigo-600 text-white text-[10px] font-black rounded-full uppercase tracking-wider">
                      AUTO-SELECTED
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-indigo-600 font-semibold">
                    Automatically set to your active committee season
                  </p>
                </>
              ) : (
                <>
                  <select
                    value={selectedSeasonId}
                    onChange={(e) => {
                      setSelectedSeasonId(e.target.value);
                      const selectedSeason = seasons.find(s => s.season_id === e.target.value);
                      if (selectedSeason) {
                        setLeagueName(`${selectedSeason.season_name} Fantasy League`);
                      }
                    }}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl bg-white text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900"
                    required
                  >
                    <option value="">-- Select a Season --</option>
                    {seasons.map((season) => (
                      <option key={season.id} value={season.season_id}>
                        {season.season_name}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>

            {/* League Name */}
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">
                Fantasy League Name *
              </label>
              <input
                type="text"
                value={leagueName}
                onChange={(e) => setLeagueName(e.target.value)}
                placeholder="e.g., Season 16 Fantasy League"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-900"
                required
              />
              <p className="mt-2 text-xs text-slate-400 font-semibold">
                This name will be visible to all managers and team builders
              </p>
            </div>

            {/* Info Box */}
            <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-5 text-indigo-900">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-indigo-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-xs font-bold uppercase mb-2">Fantasy initialization details:</p>
                  <ul className="text-[11px] font-semibold text-indigo-850 space-y-1.5 list-disc list-inside">
                    <li>Fantasy rosters will be initialized for all participating clubs</li>
                    <li>Default scoring metrics (goals, clean sheets) will be populated</li>
                    <li>The league is set to "Draft Config" window by default</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Submit Buttons */}
            <div className="flex gap-4 pt-4">
              <Link
                href="/dashboard/committee"
                className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors text-center text-sm shadow-sm"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-6 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-1.5 text-sm"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="animate-spin h-4 w-4" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Trophy className="w-4 h-4 text-amber-400" />
                    Create Fantasy League
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
