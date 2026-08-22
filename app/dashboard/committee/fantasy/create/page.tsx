'use client';
import { CheckCircle, Trophy, AlertCircle, RefreshCw, ArrowLeft, Calendar, Gem } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import Link from 'next/link';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';

interface Season {
  id: string;
  season_id: string;
  name: string;
  status: string;
}

export default function CreateFantasyLeaguePage() {
  const { user, loading } = useAuth();
  const { userSeasonId } = usePermissions();
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
        
        // Fetch seasons from Firestore instead of Postgres API to ensure availability
        const seasonsQuery = query(collection(db, 'seasons'), orderBy('created_at', 'desc'));
        const seasonsSnapshot = await getDocs(seasonsQuery);
        
        const seasonsList: Season[] = [];
        seasonsSnapshot.forEach(doc => {
          const data = doc.data();
          seasonsList.push({
            id: doc.id,
            season_id: doc.id,
            name: data.name || doc.id.replace('SSPSLS', 'Season '),
            status: data.status || (data.isActive ? 'active' : 'completed'),
          });
        });
        
        // Sort seasons by ID number ascending
        const getSeasonNum = (id: string) => parseInt(id.replace(/\D/g, '')) || 0;
        seasonsList.sort((a, b) => getSeasonNum(a.id) - getSeasonNum(b.id));

        let activeSeasonsData = seasonsList.filter((s: any) => s.status !== 'completed');
        
        if (userSeasonId) {
          const assignedSeason = seasonsList.find((s: any) => s.season_id === userSeasonId);
          if (assignedSeason) {
            activeSeasonsData = [assignedSeason];
          }
        }
        
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
              setLeagueName(`${currentSeason.name} Fantasy League`);
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
  }, [user, userSeasonId]);

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
      const seasonNumber = selectedSeasonId.replace('SSPSLS', '');
      const computedLeagueId = `SSPSLFLS${seasonNumber}`;

      const response = await fetchWithTokenRefresh('/api/fantasy/leagues', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          league_id: computedLeagueId,
          season_id: selectedSeasonId,
          season_name: leagueName.trim(),
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
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading data...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  // If league already exists, show existing league card
  if (existingLeague) {
    return (
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
        <AlertModal {...alertState} onClose={closeAlert} />
        {/* Ambient Gold Glow */}
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

        <div className="max-w-3xl mx-auto relative z-10 space-y-6 font-mono">
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
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">COMMITTEE CONSOLE</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 uppercase">
                Fantasy League Exists
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Only one fantasy league per season is allowed.
              </p>
            </div>
            <div className="w-16 h-16 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center text-amber-400 shadow-sm shrink-0">
              <Trophy className="w-8 h-8" />
            </div>
          </div>

          {/* Existing League Card */}
          <div className="console-card bg-white border border-slate-200/60 p-8 rounded-3xl shadow-sm">
            <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 mb-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 bg-emerald-500 rounded-xl flex items-center justify-center flex-shrink-0 text-white shadow-sm">
                  <CheckCircle className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-bold text-emerald-950 mb-2">{existingLeague.name || existingLeague.league_name}</h2>
                  <div className="space-y-1 text-xs font-bold text-emerald-800 uppercase tracking-wider">
                    <p><Calendar className="w-3 h-3 inline text-slate-500 mr-1" /> Status: {existingLeague.status || 'DRAFT'}</p>
                    <p><Trophy className="w-3 h-3 inline text-amber-500 mr-1" /> League ID: {existingLeague.league_id || existingLeague.id}</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 border border-amber-200/60 rounded-2xl p-5 mb-6 text-amber-900">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs font-bold leading-relaxed uppercase">
                  A fantasy league already exists for this season. You can proceed to manage the active league options directly.
                </p>
              </div>
            </div>

            <div className="flex gap-4">
              <Link
                href="/dashboard/committee"
                className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors text-center text-xs uppercase tracking-wider shadow-sm border border-slate-200"
              >
                &larr; Back to Dashboard
              </Link>
              <Link
                href={`/dashboard/committee/fantasy/${existingLeague.league_id || existingLeague.season_id || existingLeague.id}`}
                className="flex-1 px-6 py-3 bg-amber-500 text-slate-900 hover:bg-amber-400 font-bold rounded-xl transition-all shadow-md hover:shadow-lg text-center text-xs uppercase tracking-wider border border-amber-600"
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
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      <AlertModal {...alertState} onClose={closeAlert} />
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-3xl mx-auto relative z-10 space-y-6 font-mono">
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
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">COMMITTEE CONSOLE</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 uppercase">
              Create Fantasy League
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Initialize and set up a new fantasy league for the season.
            </p>
          </div>
          <div className="w-16 h-16 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center text-amber-400 shadow-sm shrink-0">
            <Trophy className="w-8 h-8" />
          </div>
        </div>

        {/* Form Card */}
        <div className="console-card bg-white border border-slate-200/60 p-6 sm:p-8 rounded-3xl shadow-sm">
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Season Selection/Display */}
            <div>
              <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                {seasons.length === 1 ? 'Season (Current Admin Season)' : 'Select Season *'}
              </label>
              
              {seasons.length === 0 ? (
                <div className="w-full px-4 py-3 border border-slate-200 bg-slate-50 rounded-xl text-slate-450 text-xs font-bold uppercase">
                  Loading season options...
                </div>
              ) : seasons.length === 1 ? (
                <>
                  <div className="w-full px-4 py-3 border border-amber-250 bg-amber-50/30 rounded-xl text-amber-900 flex items-center justify-between text-xs font-bold uppercase">
                    <span className="font-black">
                      {seasons[0]?.name || seasons[0]?.season_id || 'Unknown Season'}
                    </span>
                    <span className="px-2.5 py-0.5 bg-amber-500 text-slate-900 text-[10px] font-black rounded-full tracking-wider">
                      AUTO-SELECTED
                    </span>
                  </div>
                  <p className="mt-2 text-[10px] text-amber-600 font-bold uppercase">
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
                        setLeagueName(`${selectedSeason.name} Fantasy League`);
                      }
                    }}
                    className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-slate-900 bg-white shadow-sm text-xs font-bold uppercase animate-none"
                    required
                  >
                    <option value="">-- Select a Season --</option>
                    {seasons.map((season) => (
                      <option key={season.id} value={season.season_id}>
                        {season.name}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>

            {/* League Name */}
            <div>
              <label className="block text-xs font-black uppercase text-slate-700 tracking-wider mb-2">
                Fantasy League Name *
              </label>
              <input
                type="text"
                value={leagueName}
                onChange={(e) => setLeagueName(e.target.value)}
                placeholder="e.g., Season 16 Fantasy League"
                className="w-full px-4 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent text-slate-900 bg-white shadow-sm text-xs font-bold uppercase animate-none"
                required
              />
              <p className="mt-2 text-[10px] text-slate-400 font-bold uppercase">
                This name will be visible to all managers and team builders
              </p>
            </div>

            {/* Info Box */}
            <div className="bg-amber-50/30 border border-amber-250/30 rounded-xl p-5 text-amber-900">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-[10px] font-black uppercase mb-2">Fantasy initialization details:</p>
                  <ul className="text-[10px] font-bold text-slate-600 space-y-1.5 list-disc list-inside uppercase">
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
                className="flex-1 px-6 py-3 bg-slate-100 text-slate-700 font-bold rounded-xl hover:bg-slate-200 transition-colors text-center text-xs uppercase tracking-wider shadow-sm border border-slate-200"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 px-6 py-3 bg-amber-500 hover:bg-amber-400 text-slate-900 font-bold rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 flex items-center justify-center gap-1.5 text-xs uppercase tracking-wider border border-amber-600"
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="animate-spin h-4 w-4" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Trophy className="w-4 h-4 text-slate-900" />
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
