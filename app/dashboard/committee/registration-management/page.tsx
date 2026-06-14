'use client';
import { CheckCircle, Users, Lock } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { getSeasonById } from '@/lib/firebase/seasons';
import { Season } from '@/types/season';

interface RegistrationStats {
  total_registrations: number;
  is_registration_open: boolean;
}

interface Player {
  id: string;
  player_id: string;
  player_name: string;
  registration_date: string;
}

export default function RegistrationManagementPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { isCommitteeAdmin, userSeasonId } = usePermissions();
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  const [stats, setStats] = useState<RegistrationStats | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && !isCommitteeAdmin) {
      router.push('/dashboard');
    }
  }, [user, loading, router, isCommitteeAdmin]);

  useEffect(() => {
    const fetchData = async () => {
      if (!userSeasonId) return;

      try {
        const season = await getSeasonById(userSeasonId);
        setCurrentSeason(season);

        // Fetch registration stats
        const statsResponse = await fetch(`/api/admin/registration-phases?season_id=${userSeasonId}`);
        const statsResult = await statsResponse.json();
        
        if (statsResult.success) {
          setStats(statsResult.data);
        }

        // Fetch registered players
        const playersResponse = await fetch(`/api/stats/players?seasonId=${userSeasonId}&limit=1000`);
        const playersResult = await playersResponse.json();
        
        if (playersResult.success && playersResult.data) {
          const registeredPlayers = playersResult.data
            .map((p: any) => ({
              id: p.id,
              player_id: p.player_id,
              player_name: p.player_name,
              registration_date: p.registration_date,
            }))
            .sort((a: Player, b: Player) => 
              new Date(a.registration_date).getTime() - new Date(b.registration_date).getTime()
            );
          
          setPlayers(registeredPlayers);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
        setError('Failed to load registration data');
      } finally {
        setLoadingData(false);
      }
    };

    if (isCommitteeAdmin && userSeasonId) {
      fetchData();
    }
  }, [isCommitteeAdmin, userSeasonId]);

  const toggleRegistration = async () => {
    if (!userSeasonId || !currentSeason || isToggling) return;

    const confirmMessage = currentSeason.is_player_registration_open
      ? 'Close player registration?'
      : 'Open player registration?';
    
    if (!confirm(confirmMessage)) return;

    try {
      setIsToggling(true);
      setError(null);
      setSuccess(null);
      
      const response = await fetch(`/api/admin/seasons/${userSeasonId}/toggle-player-registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (result.success && currentSeason) {
        setCurrentSeason({
          ...currentSeason,
          is_player_registration_open: result.season.is_player_registration_open
        });
        setSuccess(result.message);
      } else {
        setError(result.error || 'Failed to toggle registration');
      }
    } catch (error) {
      console.error('Error toggling registration:', error);
      setError('Failed to toggle registration');
    } finally {
      setIsToggling(false);
    }
  };

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-purple-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-4 border-blue-600 mx-auto mb-4"></div>
          <p className="text-lg text-gray-600 font-medium">Loading registration management...</p>
        </div>
      </div>
    );
  }

  if (!isCommitteeAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen py-8 px-4 bg-gradient-to-br from-blue-50 via-white to-purple-50">
      <div className="container mx-auto max-w-7xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent mb-2">
            📋 Player Registration Management
          </h1>
          <p className="text-gray-600">
            View all registrations and manage registration status
          </p>
          {currentSeason && (
            <p className="text-sm text-gray-500 mt-1">Season: {currentSeason.name}</p>
          )}
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        )}
        
        {success && (
          <div className="mb-6 p-4 bg-green-50 border-l-4 border-green-500 rounded-lg">
            <p className="text-green-800">{success}</p>
          </div>
        )}

        {stats && (
          <>
            {/* Statistics Overview */}
            <div className="grid grid-cols-1 gap-6 mb-8">
              {/* Total Registrations */}
              <div className="glass rounded-2xl p-6 bg-gradient-to-br from-blue-50 to-indigo-50">
                <h3 className="text-sm font-semibold text-blue-900 mb-2"><Users className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Total Registrations</h3>
                <p className="text-5xl font-bold text-blue-600 mb-1">
                  {stats.total_registrations}
                </p>
                <p className="text-sm text-blue-700">All players registered for this season</p>
              </div>
            </div>

            {/* Registration Control */}
            <div className="glass rounded-3xl p-6 mb-8">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Registration Control</h2>
              
              {/* Current Status */}
              <div className="mb-6 p-4 rounded-xl border-2 bg-gray-50">
                <p className="text-sm font-semibold text-gray-700 mb-2">Current Status:</p>
                <div className="flex items-center gap-2">
                  {currentSeason?.is_player_registration_open ? (
                    <span className="px-4 py-2 bg-green-500 text-white rounded-lg font-bold">
                      <CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Registration Open
                    </span>
                  ) : (
                    <span className="px-4 py-2 bg-red-500 text-white rounded-lg font-bold">
                      <Lock className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Registration Closed
                    </span>
                  )}
                </div>
              </div>

              {/* Toggle Button */}
              <div className="flex items-center gap-4">
                <button
                  onClick={toggleRegistration}
                  disabled={isToggling}
                  className={`px-6 py-3 rounded-xl font-semibold hover:shadow-lg transition-all disabled:opacity-50 ${
                    currentSeason?.is_player_registration_open
                      ? 'bg-gradient-to-r from-red-500 to-red-600 text-white'
                      : 'bg-gradient-to-r from-green-500 to-emerald-500 text-white'
                  }`}
                >
                  {isToggling ? 'Processing...' : 
                   currentSeason?.is_player_registration_open ? 'Close Registration' : 'Open Registration'}
                </button>
                <p className="text-sm text-gray-600">
                  {currentSeason?.is_player_registration_open 
                    ? 'Click to stop accepting new player registrations'
                    : 'Click to start accepting player registrations'}
                </p>
              </div>
            </div>

            {/* Registered Players List */}
            <div className="glass rounded-3xl overflow-hidden">
              <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4">
                <h2 className="text-2xl font-bold text-white">Registered Players ({players.length})</h2>
                <p className="text-blue-100 text-sm">Sorted by registration time (earliest first)</p>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b-2 border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">#</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Player Name</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Player ID</th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 uppercase">Registration Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {players.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-12 text-center text-gray-500">
                          <svg className="w-16 h-16 mx-auto mb-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                          </svg>
                          <p className="font-medium text-gray-800">No registrations yet</p>
                        </td>
                      </tr>
                    ) : (
                      players.map((player, index) => (
                        <tr key={player.id} className="hover:bg-blue-50/30 transition-colors">
                          <td className="px-4 py-3 text-sm text-gray-600">{index + 1}</td>
                          <td className="px-4 py-3 font-medium text-gray-900">{player.player_name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 font-mono">{player.player_id}</td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {new Date(player.registration_date).toLocaleString()}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
