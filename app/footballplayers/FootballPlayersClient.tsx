'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import PlayerImage, { PlayerAvatar } from '@/components/PlayerImage';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import * as XLSX from 'xlsx';
import { 
  ArrowLeft, 
  Search, 
  Share2, 
  Download, 
  ChevronLeft, 
  ChevronRight, 
  Filter
} from 'lucide-react';

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
  team_id?: string;
  team_name?: string;
}

export default function PublicPlayerDatabasePage() {
  const { alertState, showAlert, closeAlert } = useModal();
  const [players, setPlayers] = useState<Player[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [positionFilter, setPositionFilter] = useState('');
  const [playingStyleFilter, setPlayingStyleFilter] = useState('');
  const [teamFilter, setTeamFilter] = useState('');
  const [teams, setTeams] = useState<Array<{id: string; name: string}>>([]);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareFilters, setShareFilters] = useState({
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
  const itemsPerPage = 25;

  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchTerm]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [currentPage]);

  useEffect(() => {
    const fetchPlayers = async () => {
      if (players.length > 0) {
        setIsFetching(true);
      } else {
        setIsLoading(true);
      }
      
      try {
        const params = new URLSearchParams({
          page: currentPage.toString(),
          limit: itemsPerPage.toString(),
        });
        
        if (debouncedSearchTerm) params.append('search', debouncedSearchTerm);
        if (positionFilter) {
          const allPositions = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'CF', 'SS'];
          if (allPositions.includes(positionFilter)) {
            params.append('position', positionFilter);
          } else {
            params.append('position_group', positionFilter);
          }
        }
        if (playingStyleFilter) params.append('playing_style', playingStyleFilter);
        if (teamFilter) params.append('team_id', teamFilter);
        
        const response = await fetch(`/api/players/database?${params.toString()}`, {
          headers: { 'Cache-Control': 'no-cache' }
        });
        const { success, data } = await response.json();

        if (success && data && data.players) {
          setPlayers(data.players);
          setFilteredPlayers(data.players);
          
          if (data.pagination) {
            setTotalPages(data.pagination.totalPages);
            setTotalPlayers(data.pagination.total);
          }
        } else {
          setPlayers([]);
          setFilteredPlayers([]);
          setTotalPages(1);
          setTotalPlayers(0);
        }
      } catch (err) {
        console.error('Error fetching players:', err);
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
  }, [currentPage, debouncedSearchTerm, positionFilter, playingStyleFilter, teamFilter]);

  const [positions, setPositions] = useState<string[]>(['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'CF', 'SS']);
  const [positionGroups, setPositionGroups] = useState<string[]>([]);
  const [allPlayingStyles, setAllPlayingStyles] = useState<string[]>([]);
  
  useEffect(() => {
    const fetchFilterOptions = async () => {
      try {
        const response = await fetch('/api/players/filter-options');
        const { success, data } = await response.json();
        if (success) {
          setPositions(data.positions || []);
          setPositionGroups(data.positionGroups || []);
          if (data.playingStyles) {
            setAllPlayingStyles(data.playingStyles);
            setPlayingStyles(data.playingStyles);
          }
        }
      } catch (err) {
        console.error('Error fetching filter options:', err);
      }
    };
    
    fetchFilterOptions();
  }, []);

  useEffect(() => {
    const fetchPositionPlayingStyles = async () => {
      if (!positionFilter) {
        setPlayingStyles(allPlayingStyles);
        return;
      }

      try {
        const allPositions = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'CF', 'SS'];
        const param = allPositions.includes(positionFilter) ? 'position' : 'position_group';
        
        const response = await fetch(`/api/players/filter-options?${param}=${positionFilter}`);
        const { success, data } = await response.json();
        
        if (success && data.playingStyles) {
          setPlayingStyles(data.playingStyles);
          
          if (playingStyleFilter && !data.playingStyles.includes(playingStyleFilter)) {
            setPlayingStyleFilter('');
          }
        }
      } catch (err) {
        console.error('Error fetching position-specific playing styles:', err);
        setPlayingStyles(allPlayingStyles);
      }
    };

    fetchPositionPlayingStyles();
  }, [positionFilter, allPlayingStyles]);

  useEffect(() => {
    const fetchTeams = async () => {
      try {
        const response = await fetch('/api/teams/list');
        const { success, data } = await response.json();
        
        if (success && data) {
          setTeams(data);
        }
      } catch (err) {
        console.error('Error fetching teams:', err);
      }
    };
    
    fetchTeams();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, positionFilter, playingStyleFilter, teamFilter]);

  const getPositionColor = (position: string) => {
    switch (position) {
      case 'GK': return 'bg-amber-50 border border-amber-200 text-amber-800';
      case 'CB': return 'bg-blue-50 border border-blue-200 text-blue-800';
      case 'LB': 
      case 'RB': return 'bg-blue-50 border border-blue-200 text-blue-800';
      case 'DMF': return 'bg-emerald-50 border border-emerald-255 text-emerald-800';
      case 'CMF': return 'bg-emerald-50 border border-emerald-200 text-emerald-800';
      case 'LMF':
      case 'RMF': return 'bg-emerald-50 border border-emerald-200 text-emerald-800';
      case 'AMF': return 'bg-emerald-50 border border-emerald-200 text-emerald-805';
      case 'LWF':
      case 'RWF': return 'bg-rose-50 border border-rose-200 text-rose-800';
      case 'CF': return 'bg-rose-100 border border-rose-255 text-rose-900';
      case 'SS': return 'bg-rose-50 border border-rose-200 text-rose-800';
      default: return 'bg-slate-50 border border-slate-200 text-slate-700';
    }
  };

  const getRatingColor = (rating: number) => {
    if (rating >= 85) return 'bg-emerald-50 border border-emerald-200 text-emerald-800 font-bold';
    if (rating >= 75) return 'bg-blue-50 border border-blue-200 text-blue-800 font-bold';
    if (rating >= 65) return 'bg-amber-50 border border-amber-200 text-amber-800 font-bold';
    return 'bg-slate-50 border border-slate-200 text-slate-650';
  };

  const getStatColor = (stat: number) => {
    if (stat >= 85) return 'text-rose-600 font-bold';
    if (stat >= 80) return 'text-amber-605 font-bold';
    if (stat >= 75) return 'text-emerald-605 font-bold';
    if (stat >= 70) return 'text-blue-605 font-bold';
    return 'text-slate-650';
  };

  const renderPlayerStats = (player: Player) => {
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

  if (isLoading && players.length === 0) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0066FF] mx-auto"></div>
          <p className="mt-4 text-gray-650 font-mono text-sm">Loading football players database...</p>
        </div>
      </div>
    );
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
            href="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Home
          </Link>
        </div>

        {/* Header */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">PUBLIC DATABASE</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              Football Players Database
            </h1>
            <p className="text-xs text-slate-405 font-mono mt-1">
              Browse the database of football players.
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
                    positionFilter: '',
                    playingStyleFilter: '',
                    teamFilter: ''
                  });
                }
              }}
              className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all"
            >
              <Share2 className="w-4 h-4 text-green-500" />
              <span className="font-mono text-xs uppercase tracking-wider">{showShareModal ? 'Hide Tools' : 'Share / Download'}</span>
            </button>
          </div>
        </div>

        {/* Share/Export Collapsible Section */}
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

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 font-mono">
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
                        if (shareFilters.teamFilter) params.append('team_id', shareFilters.teamFilter);
                        
                        const response = await fetch(`/api/players/filter-options?${params.toString()}`);
                        const { success, data } = await response.json();
                        if (success && data.playingStyles) {
                          setSharePlayingStyles(data.playingStyles);
                        }
                      } catch (err) {
                        console.error('Error fetching playing styles:', err);
                        setSharePlayingStyles(allPlayingStyles);
                      } finally {
                        setIsLoadingShareFilters(false);
                      }
                    } else {
                      setSharePlayingStyles(allPlayingStyles);
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
                        if (shareFilters.positionFilter) {
                          const allPositions = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'CF', 'SS'];
                          const param = allPositions.includes(shareFilters.positionFilter) ? 'position' : 'position_group';
                          params.append(param, shareFilters.positionFilter);
                        }
                        if (newPlayingStyle) params.append('playing_style', newPlayingStyle);
                        if (shareFilters.teamFilter) params.append('team_id', shareFilters.teamFilter);
                        
                        const response = await fetch(`/api/players/filter-options?${params.toString()}`);
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
                      if (newTeam) params.append('team_id', newTeam);
                      
                      const response = await fetch(`/api/players/filter-options?${params.toString()}`);
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
                    
                    const response = await fetch(`/api/players/database?${params.toString()}`);
                    const { success, data } = await response.json();
                    
                    if (!success || !data || !data.players) {
                      showAlert({
                        type: 'error',
                        title: 'Error',
                        message: 'Failed to fetch players for sharing.'
                      });
                      return;
                    }
                    
                    const filteredForShare = data.players;
                  
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
                    message += `${'=' .repeat(40)}\n\n`;

                    filteredForShare.slice(0, 300).forEach((player: Player, index: number) => {
                      message += `${index + 1}. ${player.name}\n`;
                      message += `   Position: ${player.position} | Overall Rating: ${player.overall_rating}`;
                      if (player.team_name) message += ` | Team: ${player.team_name}`;
                      else message += ` | Status: Free Agent`;
                      message += `\n`;
                      if (player.playing_style) message += `   Playing Style: ${player.playing_style}\n`;
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
                <Share2 className="w-4 h-4" />
                Share to WhatsApp
              </button>
              <button
                onClick={async () => {
                  try {
                    const params = new URLSearchParams({ limit: '1000' });
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
                    
                    const response = await fetch(`/api/players/database?${params.toString()}`);
                    const { success, data } = await response.json();
                    
                    if (!success || !data || !data.players) {
                      showAlert({
                        type: 'error',
                        title: 'Error',
                        message: 'Failed to fetch players for download.'
                      });
                      return;
                    }
                    
                    const filteredForExport = data.players;
                  
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
                      'Team': player.team_name || 'Free Agent'
                    }));

                    const ws = XLSX.utils.json_to_sheet(exportData);
                    ws['!cols'] = [
                      { wch: 5 },  { wch: 25 }, { wch: 10 }, { wch: 20 }, { wch: 20 },
                      { wch: 12 }, { wch: 8 },  { wch: 12 }, { wch: 12 }, { wch: 10 },
                      { wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 10 }, { wch: 18 },
                      { wch: 10 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 20 }
                    ];

                    const wb = XLSX.utils.book_new();
                    XLSX.utils.book_append_sheet(wb, ws, 'Football Players');

                    const timestamp = new Date().toISOString().split('T')[0];
                    let filename = `Football_Players_${timestamp}`;
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
                <Download className="w-4 h-4" />
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
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
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

        {/* Stats Count */}
        <div className="flex justify-end items-center bg-white/60 border border-slate-200/60 rounded-3xl p-5 shadow-sm font-mono text-xs">
          <div className="font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            Showing {Array.isArray(filteredPlayers) ? filteredPlayers.length : 0} {totalPages > 1 ? `of ${totalPlayers}` : ''} players {(searchTerm || positionFilter || playingStyleFilter || teamFilter) ? '(filtered)' : ''}
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
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 bg-slate-50 border border-slate-100 rounded-2xl p-3 font-mono">
                {renderPlayerStats(player)}
              </div>

              <div className="mt-3">
                <Link href={`/footballplayers/${player.id}`} className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-white text-xs font-mono font-bold uppercase tracking-wider rounded-xl transition-colors block text-center shadow-sm">
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
                    <td className="px-5 py-3 whitespace-nowrap">
                      <Link href={`/footballplayers/${player.id}`} className="flex items-center hover:opacity-80 transition-opacity">
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
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-sm flex items-center gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Previous
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
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-sm flex items-center gap-1"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
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
