'use client';

import { ChevronDown, ChevronUp, Download, Trophy, Search } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { normalizeStr } from '@/lib/utils/normalizeStr';

interface Player {
  player_id: string;
  player_name: string;
  position: string;
  team_id: string;
  team_name: string;
  price: number;
  football_player_id?: string;
  bids?: {
    team_id: string;
    team_name: string;
    amount: number;
    status: string;
    created_at: string;
  }[];
}

interface RoundData {
  round_id: string;
  round_number: number;
  position: string;
  round_type: string;
  status: string;
  end_time: string;
  created_at: string;
  players: Player[];
  total_players: number;
}

interface Season {
  id: string;
  name: string;
  isActive: boolean;
}

export default function FootballPlayerAuctionHistoryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [rounds, setRounds] = useState<RoundData[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [expandedRounds, setExpandedRounds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingSeasons, setIsLoadingSeasons] = useState(true);
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [dataCache, setDataCache] = useState<{ [seasonId: string]: RoundData[] }>({});
  const [globalSearch, setGlobalSearch] = useState('');
  const [roundSearches, setRoundSearches] = useState<{ [roundId: string]: string }>({});
  const [roundPages, setRoundPages] = useState<{ [roundId: string]: number }>({});
  const [expandedPlayers, setExpandedPlayers] = useState<Set<string>>(new Set());
  const PLAYERS_PER_PAGE = 10;

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchSeasons = async () => {
      if (!user) return;

      try {
        setIsLoadingSeasons(true);
        // Fetch all seasons ordered by name descending (latest first)
        const seasonsQuery = query(
          collection(db, 'seasons'),
          orderBy('name', 'desc')
        );
        const seasonsSnapshot = await getDocs(seasonsQuery);

        const seasonsList: Season[] = [];

        seasonsSnapshot.forEach((doc) => {
          const seasonData = doc.data();
          const seasonName = seasonData.name || doc.id;
          
          // Only include S16 and onwards (extract number from SSPSLS16, SSPSLS17, etc.)
          const seasonNumber = parseInt(seasonName.replace(/\D/g, ''));
          if (seasonNumber >= 16) {
            seasonsList.push({
              id: doc.id,
              name: seasonName,
              isActive: seasonData.isActive || false
            });
          }
        });

        setSeasons(seasonsList);

        // Set selected season to first non-active season (most recent completed)
        const firstCompletedSeason = seasonsList.find(s => !s.isActive);
        if (firstCompletedSeason) {
          setSelectedSeason(firstCompletedSeason.id);
        } else if (seasonsList.length > 0) {
          setSelectedSeason(seasonsList[0].id);
        }

      } catch (error) {
        console.error('Error fetching seasons:', error);
      } finally {
        setIsLoadingSeasons(false);
      }
    };

    fetchSeasons();
  }, [user]);

  useEffect(() => {
    const fetchAuctionHistory = async () => {
      if (!user || !selectedSeason) return;

      // Check cache first
      if (dataCache[selectedSeason]) {
        setRounds(dataCache[selectedSeason]);
        if (dataCache[selectedSeason].length > 0) {
          setExpandedRounds(new Set([dataCache[selectedSeason][0].round_id]));
        }
        return;
      }

      try {
        setIsLoading(true);
        
        const response = await fetchWithTokenRefresh(
          `/api/team/footballplayer-auction-history?season_id=${selectedSeason}`
        );
        
        const result = await response.json();

        if (result.success) {
          setRounds(result.data.rounds);
          // Cache the data
          setDataCache(prev => ({
            ...prev,
            [selectedSeason]: result.data.rounds
          }));
          // Auto-expand first round if there are rounds
          if (result.data.rounds.length > 0) {
            setExpandedRounds(new Set([result.data.rounds[0].round_id]));
          }
        } else {
          console.error('Failed to fetch auction history:', result.error, result.details);
          setRounds([]);
        }
      } catch (error) {
        console.error('Error fetching auction history:', error);
        setRounds([]);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAuctionHistory();
  }, [user, selectedSeason, dataCache]);

  const toggleRoundExpand = (roundId: string) => {
    setExpandedRounds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(roundId)) {
        newSet.delete(roundId);
      } else {
        newSet.add(roundId);
      }
      return newSet;
    });
  };

  const togglePlayerExpand = (roundId: string, playerId: string) => {
    const key = `${roundId}_${playerId}`;
    setExpandedPlayers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  const exportRoundToExcel = async (round: RoundData) => {
    if (!round.players.length) return;

    setIsExporting(round.round_id);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      
      // Create worksheet
      const worksheet = workbook.addWorksheet(`Round ${round.round_number}`);
      
      // Set columns
      worksheet.columns = [
        { header: 'Player Name', key: 'playerName', width: 25 },
        { header: 'Position', key: 'position', width: 12 },
        { header: 'Team', key: 'teamName', width: 25 },
        { header: 'Price (£)', key: 'price', width: 15 }
      ];
      
      // Add rows
      round.players.forEach(player => {
        worksheet.addRow({
          playerName: player.player_name,
          position: player.position,
          teamName: player.team_name,
          price: player.price
        });
      });
      
      // Style the header row
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF334155' } // slate-700
      };
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
      
      // Add borders and alignment to all cells
      worksheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          };
          
          if (rowNumber > 1) {
            cell.alignment = { vertical: 'middle' };
          }
        });
      });

      // Create separate sheets for each player with all their bids (normal rounds only)
      if (round.round_type !== 'bulk') {
        const seenNames = new Set<string>();
        
        round.players.forEach(player => {
          let sheetName = player.player_name.replace(/[\\/?*:[\]]/g, '').slice(0, 31);
          if (!sheetName) sheetName = `Player ${player.player_id.slice(0, 6)}`;
          if (seenNames.has(sheetName.toLowerCase())) {
            sheetName = sheetName.slice(0, 27) + ` (${seenNames.size})`;
          }
          seenNames.add(sheetName.toLowerCase());
          
          const playerSheet = workbook.addWorksheet(sheetName);
          
          // Set columns for player bids
          playerSheet.columns = [
            { header: 'Team Name', key: 'teamName', width: 25 },
            { header: 'Bid Amount (£)', key: 'amount', width: 18 },
            { header: 'Status', key: 'status', width: 12 },
            { header: 'Bid Time', key: 'bidTime', width: 20 }
          ];
          
          // Add rows for bids
          if (player.bids && player.bids.length > 0) {
            player.bids.forEach((bid: any) => {
              playerSheet.addRow({
                teamName: bid.team_name,
                amount: bid.amount,
                status: bid.status === 'won' ? 'WON' : 'LOST',
                bidTime: bid.created_at ? new Date(bid.created_at).toLocaleString() : 'N/A'
              });
            });
          } else {
            // Fallback to the winning bid if no bids list populated
            playerSheet.addRow({
              teamName: player.team_name,
              amount: player.price,
              status: 'WON',
              bidTime: 'N/A'
            });
          }
          
          // Style player sheet header
          playerSheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
          playerSheet.getRow(1).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF1E293B' } // slate-800
          };
          playerSheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' };
          
          // Style rows
          playerSheet.eachRow((row, rowNumber) => {
            row.eachCell((cell) => {
              cell.border = {
                top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
                right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
              };
              if (rowNumber > 1) {
                cell.alignment = { vertical: 'middle' };
              }
            });
          });
        });
      }
      
      // Generate Excel file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      // Download file
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const seasonName = seasons.find(s => s.id === selectedSeason)?.name || selectedSeason;
      link.download = `auction_round_${round.round_number}_${round.position}_${seasonName}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export data. Please try again.');
    } finally {
      setIsExporting(null);
    }
  };

  const getPositionColor = (position: string) => {
    switch (position) {
      case 'GK':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200';
      case 'DEF':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'MID':
        return 'bg-green-50 text-green-700 border-green-200';
      case 'FWD':
        return 'bg-red-50 text-red-700 border-red-200';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200';
    }
  };

  // Filter and paginate players
  const getFilteredAndPaginatedPlayers = (round: RoundData) => {
    const roundSearch = roundSearches[round.round_id] || '';
    const searchTerm = globalSearch || roundSearch;
    
    // Filter players
    let filtered = round.players;
    if (searchTerm) {
      filtered = filtered.filter(player => 
        normalizeStr(player.player_name).includes(normalizeStr(searchTerm)) ||
        normalizeStr(player.team_name).includes(normalizeStr(searchTerm)) ||
        normalizeStr(player.position).includes(normalizeStr(searchTerm))
      );
    }

    // Paginate
    const currentPage = roundPages[round.round_id] || 1;
    const startIndex = (currentPage - 1) * PLAYERS_PER_PAGE;
    const endIndex = startIndex + PLAYERS_PER_PAGE;
    const paginated = filtered.slice(startIndex, endIndex);
    const totalPages = Math.ceil(filtered.length / PLAYERS_PER_PAGE);

    return { players: paginated, totalPages, totalFiltered: filtered.length };
  };

  const setRoundSearch = (roundId: string, search: string) => {
    setRoundSearches(prev => ({ ...prev, [roundId]: search }));
    setRoundPages(prev => ({ ...prev, [roundId]: 1 })); // Reset to page 1
  };

  const setRoundPage = (roundId: string, page: number) => {
    setRoundPages(prev => ({ ...prev, [roundId]: page }));
  };

  if (isLoadingSeasons) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading Seasons...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 space-y-6">
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 gap-4 flex-wrap font-mono">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-wider text-slate-800">
                Football Player Auction History
              </h1>
              <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                View all player acquisitions by round
              </p>
            </div>
            <Link
              href="/dashboard/team"
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-bold"
            >
              Back
            </Link>
          </div>

          {/* Season Filter */}
          <div className="mb-6 font-mono">
            <h3 className="text-[10px] uppercase font-bold text-slate-400 mb-3 tracking-wider">Filter by Season</h3>
            <div className="flex flex-wrap gap-2">
              {seasons.map(season => (
                <button
                  key={season.id}
                  onClick={() => setSelectedSeason(season.id)}
                  disabled={isLoading}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all border ${
                    selectedSeason === season.id
                      ? 'bg-slate-800 text-white border-slate-900 shadow-sm'
                      : 'bg-white text-slate-500 border-slate-200/60 hover:bg-slate-50'
                  } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  {season.name}
                  {season.isActive && (
                    <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-emerald-500 text-white">
                      ACTIVE
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Global Search Bar */}
          {!isLoading && rounds.length > 0 && (
            <div className="mb-6">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search all players, teams, or positions..."
                  value={globalSearch}
                  onChange={(e) => {
                    setGlobalSearch(e.target.value);
                    // Reset all round pages when global search changes
                    setRoundPages({});
                  }}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono text-sm"
                />
              </div>
            </div>
          )}

          {/* Loading indicator for data fetch */}
          {isLoading && (
            <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-2xl">
              <div className="flex items-center gap-3">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                <p className="text-sm text-blue-800 font-mono font-bold">Loading auction data...</p>
              </div>
            </div>
          )}

          {/* No rounds message */}
          {!isLoading && rounds.length === 0 ? (
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-12 text-center shadow-sm">
              <div className="inline-flex items-center justify-center p-4 bg-slate-50 border border-slate-200/60 rounded-full mb-4">
                <Trophy className="w-12 h-12 text-slate-400" />
              </div>
              <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider mb-2">No Auction Data</h2>
              <p className="text-xs text-slate-500 uppercase font-semibold">
                No completed rounds found for this season
              </p>
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                <div className="console-card bg-gradient-to-br from-blue-50 to-white border border-blue-100 rounded-2xl p-4">
                  <p className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">Total Rounds</p>
                  <p className="text-2xl font-black text-blue-600 mt-2 font-mono">{rounds.length}</p>
                </div>
                <div className="console-card bg-gradient-to-br from-purple-50 to-white border border-purple-100 rounded-2xl p-4">
                  <p className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">Total Players Sold</p>
                  <p className="text-2xl font-black text-purple-600 mt-2 font-mono">
                    {rounds.reduce((sum, r) => sum + r.total_players, 0)}
                  </p>
                </div>
                <div className="console-card bg-gradient-to-br from-emerald-50 to-white border border-emerald-100 rounded-2xl p-4 col-span-2 sm:col-span-1">
                  <p className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">Avg Players/Round</p>
                  <p className="text-2xl font-black text-emerald-600 mt-2 font-mono">
                    {rounds.length > 0 ? Math.round(rounds.reduce((sum, r) => sum + r.total_players, 0) / rounds.length) : 0}
                  </p>
                </div>
              </div>

              {/* Rounds List */}
              <div className="space-y-4">
                {rounds.map(round => {
                  const isExpanded = expandedRounds.has(round.round_id);

                  return (
                    <div
                      key={round.round_id}
                      className="console-card bg-white border border-slate-200/60 rounded-2xl overflow-hidden transition-all duration-200 shadow-sm hover:shadow-md"
                    >
                      {/* Round Header - Clickable */}
                      <button
                        onClick={() => toggleRoundExpand(round.round_id)}
                        className="w-full p-4 sm:p-5 flex items-center justify-between hover:bg-slate-50/50 transition-colors text-left"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0 font-mono">
                          {/* Round Number Badge */}
                          <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl flex items-center justify-center bg-gradient-to-br from-amber-400 to-amber-500 border-2 border-amber-600 shadow-md shrink-0">
                            <span className="text-white font-black text-base sm:text-lg">{round.round_number}</span>
                          </div>

                          {/* Round Info */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <h3 className="font-extrabold text-slate-800 text-base sm:text-lg uppercase tracking-wide">
                                Round {round.round_number}
                              </h3>
                              <span className="px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                                {round.position}
                              </span>
                              <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold uppercase tracking-wider border ${
                                round.round_type === 'bulk' 
                                  ? 'bg-purple-50 text-purple-700 border-purple-200' 
                                  : 'bg-blue-50 text-blue-700 border-blue-200'
                              }`}>
                                {round.round_type}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 uppercase font-bold mt-1 tracking-wider">
                              {round.total_players} player{round.total_players !== 1 ? 's' : ''} sold
                              {round.end_time && ` • Ended ${new Date(round.end_time).toLocaleDateString()}`}
                            </p>
                          </div>
                        </div>

                        {/* Expand/Collapse Icon */}
                        <div className="ml-3 shrink-0">
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-slate-400" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400" />
                          )}
                        </div>
                      </button>

                      {/* Expanded Content - Players List */}
                      {isExpanded && (() => {
                        const { players: filteredPlayers, totalPages, totalFiltered } = getFilteredAndPaginatedPlayers(round);
                        const currentPage = roundPages[round.round_id] || 1;
                        const roundSearch = roundSearches[round.round_id] || '';

                        return (
                        <div className="border-t border-slate-100 bg-slate-50/30">
                          {/* Search Bar and Export Button */}
                          {round.players.length > 0 && (
                            <div className="px-4 sm:px-5 pt-4 pb-2 flex flex-col sm:flex-row gap-3 justify-between">
                              {/* Round-specific Search */}
                              {!globalSearch && (
                                <div className="relative flex-1 max-w-md">
                                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" />
                                  <input
                                    type="text"
                                    placeholder="Search in this round..."
                                    value={roundSearch}
                                    onChange={(e) => setRoundSearch(round.round_id, e.target.value)}
                                    className="w-full pl-10 pr-4 py-1.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 font-mono text-xs"
                                  />
                                </div>
                              )}
                              
                              <button
                                onClick={() => exportRoundToExcel(round)}
                                disabled={isExporting === round.round_id}
                                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer disabled:cursor-not-allowed"
                              >
                                {isExporting === round.round_id ? (
                                  <>
                                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                                    Exporting...
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-3.5 h-3.5" />
                                    Export to Excel
                                  </>
                                )}
                              </button>
                            </div>
                          )}

                          {/* Filtered Count */}
                          {(globalSearch || roundSearch) && (
                            <div className="px-4 sm:px-5 pb-2">
                              <p className="text-xs text-slate-500 font-mono">
                                Showing {totalFiltered} of {round.total_players} players
                              </p>
                            </div>
                          )}

                          {/* Players Table */}
                          <div className="px-4 sm:px-5 pb-4">
                            {filteredPlayers.length === 0 ? (
                              <p className="text-center text-sm text-slate-400 py-8 font-mono">
                                {round.players.length === 0 ? 'No players sold in this round' : 'No players match your search'}
                              </p>
                            ) : (
                              <div className="space-y-2">
                                {filteredPlayers.map((player) => {
                                  const isPlayerExpanded = expandedPlayers.has(`${round.round_id}_${player.player_id}`);
                                  const hasBids = round.round_type !== 'bulk' && player.bids && player.bids.length > 0;
                                  
                                  return (
                                    <div
                                      key={player.player_id}
                                      className="bg-white border border-slate-200/60 rounded-xl p-3 sm:p-4 hover:shadow-sm transition-shadow"
                                    >
                                      <div 
                                        className={`flex items-center justify-between gap-3 flex-wrap font-mono ${hasBids ? 'cursor-pointer select-none' : ''}`}
                                        onClick={() => hasBids && togglePlayerExpand(round.round_id, player.player_id)}
                                      >
                                        {/* Player Info */}
                                        <div className="flex items-center gap-3 flex-1 min-w-0">
                                          {/* Player Photo */}
                                          {player.football_player_id ? (
                                            <img
                                              src={`/images/players/${player.football_player_id}.webp`}
                                              alt={player.player_name}
                                              onError={(e) => {
                                                const img = e.currentTarget;
                                                img.style.display = 'none';
                                                const badge = img.nextElementSibling as HTMLElement;
                                                if (badge) badge.style.display = 'flex';
                                              }}
                                              className="w-10 h-10 rounded-lg object-cover border border-slate-200 shrink-0"
                                            />
                                          ) : null}
                                          <div 
                                            className={`w-10 h-10 rounded-lg flex items-center justify-center border font-bold text-[10px] uppercase tracking-wider shrink-0 ${getPositionColor(player.position)}`}
                                            style={{ display: player.football_player_id ? 'none' : 'flex' }}
                                          >
                                            {player.position}
                                          </div>

                                          {/* Name and Team */}
                                          <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2">
                                              <h4 className="font-extrabold text-slate-800 text-sm uppercase tracking-wide truncate">
                                                {player.player_name}
                                              </h4>
                                              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider shrink-0 ${getPositionColor(player.position)}`}>
                                                {player.position}
                                              </span>
                                            </div>
                                            <p className="text-xs text-slate-500 uppercase font-bold mt-0.5 truncate">
                                              {player.team_name}
                                            </p>
                                          </div>
                                        </div>

                                        {/* Price & Chevron */}
                                        <div className="flex items-center gap-2 shrink-0">
                                          <span className="px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-black text-sm">
                                            £{player.price.toLocaleString()}
                                          </span>
                                          {hasBids && (
                                            <div className="text-slate-400">
                                              {isPlayerExpanded ? (
                                                <ChevronUp className="w-4 h-4" />
                                              ) : (
                                                <ChevronDown className="w-4 h-4" />
                                              )}
                                            </div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Bids List for Normal Rounds (Expanded state) */}
                                      {hasBids && isPlayerExpanded && (
                                        <div className="mt-3 pt-3 border-t border-slate-100 font-mono text-xs">
                                          <div className="text-slate-400 font-bold uppercase tracking-wider mb-2">Bids History</div>
                                          <div className="space-y-1.5">
                                            {player.bids!.map((bid, idx) => (
                                              <div key={idx} className="flex justify-between items-center py-1.5 px-2.5 rounded-lg bg-slate-50 hover:bg-slate-100/80 transition-colors">
                                                <span className="text-slate-600 font-medium">{bid.team_name}</span>
                                                <div className="flex items-center gap-2">
                                                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${bid.status === 'won' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'}`}>
                                                    {bid.status === 'won' ? 'Won' : 'Lost'}
                                                  </span>
                                                  <span className="font-bold text-slate-700">£{bid.amount.toLocaleString()}</span>
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Pagination */}
                            {totalPages > 1 && (
                              <div className="mt-4 flex items-center justify-center gap-2">
                                <button
                                  onClick={() => setRoundPage(round.round_id, currentPage - 1)}
                                  disabled={currentPage === 1}
                                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-mono text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                                >
                                  Previous
                                </button>
                                
                                <span className="text-xs font-mono text-slate-600 font-bold">
                                  Page {currentPage} of {totalPages}
                                </span>
                                
                                <button
                                  onClick={() => setRoundPage(round.round_id, currentPage + 1)}
                                  disabled={currentPage === totalPages}
                                  className="px-3 py-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-mono text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50"
                                >
                                  Next
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
