'use client';
import { CheckCircle, XCircle, Users, RefreshCw, Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

export default function PopulateFantasyPlayersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const leagueId = params?.leagueId as string;

  const [league, setLeague] = useState<any>(null);
  const [isPopulating, setIsPopulating] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string>('');

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
    const loadLeague = async () => {
      if (!leagueId) return;

      try {
        const response = await fetchWithTokenRefresh(`/api/fantasy/leagues/${leagueId}`);
        if (!response.ok) throw new Error('League not found');
        
        const data = await response.json();
        setLeague(data.league);
      } catch (error) {
        console.error('Error loading league:', error);
        setError('Failed to load fantasy league');
      }
    };

    if (user) {
      loadLeague();
    }
  }, [user, leagueId]);

  const handlePopulate = async () => {
    if (!league) return;

    setIsPopulating(true);
    setError('');
    setResult(null);

    try {
      const response = await fetchWithTokenRefresh('/api/fantasy/players/populate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          league_id: leagueId,
          season_id: league.season_id
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to populate players');
      }

      setResult(data);
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to populate players');
    } finally {
      setIsPopulating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="min-h-screen bg-slate-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Link
          href={`/dashboard/committee/fantasy/${leagueId}`}
          className="inline-flex items-center gap-2 text-slate-500 hover:text-indigo-600 font-semibold text-sm transition-colors mb-6"
        >
          ← Back to League Dashboard
        </Link>

        <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
          <div className="text-center mb-8">
            <div className="w-20 h-20 bg-indigo-50 border border-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-sm">
              <Users className="w-10 h-10" />
            </div>
            <h1 className="text-3xl font-bold text-slate-900">
              Populate Fantasy Players
            </h1>
            <p className="text-slate-500 mt-1.5 font-semibold text-sm">
              {league ? `${league.season_name} - ${league.league_name}` : 'Loading league metadata...'}
            </p>
          </div>

          <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 mb-6 text-indigo-800">
            <h3 className="font-bold text-indigo-900 text-sm mb-2"><Info className="w-4 h-4 inline text-indigo-500 mr-1" /> What does this do?</h3>
            <ul className="text-xs space-y-1.5">
              <li>• Copies all players from the tournament's <code className="bg-indigo-100/60 px-1 py-0.5 rounded font-mono text-[10px]">player_seasons</code> table</li>
              <li>• Creates fantasy player entries with categories matching the stats database</li>
              <li>• Sets initial player price variables to default category prices</li>
              <li>• <strong>Note: Run this before opening the team bidding window!</strong></li>
            </ul>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-6">
              <p className="text-red-800 font-bold text-xs flex items-center gap-1.5"><XCircle className="w-4.5 h-4.5 text-rose-600" /> {error}</p>
            </div>
          )}

          {result && (
            <div className="bg-emerald-50/50 border border-emerald-100 rounded-xl p-5 mb-6 text-emerald-800">
              <h3 className="font-bold text-emerald-950 text-sm mb-3 flex items-center gap-1.5">
                <CheckCircle className="w-4.5 h-4.5 text-emerald-600" /> Success!
              </h3>
              <div className="grid grid-cols-2 gap-4 text-xs font-semibold text-slate-600">
                <div className="bg-white border border-slate-100 rounded-lg p-3">
                  <p className="text-[10px] text-slate-400 uppercase">Found in stats DB</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{result.stats?.found_in_player_seasons || 0}</p>
                </div>
                <div className="bg-white border border-slate-100 rounded-lg p-3">
                  <p className="text-[10px] text-slate-400 uppercase">Populated/Updated</p>
                  <p className="text-2xl font-black text-emerald-600 mt-1">{result.stats?.inserted_or_updated || 0}</p>
                </div>
              </div>
            </div>
          )}

          <button
            onClick={handlePopulate}
            disabled={isPopulating || !league}
            className="w-full px-6 py-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl shadow-md hover:shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {isPopulating ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                Populating players...
              </>
            ) : (
              '⚡ Fetch and Sync Season Player Pool'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
