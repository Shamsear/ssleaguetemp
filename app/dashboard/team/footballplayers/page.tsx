'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import PlayerImage, { PlayerAvatar } from '@/components/PlayerImage';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import * as XLSX from 'xlsx';

// Position constants
// Dynamic positions and position groups will be generated from actual player data

interface Player {
  id: number;
  name: string;
  position: string;
  position_group?: string;
  playing_style?: string;
  overall_rating: number;
  speed?: number;
  acceleration?: number;
  ball_control?: number;
  dribbling?: number;
  low_pass?: number;
  lofted_pass?: number;
  finishing?: number;
  tackling?: number;
  defensive_awareness?: number;
  stamina?: number;
  gk_awareness?: number;
  gk_reflexes?: number;
  gk_catching?: number;
  player_id?: string;
  is_starred?: boolean;
  team_id?: string;
  team_name?: string;
}

export default function PlayerStatisticsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const { alertState, showAlert, closeAlert } = useModal();
  const [players, setPlayers] = useState<Player[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false); // For filter/search changes
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [playingStyleFilter, setPlayingStyleFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [showStarredOnly, setShowStarredOnly] = useState(false);
  const [teams, setTeams] = useState<Array<{id: string; name: string}>>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareFilters, setShareFilters] = useState({
    starredFilter: 'all', // 'all', 'starred', 'unstarred'
    positionFilter: '',
    playingStyleFilter: '',
    teamFilter: ''
  });
  const [sharePlayingStyles, setSharePlayingStyles] = useState<string[]>([]);
  const [sharePositions, setSharePositions] = useState<string[]>([]);
  const [sharePositionGroups, setSharePositionGroups] = useState<string[]>([]);
  const [playingStyles, setPlayingStyles] = useState<string[]>([]);
  const [isLoadingShareFilters, setIsLoadingShareFilters] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalPlayers, setTotalPlayers] = useState(0);
  const itemsPerPage = 25; // Show 25 players per page for faster loading

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'team') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Debounce search to avoid too many API calls
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    const fetchPlayers = async () => {
      if (!user) return;

      // Use isFetching for subsequent loads, isLoading only for initial load
      if (players.length > 0) {
        setIsFetching(true);
      } else {
        setIsLoading(true);
      }
      
      try {
        // Build query params with filters
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: itemsPerPage.toString(),
        });
        
        if (debouncedSearchTerm) params.append('search', debouncedSearchTerm);
        if (positionFilter) {
          // Check if it's a position group or regular position by checking the value itself
          // Position groups typically have spaces or are longer descriptive names
          const allPositions = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'CF', 'SS'];
          if (allPositions.includes(positionFilter)) {
            params.append('position', positionFilter);
          } else {
            params.append('position_group', positionFilter);
          }
        }
        if (playingStyleFilter) params.append('playing_style', playingStyleFilter);
        if (teamFilter) params.append('team_id', teamFilter);
        if (showStarredOnly) params.append('starred_only', 'true');
        
        const response = await fetchWithTokenRefresh(`/api/players/database?${params.toString()}`,
          { headers: { 'Cache-Control': 'no-cache' } }
        );
        const { success, data } = await response.json();

        if (success && data && data.players) {
          setPlayers(data.players);
          setFilteredPlayers(data.players); // Set filtered players same as players since filtering is server-side
          
          if (data.pagination) {
            setTotalPages(data.pagination.totalPages);
            setTotalPlayers(data.pagination.total);
          }
        } else {
          // If fetch fails, reset to empty arrays
          setPlayers([]);
          setFilteredPlayers([]);
          setTotalPages(1);
          setTotalPlayers(0);
        }
      } catch (err) {
        console.error('Error fetching players:', err);
        // Reset to empty arrays on error
        setPlayers([]);
        setFilteredPlayers([]);
        setTotalPages(1);
        setTotalPlayers(0);
      } finally {
        setIsLoading(false);
        setIsFetching(false);
      }
    };

    fetchPlayers();
  }, [user, currentPage, debouncedSearchTerm, positionFilter, playingStyleFilter, teamFilter, showStarredOnly]);

  // Fetch all positions and position groups for filter dropdowns
  // Start with common positions so dropdowns work immediately
  const [positions, setPositions] = useState<string[]>(['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'CF', 'SS']);
  const [positionGroups, setPositionGroups] = useState<string[]>([]);
  const [allPlayingStyles, setAllPlayingStyles] = useState<string[]>([]); // Store all playing styles
  
  useEffect(() => {
    // Fetch all unique positions and position groups for filter dropdowns
    const fetchFilterOptions = async () => {
      try {
        const response = await fetchWithTokenRefresh('/api/players/filter-options');
        const { success, data } = await response.json();
        if (success) {
          setPositions(data.positions || []);
          setPositionGroups(data.positionGroups || []);
          // Store all playing styles
          if (data.playingStyles) {
            setAllPlayingStyles(data.playingStyles);
            setPlayingStyles(data.playingStyles);
          }
        }
      } catch (err) {
        console.error('Error fetching filter options:', err);
      }
    };
    
    if (user) {
      fetchFilterOptions();
    }
  }, [user]);

  // Fetch playing styles when position changes
  useEffect(() => {
    const fetchPositionPlayingStyles = async () => {
      if (!positionFilter) {
        // No position selected, show all playing styles
        setPlayingStyles(allPlayingStyles);
        return;
      }

      try {
        const allPositions = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'CF', 'SS'];
        const param = allPositions.includes(positionFilter) ? 'position' : 'position_group';
        
        const response = await fetchWithTokenRefresh(`/api/players/filter-options?${param}=${positionFilter}`);
        const { success, data } = await response.json();
        
        if (success && data.playingStyles) {
          setPlayingStyles(data.playingStyles);
          
          // Reset playing style filter if current selection is not available for this position
          if (playingStyleFilter && !data.playingStyles.includes(playingStyleFilter)) {
            setPlayingStyleFilter('');
          }
        }
      } catch (err) {
        console.error('Error fetching position-specific playing styles:', err);
        // Fallback to all playing styles on error
        setPlayingStyles(allPlayingStyles);
      }
    };

    fetchPositionPlayingStyles();
  }, [positionFilter, allPlayingStyles]);

  // Fetch teams for filter from auction DB
  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const response = await fetchWithTokenRefresh('/api/teams/list');
        const { success, data } = await response.json();
        
        if (success && data) {
          setTeams(data);
        }
      } catch (err) {
        console.error('Error fetching teams:', err);
      }
    };
    
    if (user) {
      fetchTeams();
    }
  }, [user]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, positionFilter, playingStyleFilter, teamFilter, showStarredOnly]);

  const toggleStarPlayer = async (playerId: number, event: React.MouseEvent) => {
    event.stopPropagation();
    
    const player = players.find(p => p.id === playerId);
    if (!player) return;

    // Optimistic update - update UI immediately
    const updatePlayer = (p: Player) =>
      p.id === playerId ? { ...p, is_starred: !p.is_starred } : p;
    
    setPlayers(prevPlayers => prevPlayers.map(updatePlayer));
    setFilteredPlayers(prevFiltered => prevFiltered.map(updatePlayer));

    const endpoint = player.is_starred 
      ? `/api/players/unstar/${playerId}` 
      : `/api/players/star/${playerId}`;

    try {
      const response = await fetchWithTokenRefresh(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        // Revert on failure
        const revertPlayer = (p: Player) =>
          p.id === playerId ? { ...p, is_starred: !p.is_starred } : p;
        
        setPlayers(prevPlayers => prevPlayers.map(revertPlayer));
        setFilteredPlayers(prevFiltered => prevFiltered.map(revertPlayer));
        
        showAlert({
          type: 'error',
          title: 'Update Failed',
          message: 'Failed to update starred status. Please try again.'
        });
      }
    } catch (err) {
      console.error('Error toggling star:', err);
      
      // Revert on error
      const revertPlayer = (p: Player) =>
        p.id === playerId ? { ...p, is_starred: !p.is_starred } : p;
      
      setPlayers(prevPlayers => prevPlayers.map(revertPlayer));
      setFilteredPlayers(prevFiltered => prevFiltered.map(revertPlayer));
      
      showAlert({
        type: 'error',
        title: 'Update Failed',
        message: 'Failed to update starred status. Please try again.'
      });
    }
  };

  const getPositionColor = (position: string) => {
    switch (position) {
      case 'GK': return 'bg-amber-50 border border-amber-200 text-amber-800';
      case 'CB': return 'bg-blue-50 border border-blue-200 text-blue-800';
      case 'LB': 
      case 'RB': return 'bg-blue-50 border border-blue-200 text-blue-800';
      case 'DMF': return 'bg-emerald-50 border border-emerald-250 text-emerald-800';
      case 'CMF': return 'bg-emerald-50 border border-emerald-200 text-emerald-800';
      case 'LMF':
      case 'RMF': return 'bg-emerald-50 border border-emerald-200 text-emerald-800';
      case 'AMF': return 'bg-emerald-50 border border-emerald-200 text-emerald-805';
      case 'LWF':
      case 'RWF': return 'bg-rose-50 border border-rose-200 text-rose-800';
      case 'CF': return 'bg-rose-100 border border-rose-250 text-rose-900';
      case 'SS': return 'bg-rose-50 border border-rose-200 text-rose-800';
      default: return 'bg-slate-50 border border-slate-200 text-slate-700';
    }
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 85) return 'bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold';
    if (rating >= 75) return 'bg-blue-50 border border-blue-200 text-blue-800 font-bold';
    if (rating >= 65) return 'bg-amber-50 border border-amber-200 text-amber-800 font-bold';
    return 'bg-slate-50 border border-slate-200 text-slate-600';
  };

  const getStatColor = (stat: number) => {
    if (stat >= 85) return 'text-rose-600 font-bold';
    if (stat >= 80) return 'text-amber-600 font-bold';
    if (stat >= 75) return 'text-emerald-600 font-bold';
    if (stat >= 70) return 'text-blue-600 font-bold';
    return 'text-slate-650';
  };

  const renderPlayerStats = (player: Player) => {
    // Different stats based on position
    if (player.position === 'K' || player.position === 'GK') {
      return (
        <>
          <div className="text-center">
            <span className="block text-[9px] text-slate-400 font-bold uppercase">GK Awareness</span>
            <span className={`block text-sm font-black mt-0.5 ${getStatColor(player.gk_awareness || 0)}`}>
              {player.gk_awareness || '-'}
            </span>
          </div>
          <div className="text-center">
            <span className="block text-[9px] text-slate-400 font-bold uppercase">GK Reflexes</span>
            <span className={`block text-sm font-black mt-0.5 ${getStatColor(player.gk_reflexes || 0)}`}>
              {player.gk_reflexes || '-'}
            </span>
          </div>
          <div className="text-center">
            <span className="block text-[9px] text-slate-400 font-bold uppercase">GK Catching</span>
            <span className={`block text-sm font-black mt-0.5 ${getStatColor(player.gk_catching || 0)}`}>
              {player.gk_catching || '-'}
            </span>
          </div>
        </>
      );
    } else if (['LMF', 'RMF', 'LWF', 'RWF', 'AMF', 'CF', 'SS'].includes(player.position)) {
      return (
        <>
          <div className="text-center">
            <span className="block text-[9px] text-slate-400 font-bold uppercase">Speed</span>
            <span className={`block text-sm font-black mt-0.5 ${getStatColor(player.speed || 0)}`}>
              {player.speed || '-'}
            </span>
          </div>
          <div className="text-center">
            <span className="block text-[9px] text-slate-400 font-bold uppercase">Acceleration</span>
            <span className={`block text-sm font-black mt-0.5 ${getStatColor(player.acceleration || 0)}`}>
              {player.acceleration || '-'}
            </span>
          </div>
          <div className="text-center">
            <span className="block text-[9px] text-slate-400 font-bold uppercase">Ball Control</span>
            <span className={`block text-sm font-black mt-0.5 ${getStatColor(player.ball_control || 0)}`}>
              {player.ball_control || '-'}
            </span>
          </div>
        </>
      );
    } else {
      return (
        <>
          <div className="text-center">
            <span className="block text-[9px] text-slate-400 font-bold uppercase">Speed</span>
            <span className={`block text-sm font-black mt-0.5 ${getStatColor(player.speed || 0)}`}>
              {player.speed || '-'}
            </span>
          </div>
          <div className="text-center">
            <span className="block text-[9px] text-slate-400 font-bold uppercase">Acceleration</span>
            <span className={`block text-sm font-black mt-0.5 ${getStatColor(player.acceleration || 0)}`}>
              {player.acceleration || '-'}
            </span>
          </div>
          <div className="text-center">
            <span className="block text-[9px] text-slate-400 font-bold uppercase">Ball Control</span>
            <span className={`block text-sm font-black mt-0.5 ${getStatColor(player.ball_control || 0)}`}>
              {player.ball_control || '-'}
            </span>
          </div>
        </>
      );
    }
  };

  // Only show full-page loading on initial load
  if (loading || (isLoading && players.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0066FF] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading football players database...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'team') {
    return null;
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-8">
        {/* Subtle loading overlay for filter changes */}
        {isFetching && (
          <div className="fixed top-0 left-0 right-0 z-50 h-1 bg-gray-200">
            <div className="h-full bg-amber-500 animate-pulse" style={{ width: '50%' }}></div>
          </div>
        )}

        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/team"
            className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            {"<-"} Back to Dashboard
          </Link>
        </div>

        {/* Header */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">DATABASE</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              Football Players Database
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Browse the database of football players available for auction.
            </p>
          </div>
          <div className="flex gap-3 shrink-0">
            <button
              onClick={() => {
                const newState = !showShareModal;
                setShowShareModal(newState);
                if (newState) {
                  setSharePlayingStyles(allPlayingStyles);
                  setSharePositions(positions);
                  setSharePositionGroups(positionGroups);
                  setShareFilters({
                    starredFilter: 'all',
                    positionFilter: '',
                    playingStyleFilter: '',
                    teamFilter: ''
                  });
                }
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all"
            >
              <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              <span className="font-mono text-xs uppercase tracking-wider">{showShareModal ? 'Hide Tools' : 'Share / Download'}</span>
            </button>
          </div>
        </div>

        {/* Share to WhatsApp Collapsible Section */}
        {showShareModal && (
          <div className="console-card bg-white border-2 border-green-500/20 rounded-3xl p-6 shadow-sm animate-slideDown">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-6 gap-2">
              <div>
                <span className="text-[10px] text-green-600 font-bold uppercase tracking-wider font-mono">EXPORT UTILITY</span>
                <h3 className="text-lg font-extrabold text-slate-900 flex items-center gap-2 mt-0.5">
                  Share or Download Players
                </h3>
                <p className="text-xs text-slate-400 font-mono">Select filters to customize your player list</p>
              </div>
              {isLoadingShareFilters && (
                <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-600">
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Updating options...
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 font-mono">
              {/* Starred Filter */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Player Selection</label>
                <select
                  value={shareFilters.starredFilter}
                  onChange={async (e) => {
                    const newStarredFilter = e.target.value;
                    setShareFilters({
                      starredFilter: newStarredFilter,
                      positionFilter: '',
                      playingStyleFilter: '',
                      teamFilter: ''
                    });
                    
                    setIsLoadingShareFilters(true);
                    try {
                      const params = new URLSearchParams();
                      if (newStarredFilter === 'starred') params.append('starred_only', 'true');
                      
                      const response = await fetchWithTokenRefresh(`/api/players/filter-options?${params.toString()}`);
                      const { success, data } = await response.json();
                      
                      if (success) {
                        setSharePositions(data.positions || positions);
                        setSharePositionGroups(data.positionGroups || positionGroups);
                        setSharePlayingStyles(data.playingStyles || allPlayingStyles);
                      }
                    } catch (err) {
                      console.error('Error fetching filter options:', err);
                      setSharePositions(positions);
                      setSharePositionGroups(positionGroups);
                      setSharePlayingStyles(allPlayingStyles);
                    } finally {
                      setIsLoadingShareFilters(false);
                    }
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs font-bold"
                >
                  <option value="all">All Players</option>
                  <option value="starred">Starred Players Only</option>
                  <option value="unstarred">Unstarred Players Only</option>
                </select>
              </div>

              {/* Position Filter */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Position</label>
                <select
                  value={shareFilters.positionFilter}
                  onChange={async (e) => {
                    const newPosition = e.target.value;
                    setShareFilters({...shareFilters, positionFilter: newPosition, playingStyleFilter: ''});
                    
                    if (newPosition) {
                      setIsLoadingShareFilters(true);
                      try {
                        const params = new URLSearchParams();
                        const allPositions = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'CF', 'SS'];
                        const param = allPositions.includes(newPosition) ? 'position' : 'position_group';
                        params.append(param, newPosition);
                        if (shareFilters.starredFilter === 'starred') params.append('starred_only', 'true');
                        if (shareFilters.teamFilter) params.append('team_id', shareFilters.teamFilter);
                        
                        const response = await fetchWithTokenRefresh(`/api/players/filter-options?${params.toString()}`);
                        const { success, data } = await response.json();
                        if (success && data.playingStyles) {
                          setSharePlayingStyles(data.playingStyles);
                        }
                      } catch (err) {
                        console.error('Error fetching playing styles:', err);
                        setSharePlayingStyles(shareFilters.starredFilter === 'starred' ? sharePlayingStyles : allPlayingStyles);
                      } finally {
                        setIsLoadingShareFilters(false);
                      }
                    } else {
                      const availableStyles = shareFilters.starredFilter === 'starred' ? sharePlayingStyles : allPlayingStyles;
                      setSharePlayingStyles(availableStyles);
                    }
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs font-bold"
                >
                  <option value="">All Positions</option>
                  <optgroup label="Positions">
                    {sharePositions.map(position => (
                      <option key={position} value={position}>{position}</option>
                    ))}
                  </optgroup>
                  <optgroup label="Position Groups">
                    {sharePositionGroups.map(group => (
                      <option key={group} value={group}>{group}</option>
                    ))}
                  </optgroup>
                </select>
              </div>

              {/* Playing Style Filter */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Playing Style</label>
                <select
                  value={shareFilters.playingStyleFilter}
                  onChange={async (e) => {
                    const newPlayingStyle = e.target.value;
                    setShareFilters({...shareFilters, playingStyleFilter: newPlayingStyle});
                    
                    if (newPlayingStyle || shareFilters.positionFilter || shareFilters.teamFilter) {
                      setIsLoadingShareFilters(true);
                      try {
                        const params = new URLSearchParams();
                        if (shareFilters.starredFilter === 'starred') params.append('starred_only', 'true');
                        if (shareFilters.positionFilter) {
                          const allPositions = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'CF', 'SS'];
                          const param = allPositions.includes(shareFilters.positionFilter) ? 'position' : 'position_group';
                          params.append(param, shareFilters.positionFilter);
                        }
                        if (newPlayingStyle) params.append('playing_style', newPlayingStyle);
                        if (shareFilters.teamFilter) params.append('team_id', shareFilters.teamFilter);
                        
                        const response = await fetchWithTokenRefresh(`/api/players/filter-options?${params.toString()}`);
                        const { success, data } = await response.json();
                        if (success) {
                          if (data.positions) setSharePositions(data.positions);
                          if (data.positionGroups) setSharePositionGroups(data.positionGroups);
                        }
                      } catch (err) {
                        console.error('Error fetching updated positions:', err);
                      } finally {
                        setIsLoadingShareFilters(false);
                      }
                    }
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs font-bold"
                  disabled={shareFilters.positionFilter && sharePlayingStyles.length === 0}
                >
                  <option value="">All Playing Styles</option>
                  {sharePlayingStyles.map(style => (
                    <option key={style} value={style}>{style}</option>
                  ))}
                </select>
                {shareFilters.positionFilter && sharePlayingStyles.length === 0 && (
                  <p className="text-[10px] text-slate-400 mt-1">No playing styles available</p>
                )}
              </div>

              {/* Team Filter */}
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Team</label>
                <select
                  value={shareFilters.teamFilter}
                  onChange={async (e) => {
                    const newTeam = e.target.value;
                    setShareFilters({...shareFilters, teamFilter: newTeam, positionFilter: '', playingStyleFilter: ''});
                    
                    setIsLoadingShareFilters(true);
                    try {
                      const params = new URLSearchParams();
                      if (shareFilters.starredFilter === 'starred') params.append('starred_only', 'true');
                      if (newTeam) params.append('team_id', newTeam);
                      
                      const response = await fetchWithTokenRefresh(`/api/players/filter-options?${params.toString()}`);
                      const { success, data } = await response.json();
                      
                      if (success) {
                        if (data.positions) setSharePositions(data.positions);
                        if (data.positionGroups) setSharePositionGroups(data.positionGroups);
                        if (data.playingStyles) setSharePlayingStyles(data.playingStyles);
                      }
                    } catch (err) {
                      console.error('Error fetching filter options for team:', err);
                      setSharePositions(positions);
                      setSharePositionGroups(positionGroups);
                      setSharePlayingStyles(allPlayingStyles);
                    } finally {
                      setIsLoadingShareFilters(false);
                    }
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-xs font-bold"
                >
                  <option value="">All Teams</option>
                  <option value="free_agent">Free Agents</option>
                  {teams.map(team => (
                    <option key={team.id} value={team.id}>{team.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Share/Download Buttons */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <button
                onClick={async () => {
                  try {
                    const params = new URLSearchParams({ limit: '1000' });
                    if (shareFilters.starredFilter === 'starred') params.append('starred_only', 'true');
                    if (shareFilters.positionFilter) {
                      const allPositions = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'CF', 'SS'];
                      if (allPositions.includes(shareFilters.positionFilter)) {
                        params.append('position', shareFilters.positionFilter);
                      } else {
                        params.append('position_group', shareFilters.positionFilter);
                      }
                    }
                    if (shareFilters.playingStyleFilter) params.append('playing_style', shareFilters.playingStyleFilter);
                    if (shareFilters.teamFilter) params.append('team_id', shareFilters.teamFilter);
                    
                    const response = await fetchWithTokenRefresh(`/api/players/database?${params.toString()}`);
                    const { success, data } = await response.json();
                    
                    if (!success || !data || !data.players) {
                      showAlert({
                        type: 'error',
                        title: 'Error',
                        message: 'Failed to fetch players for sharing.'
                      });
                      return;
                    }
                    
                    let filteredForShare = data.players;
                    if (shareFilters.starredFilter === 'unstarred') {
                      filteredForShare = filteredForShare.filter((player: Player) => !player.is_starred);
                    }
                  
                    if (filteredForShare.length === 0) {
                      showAlert({
                        type: 'error',
                        title: 'No Players Found',
                        message: 'No players match the selected filters.'
                      });
                      return;
                    }

                    let message = `*FOOTBALL PLAYERS DATABASE*\n\n`;
                    const filterInfo = [];
                    if (shareFilters.starredFilter === 'starred') filterInfo.push('Starred Players');
                    if (shareFilters.starredFilter === 'unstarred') filterInfo.push('Unstarred Players');
                    if (shareFilters.positionFilter) filterInfo.push(`Position: ${shareFilters.positionFilter}`);
                    if (shareFilters.playingStyleFilter) filterInfo.push(`Playing Style: ${shareFilters.playingStyleFilter}`);
                    if (shareFilters.teamFilter) {
                      if (shareFilters.teamFilter === 'free_agent') {
                        filterInfo.push('Free Agents Only');
                      } else {
                        const teamName = teams.find(t => t.id === shareFilters.teamFilter)?.name;
                        filterInfo.push(`Team: ${teamName}`);
                      }
                    }
                    
                    if (filterInfo.length > 0) {
                      message += `*Filters Applied:*\n`;
                      filterInfo.forEach(info => {
                        message += `- ${info}\n`;
                      });
                      message += `\n`;
                    }
                    
                    message += `*Total Players: ${filteredForShare.length}*\n`;
                    message += `${'='.repeat(40)}\n\n`;

                    filteredForShare.slice(0, 300).forEach((player: Player, index: number) => {
                      message += `${index + 1}. ${player.name}\n`;
                      message += `   Position: ${player.position} | Overall Rating: ${player.overall_rating}`;
                      if (player.team_name) message += ` | Team: ${player.team_name}`;
                      else message += ` | Status: Free Agent`;
                      message += `\n`;
                      if (player.playing_style) message += `   Playing Style: ${player.playing_style}\n`;
                      if (player.is_starred) message += `   [Starred]\n`;
                      message += `\n`;
                    });

                    if (filteredForShare.length > 300) {
                      message += `\n... and ${filteredForShare.length - 300} more players\n`;
                      message += `\nShowing first 300 players only.\n`;
                    }

                    const encodedMessage = encodeURIComponent(message);
                    const whatsappUrl = `https://wa.me/?text=${encodedMessage}`;
                    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                    if (isMobile) {
                      window.location.href = whatsappUrl;
                    } else {
                      window.open(whatsappUrl, '_blank');
                    }
                    setShowShareModal(false);
                  } catch (error) {
                    console.error('Error generating share message:', error);
                    showAlert({
                      type: 'error',
                      title: 'Error',
                      message: 'Failed to generate share message.'
                    });
                  }
                }}
                className="w-full py-3 bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white rounded-xl transition-all duration-200 font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm hover:scale-[1.01]"
              >
                <svg className="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
                </svg>
                Share to WhatsApp
              </button>
              <button
                onClick={async () => {
                  try {
                    const params = new URLSearchParams({ limit: '1000' });
                    if (shareFilters.starredFilter === 'starred') params.append('starred_only', 'true');
                    if (shareFilters.positionFilter) {
                      const allPositions = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'CF', 'SS'];
                      if (allPositions.includes(shareFilters.positionFilter)) {
                        params.append('position', shareFilters.positionFilter);
                      } else {
                        params.append('position_group', shareFilters.positionFilter);
                      }
                    }
                    if (shareFilters.playingStyleFilter) params.append('playing_style', shareFilters.playingStyleFilter);
                    if (shareFilters.teamFilter) params.append('team_id', shareFilters.teamFilter);
                    
                    const response = await fetchWithTokenRefresh(`/api/players/database?${params.toString()}`);
                    const { success, data } = await response.json();
                    
                    if (!success || !data || !data.players) {
                      showAlert({
                        type: 'error',
                        title: 'Error',
                        message: 'Failed to fetch players for download.'
                      });
                      return;
                    }
                    
                    let filteredForExport = data.players;
                    if (shareFilters.starredFilter === 'unstarred') {
                      filteredForExport = filteredForExport.filter((player: Player) => !player.is_starred);
                    }
                  
                    if (filteredForExport.length === 0) {
                      showAlert({
                        type: 'error',
                        title: 'No Players Found',
                        message: 'No players match the selected filters.'
                      });
                      return;
                    }

                    const exportData = filteredForExport.map((player: Player, index: number) => ({
                      'No.': index + 1,
                      'Player Name': player.name,
                      'Position': player.position,
                      'Position Group': player.position_group || '',
                      'Playing Style': player.playing_style || '',
                      'Overall Rating': player.overall_rating,
                      'Speed': player.speed || '',
                      'Acceleration': player.acceleration || '',
                      'Ball Control': player.ball_control || '',
                      'Dribbling': player.dribbling || '',
                      'Low Pass': player.low_pass || '',
                      'Lofted Pass': player.lofted_pass || '',
                      'Finishing': player.finishing || '',
                      'Tackling': player.tackling || '',
                      'Defensive Awareness': player.defensive_awareness || '',
                      'Stamina': player.stamina || '',
                      'GK Awareness': player.gk_awareness || '',
                      'GK Reflexes': player.gk_reflexes || '',
                      'GK Catching': player.gk_catching || '',
                      'Team': player.team_name || 'Free Agent',
                      'Starred': player.is_starred ? 'Yes' : 'No'
                    }));

                    const ws = XLSX.utils.json_to_sheet(exportData);
                    ws['!cols'] = [
                      { wch: 5 },  { wch: 25 }, { wch: 10 }, { wch: 20 }, { wch: 20 },
                      { wch: 12 }, { wch: 8 },  { wch: 12 }, { wch: 12 }, { wch: 10 },
                      { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 18 },
                      { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }, { wch: 8 }
                    ];

                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Football Players');

                    const timestamp = new Date().toISOString().split('T')[0];
                    let filename = `Football_Players_${timestamp}`;
                    if (shareFilters.starredFilter === 'starred') filename += '_Starred';
                    if (shareFilters.starredFilter === 'unstarred') filename += '_Unstarred';
                    if (shareFilters.positionFilter) filename += `_${shareFilters.positionFilter}`;
                    if (shareFilters.playingStyleFilter) filename += `_${shareFilters.playingStyleFilter.replace(/\s+/g, '_')}`;
                    if (shareFilters.teamFilter === 'free_agent') filename += '_FreeAgents';
                    else if (shareFilters.teamFilter) {
                      const teamName = teams.find(t => t.id === shareFilters.teamFilter)?.name;
                      if (teamName) filename += `_${teamName.replace(/\s+/g, '_')}`;
                    }
                    filename += '.xlsx';

                    XLSX.writeFile(wb, filename);

                    showAlert({
                      type: 'success',
                      title: 'Success',
                      message: `Exported ${filteredForExport.length} players to ${filename}`
                    });
                    setShowShareModal(false);
                  } catch (error) {
                    console.error('Error generating Excel file:', error);
                    showAlert({
                      type: 'error',
                      title: 'Error',
                      message: 'Failed to generate Excel file.'
                    });
                  }
                }}
                className="w-full py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-xl transition-all duration-200 font-mono font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 shadow-sm hover:scale-[1.01]"
              >
                <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                Download Excel
              </button>
            </div>
          </div>
        )}

        {/* Filters Panel */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Search */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">Search Players</label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Search name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-sans"
                />
                <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
            </div>

            {/* Position */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">Position</label>
              <select
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-mono font-bold"
              >
                <option value="">All Positions</option>
                <optgroup label="Positions">
                  {positions.map(position => (
                    <option key={position} value={position}>{position}</option>
                  ))}
                </optgroup>
                <optgroup label="Position Groups">
                  {positionGroups.map(group => (
                    <option key={group} value={group}>{group}</option>
                  ))}
                </optgroup>
              </select>
            </div>

            {/* Playing Style */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">Playing Style</label>
              <select
                value={playingStyleFilter}
                onChange={(e) => setPlayingStyleFilter(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-mono font-bold"
              >
                <option value="">All Playing Styles</option>
                {playingStyles.map(style => (
                  <option key={style} value={style}>{style}</option>
                ))}
              </select>
            </div>

            {/* Team */}
            <div>
              <label className="block text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2">Team / Status</label>
              <select
                value={teamFilter}
                onChange={(e) => setTeamFilter(e.target.value)}
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-sans font-bold"
              >
                <option value="">All Teams</option>
                <option value="free_agent">Free Agents</option>
                {teams.map(team => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Starred Toggle and Stats Count */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white/60 border border-slate-200/60 rounded-3xl p-5 shadow-sm font-mono text-xs">
          <div className="flex items-center space-x-2">
            <input
              type="checkbox"
              id="showStarredOnly"
              checked={showStarredOnly}
              onChange={(e) => setShowStarredOnly(e.target.checked)}
              className="w-4 h-4 text-amber-600 focus:ring-amber-500/20 border-slate-300 rounded cursor-pointer"
            />
            <label htmlFor="showStarredOnly" className="font-bold text-slate-700 cursor-pointer uppercase tracking-wider">
              Show Only Starred Players
            </label>
          </div>
          <div className="font-bold text-slate-400 uppercase tracking-wider">
            Showing {Array.isArray(filteredPlayers) ? filteredPlayers.length : 0} {totalPages > 1 ? `of ${totalPlayers}` : ''} players {(searchTerm || positionFilter || playingStyleFilter || showStarredOnly) ? '(filtered)' : ''}
          </div>
        </div>

        {/* Mobile Card View */}
        <div className="grid grid-cols-1 gap-4 md:hidden">
          {Array.isArray(filteredPlayers) && filteredPlayers.map(player => (
            <div key={player.id} className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm hover:border-amber-400/40 transition-all duration-200">
              <div className="flex items-start justify-between">
                <div className="flex items-center">
                  <div className="flex-shrink-0 mr-3">
                    <div className="relative">
                      <PlayerImage
                        playerId={player.player_id || player.id}
                        playerName={player.name}
                        size={56}
                        className="rounded-full border-2 border-slate-200"
                      />
                      <div className="absolute -bottom-1 -right-1 h-6 w-6 flex items-center justify-center rounded-full bg-slate-800 text-white text-[10px] font-mono font-bold border border-white">
                        {player.overall_rating}
                      </div>
                    </div>
                  </div>
                  <div className="font-mono">
                    <h3 className="text-sm font-bold text-slate-800 leading-tight">{player.name}</h3>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${getPositionColor(player.position)}`}>
                        {(() => {
                          const allPositions = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'CF', 'SS'];
                          return positionFilter && !allPositions.includes(positionFilter) ? player.position_group : player.position;
                        })()}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate max-w-[120px]">{player.playing_style || 'None'}</span>
                    </div>
                    {player.team_name ? (
                      <div className="mt-1 text-[10px] text-slate-500">
                        <span className="font-bold">TEAM:</span> {player.team_name}
                      </div>
                    ) : (
                      <div className="mt-1 text-[10px] text-green-600 font-bold">
                        FREE AGENT
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => toggleStarPlayer(player.id, e)}
                  className={`${player.is_starred ? 'text-yellow-500' : 'text-slate-350'} hover:text-yellow-500 transition-colors duration-200`}
                >
                  <svg className="w-5 h-5" fill={player.is_starred ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                  </svg>
                </button>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 bg-slate-50 border border-slate-100 rounded-2xl p-3 font-mono">
                {renderPlayerStats(player)}
              </div>

              <div className="mt-3">
                <Link href={`/dashboard/team/player/${player.id}`} className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white text-xs font-mono font-bold uppercase tracking-wider rounded-xl transition-colors block text-center shadow-sm">
                  View Details
                </Link>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm hidden md:block overflow-hidden">
          <div className="overflow-x-auto rounded-2xl border border-slate-100 shadow-inner bg-slate-50/50">
            <table className="min-w-full divide-y divide-slate-200/60 font-mono text-xs">
              <thead className="bg-slate-100/80 border-b border-slate-200/60">
                <tr>
                  <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase tracking-wider">Star</th>
                  <th className="px-5 py-3 text-left font-bold text-slate-500 uppercase tracking-wider">Player Name</th>
                  <th className="px-5 py-3 text-left font-bold text-slate-500 uppercase tracking-wider">Current Team</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase tracking-wider">Position</th>
                  <th className="px-5 py-3 text-left font-bold text-slate-500 uppercase tracking-wider">Style</th>
                  <th className="px-4 py-3 text-left font-bold text-slate-500 uppercase tracking-wider">OVR</th>
                  <th className="px-3 py-3 text-left font-bold text-slate-500 uppercase tracking-wider">SPD</th>
                  <th className="px-3 py-3 text-left font-bold text-slate-500 uppercase tracking-wider">ACC</th>
                  <th className="px-3 py-3 text-left font-bold text-slate-500 uppercase tracking-wider">CTL</th>
                  <th className="px-3 py-3 text-left font-bold text-slate-500 uppercase tracking-wider">DRI</th>
                  <th className="px-3 py-3 text-left font-bold text-slate-500 uppercase tracking-wider">PAS</th>
                  <th className="px-3 py-3 text-left font-bold text-slate-500 uppercase tracking-wider">LOF</th>
                  <th className="px-3 py-3 text-left font-bold text-slate-500 uppercase tracking-wider">FIN</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {Array.isArray(filteredPlayers) && filteredPlayers.map(player => (
                  <tr key={player.id} className="hover:bg-slate-50/70 transition-all duration-150">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        onClick={(e) => toggleStarPlayer(player.id, e)}
                        className={`${player.is_starred ? 'text-yellow-500' : 'text-slate-300'} hover:text-yellow-500 transition-colors duration-150`}
                      >
                        <svg className="w-4.5 h-4.5" fill={player.is_starred ? 'currentColor' : 'none'} stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                        </svg>
                      </button>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap">
                      <Link href={`/dashboard/team/player/${player.id}`} className="flex items-center hover:opacity-80 transition-opacity">
                        <div className="shrink-0">
                          <PlayerAvatar
                            playerId={player.player_id || player.id}
                            playerName={player.name}
                            size={32}
                          />
                        </div>
                        <div className="ml-3 font-sans font-semibold text-slate-800 text-sm hover:text-amber-600 transition-colors">
                          {player.name}
                        </div>
                      </Link>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-slate-700 text-[11px]">
                      {player.team_name ? (
                        <span>{player.team_name}</span>
                      ) : (
                        <span className="text-green-600 font-bold uppercase tracking-wider">Free Agent</span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${getPositionColor(player.position)}`}>
                        {(() => {
                          const allPositions = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'CF', 'SS'];
                          return positionFilter && !allPositions.includes(positionFilter) ? player.position_group : player.position;
                        })()}
                      </span>
                    </td>
                    <td className="px-5 py-3 whitespace-nowrap text-slate-500 text-[11px] truncate max-w-[120px]">
                      {player.playing_style || 'None'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${getRatingColor(player.overall_rating)}`}>
                        {player.overall_rating}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-650 font-bold">{player.speed || '-'}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-650 font-bold">{player.acceleration || '-'}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-650 font-bold">{player.ball_control || '-'}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-650 font-bold">{player.dribbling || '-'}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-650 font-bold">{player.low_pass || '-'}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-650 font-bold">{player.lofted_pass || '-'}</td>
                    <td className="px-3 py-3 whitespace-nowrap text-slate-650 font-bold">{player.finishing || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex justify-center items-center gap-2 mt-6">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-sm"
            >
              Previous
            </button>
            
            <div className="flex items-center gap-1.5">
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                let pageNum;
                if (totalPages <= 5) {
                  pageNum = i + 1;
                } else if (currentPage <= 3) {
                  pageNum = i + 1;
                } else if (currentPage >= totalPages - 2) {
                  pageNum = totalPages - 4 + i;
                } else {
                  pageNum = currentPage - 2 + i;
                }
                
                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`px-3.5 py-2 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all border shadow-sm ${
                      currentPage === pageNum
                        ? 'bg-amber-500 border-amber-500 text-slate-900 font-extrabold'
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>
            
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-sm"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Modal Component */}
      <AlertModal
        isOpen={alertState.isOpen}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />
    </div>
  );
}
