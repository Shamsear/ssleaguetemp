'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, getDocs, query, orderBy } from 'firebase/firestore';
import Link from 'next/link';

interface RealPlayer {
  player_id: string;
  name: string;
  display_name?: string;
  place?: string;
  phone?: string;
  email?: string;
  photo_url?: string;
  is_active?: boolean;
  dob?: any;
  date_of_birth?: any;
  created_at?: any;
  updated_at?: any;
}

export default function RealPlayersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [players, setPlayers] = useState<RealPlayer[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<RealPlayer[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterPlace, setFilterPlace] = useState<string>('all');
  const [sortByDob, setSortByDob] = useState<'none' | 'year' | 'birthday'>('none');
  const [availablePlaces, setAvailablePlaces] = useState<string[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchPlayers = async () => {
      if (!user || user.role !== 'super_admin') return;

      try {
        setLoadingData(true);
        setError(null);

        const playersRef = collection(db, 'realplayers');
        const q = query(playersRef, orderBy('created_at', 'desc'));
        const querySnapshot = await getDocs(q);

        const playersData: RealPlayer[] = [];
        querySnapshot.forEach((doc) => {
          playersData.push({
            ...doc.data(),
            player_id: doc.data().player_id || doc.id,
          } as RealPlayer);
        });

        setPlayers(playersData);
        setFilteredPlayers(playersData);
        
        // Extract unique places for filter
        const places = new Set<string>();
        playersData.forEach(player => {
          if (player.place) {
            places.add(player.place);
          }
        });
        setAvailablePlaces(Array.from(places).sort());
      } catch (error) {
        console.error('Error fetching players:', error);
        setError('Failed to load players data');
      } finally {
        setLoadingData(false);
      }
    };

    fetchPlayers();
  }, [user]);

  useEffect(() => {
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      let filtered = players.filter(p => 
        p.name?.toLowerCase().includes(term) ||
        p.display_name?.toLowerCase().includes(term) ||
        p.player_id?.toLowerCase().includes(term) ||
        p.phone?.toLowerCase().includes(term) ||
        p.email?.toLowerCase().includes(term) ||
        p.place?.toLowerCase().includes(term)
      );
      
      // Apply place filter
      if (filterPlace !== 'all') {
        filtered = filtered.filter(p => p.place === filterPlace);
      }
      
      // Apply DOB sorting if selected, otherwise sort by name
      if (sortByDob === 'year') {
        // Sort by full date (year, month, day) - oldest first
        filtered = filtered.sort((a, b) => {
          const dobA = a.dob || a.date_of_birth;
          const dobB = b.dob || b.date_of_birth;
          
          if (!dobA && !dobB) return 0;
          if (!dobA) return 1;
          if (!dobB) return -1;
          
          const dateA = dobA.toDate ? dobA.toDate() : new Date(dobA);
          const dateB = dobB.toDate ? dobB.toDate() : new Date(dobB);
          
          return dateA.getTime() - dateB.getTime();
        });
      } else if (sortByDob === 'birthday') {
        // Sort by month and day only (ignoring year) - Jan 1 to Dec 31
        filtered = filtered.sort((a, b) => {
          const dobA = a.dob || a.date_of_birth;
          const dobB = b.dob || b.date_of_birth;
          
          if (!dobA && !dobB) return 0;
          if (!dobA) return 1;
          if (!dobB) return -1;
          
          const dateA = dobA.toDate ? dobA.toDate() : new Date(dobA);
          const dateB = dobB.toDate ? dobB.toDate() : new Date(dobB);
          
          // Compare month first, then day
          const monthDiff = dateA.getMonth() - dateB.getMonth();
          if (monthDiff !== 0) return monthDiff;
          return dateA.getDate() - dateB.getDate();
        });
      } else {
        // Default sort by name
        filtered = filtered.sort((a, b) => 
          (a.name || '').localeCompare(b.name || '')
        );
      }
      
      setFilteredPlayers(filtered);
    } else {
      // Apply place filter even without search
      let filtered = filterPlace !== 'all' 
        ? players.filter(p => p.place === filterPlace)
        : [...players];
      
      // Apply DOB sorting if selected, otherwise sort by name
      if (sortByDob === 'year') {
        // Sort by full date (year, month, day) - oldest first
        filtered = filtered.sort((a, b) => {
          const dobA = a.dob || a.date_of_birth;
          const dobB = b.dob || b.date_of_birth;
          
          if (!dobA && !dobB) return 0;
          if (!dobA) return 1;
          if (!dobB) return -1;
          
          const dateA = dobA.toDate ? dobA.toDate() : new Date(dobA);
          const dateB = dobB.toDate ? dobB.toDate() : new Date(dobB);
          
          return dateA.getTime() - dateB.getTime();
        });
      } else if (sortByDob === 'birthday') {
        // Sort by month and day only (ignoring year) - Jan 1 to Dec 31
        filtered = filtered.sort((a, b) => {
          const dobA = a.dob || a.date_of_birth;
          const dobB = b.dob || b.date_of_birth;
          
          if (!dobA && !dobB) return 0;
          if (!dobA) return 1;
          if (!dobB) return -1;
          
          const dateA = dobA.toDate ? dobA.toDate() : new Date(dobA);
          const dateB = dobB.toDate ? dobB.toDate() : new Date(dobB);
          
          // Compare month first, then day
          const monthDiff = dateA.getMonth() - dateB.getMonth();
          if (monthDiff !== 0) return monthDiff;
          return dateA.getDate() - dateB.getDate();
        });
      } else {
        // Default sort by name
        filtered = filtered.sort((a, b) => 
          (a.name || '').localeCompare(b.name || '')
        );
      }
      
      setFilteredPlayers(filtered);
    }
  }, [searchTerm, players, filterPlace, sortByDob]);

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    try {
      const dateObj = date.toDate ? date.toDate() : new Date(date);
      return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return 'N/A';
    }
  };

  const formatDOB = (date: any) => {
    if (!date) return '-';
    try {
      const dateObj = date.toDate ? date.toDate() : new Date(date);
      return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      });
    } catch {
      return '-';
    }
  };

  if (loading || loadingData) {
    return (
      <div className="flex items-center justify-center pt-32">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-500 font-mono text-xs tracking-wider uppercase animate-pulse">Loading real player database...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="space-y-8 animate-fade-in font-mono">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/60">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/superadmin')}
            className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-600 hover:text-slate-950 transition-all flex-shrink-0 shadow-sm"
            title="Back to Dashboard"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Real Players Database
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-1">
              All players from Firebase realplayers collection.
            </p>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="rounded-2xl p-4 bg-rose-50 border border-rose-200 text-rose-700 font-mono text-xs flex items-center gap-3">
          <svg className="w-5 h-5 text-rose-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p>{error}</p>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
          <div className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider">Total Players</div>
          <div className="text-2xl font-extrabold text-slate-800 mt-1 font-mono">{players.length}</div>
        </div>
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
          <div className="text-[10px] font-mono font-semibold text-emerald-600 uppercase tracking-wider">Active Players</div>
          <div className="text-2xl font-extrabold text-emerald-605 mt-1 font-mono">
            {players.filter(p => p.is_active !== false).length}
          </div>
        </div>
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
          <div className="text-[10px] font-mono font-semibold text-purple-600 uppercase tracking-wider">With Photos</div>
          <div className="text-2xl font-extrabold text-purple-650 mt-1 font-mono font-mono">
            {players.filter(p => p.photo_url).length}
          </div>
        </div>
      </div>

      {/* Search and Table Container */}
      <div className="console-card bg-white border border-slate-200/60 shadow-sm rounded-2xl overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200/60 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
            </svg>
            Real Player Registry
          </h2>
          <div className="text-xs text-slate-500 font-mono">
            Showing <span className="font-bold text-slate-700">{filteredPlayers.length}</span> of <span className="font-bold text-slate-700">{players.length}</span> records
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Search and Filters */}
          <div className="flex flex-col gap-5">
            <div className="relative">
              <input
                type="text"
                placeholder="Search by name, ID, phone, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-3 pl-10 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 outline-none text-slate-800 transition-all font-mono text-xs"
              />
              <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            
            {/* Place Filter Pills */}
            {availablePlaces.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 font-mono">
                  <svg className="w-3.5 h-3.5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  <span>Filter by Location:</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    onClick={() => setFilterPlace('all')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                      filterPlace === 'all'
                        ? 'bg-slate-800 text-white shadow-sm border border-slate-705/30'
                        : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    All Places ({players.length})
                  </button>
                  {availablePlaces.map(place => (
                    <button
                      key={place}
                      onClick={() => setFilterPlace(place)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-mono font-bold transition-all ${
                        filterPlace === place
                          ? 'bg-slate-800 text-white shadow-sm border border-slate-700/30'
                          : 'bg-slate-50 text-slate-600 border border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {place} ({players.filter(p => p.place === place).length})
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200/60 bg-white">
            <table className="min-w-full divide-y divide-slate-100 text-sm font-mono">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider">Player ID</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider">Name</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider">Place</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider">Phone</th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider">
                    <button
                      onClick={() => {
                        if (sortByDob === 'none') setSortByDob('year');
                        else if (sortByDob === 'year') setSortByDob('birthday');
                        else setSortByDob('none');
                      }}
                      className="flex items-center gap-1 hover:text-amber-600 transition-colors uppercase font-bold text-xs"
                      title={
                        sortByDob === 'none' 
                          ? 'Click to sort by year (oldest first)' 
                          : sortByDob === 'year'
                          ? 'Click to sort by birthday (Jan-Dec)'
                          : 'Click to reset to name sort'
                      }
                    >
                      Date of Birth
                      {sortByDob === 'year' && (
                        <span className="flex items-center gap-0.5 text-amber-605">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <span className="text-[9px] font-bold">Y</span>
                        </span>
                      )}
                      {sortByDob === 'birthday' && (
                        <span className="flex items-center gap-0.5 text-emerald-600">
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v13m0-13V6a2 2 0 112 2h-2zm0 0V5.5A2.5 2.5 0 109.5 8H12zm-7 4h14M5 12a2 2 0 110-4h14a2 2 0 110 4M5 12v7a2 2 0 002 2h10a2 2 0 002-2v-7" />
                          </svg>
                          <span className="text-[9px] font-bold">B</span>
                        </span>
                      )}
                      {sortByDob === 'none' && (
                        <svg className="w-3.5 h-3.5 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                      )}
                    </button>
                  </th>
                  <th className="px-5 py-3 text-left text-xs font-bold uppercase tracking-wider">Created</th>
                  <th className="px-5 py-3 text-right text-xs font-bold uppercase tracking-wider w-28">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white text-slate-750">
                {filteredPlayers.map((player) => (
                  <tr key={player.player_id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      <span className="text-xs font-mono text-amber-600 font-semibold">{player.player_id}</span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        {player.photo_url && (
                          <img 
                            src={player.photo_url} 
                            alt={player.name}
                            className="w-8 h-8 rounded-full object-cover border border-slate-200 shadow-sm"
                          />
                        )}
                        <div>
                          <div className="text-sm font-bold text-slate-800">{player.name}</div>
                          {player.display_name && player.display_name !== player.name && (
                            <div className="text-[10px] text-slate-400">({player.display_name})</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {player.place ? (
                        <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-purple-50 border border-purple-200 text-purple-700">
                          {player.place}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-xs">-</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-xs text-slate-700">
                      {player.phone || <span className="text-slate-400">-</span>}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap">
                      {(() => {
                        const dobValue = player.dob || player.date_of_birth;
                        if (dobValue) {
                          return (
                            <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded bg-blue-50 border border-blue-200 text-blue-700">
                              {formatDOB(dobValue)}
                            </span>
                          );
                        }
                        return <span className="text-slate-400 text-xs">-</span>;
                      })()}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-xs text-slate-400">
                      {formatDate(player.created_at)}
                    </td>
                    <td className="px-5 py-3.5 whitespace-nowrap text-right">
                      <Link
                        href={`/dashboard/superadmin/realplayers/${player.player_id}`}
                        className="inline-flex items-center px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-all shadow-sm"
                      >
                        View Details
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Cards */}
          <div className="md:hidden space-y-4">
            {filteredPlayers.map((player) => (
              <div key={player.player_id} className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl space-y-3 shadow-sm">
                <div className="flex items-start gap-3">
                  {player.photo_url && (
                    <img 
                      src={player.photo_url} 
                      alt={player.name}
                      className="w-10 h-10 rounded-full object-cover border border-slate-200 shadow-sm"
                    />
                  )}
                  <div className="flex-grow min-w-0">
                    <h3 className="font-bold text-slate-800 truncate">{player.name}</h3>
                    {player.display_name && player.display_name !== player.name && (
                      <p className="text-[10px] text-slate-400">{player.display_name}</p>
                    )}
                    <p className="text-xs font-mono text-amber-600 mt-0.5">{player.player_id}</p>
                  </div>
                </div>
                
                <div className="space-y-2 text-xs">
                  {player.place && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Place:</span>
                      <span className="font-semibold text-slate-705">{player.place}</span>
                    </div>
                  )}
                  {player.phone && (
                    <div className="flex items-center gap-2">
                      <span className="text-slate-400">Phone:</span>
                      <span className="font-semibold text-slate-705">{player.phone}</span>
                    </div>
                  )}
                  {(() => {
                    const dobValue = player.dob || player.date_of_birth;
                    if (dobValue) {
                      return (
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">DOB:</span>
                          <span className="font-semibold text-slate-700">{formatDOB(dobValue)}</span>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>

                <Link
                  href={`/dashboard/superadmin/realplayers/${player.player_id}`}
                  className="block w-full text-center px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                >
                  View Details
                </Link>
              </div>
            ))}
          </div>

          {filteredPlayers.length === 0 && (
            <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
              <svg className="w-12 h-12 mx-auto text-slate-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zm-4 7a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <h3 className="text-lg font-bold text-slate-800 mb-1">No players found</h3>
              <p className="text-xs text-slate-500 font-mono">Try adjusting your search query or place filter</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
