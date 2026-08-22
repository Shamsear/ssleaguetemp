'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { BarChart2 } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import { Download, FileSpreadsheet, AlertTriangle, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

interface SeasonStats {
  season_id: string;
  season_name: string;
  team_name: string | null;
  category: string;
  points: number;
  matches_played: number;
  goals_scored: number;
  assists: number;
  clean_sheets: number;
  wins: number;
  draws: number;
  losses: number;
  base_price: number;
  price: number;
}

interface PlayerData {
  player_id: string;
  player_name: string;
  seasons: Map<string, SeasonStats>;
}

export default function ExportPlayersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { isCommitteeAdmin, userSeasonId } = usePermissions();

  const [seasons, setSeasons] = useState<any[]>([]);
  const [selectedSeasons, setSelectedSeasons] = useState<string[]>([]);
  const [players, setPlayers] = useState<Map<string, PlayerData>>(new Map());
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && !isCommitteeAdmin) {
      router.push('/dashboard');
    }
  }, [user, loading, router, isCommitteeAdmin]);

  // Fetch available seasons
  useEffect(() => {
    const fetchSeasons = async () => {
      try {
        const { collection, getDocs, orderBy, query } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase/config');

        const seasonsQuery = query(
          collection(db, 'seasons'),
          orderBy('created_at', 'desc')
        );

        const seasonsSnapshot = await getDocs(seasonsQuery);
        const seasonsData = seasonsSnapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            // Use name if exists, otherwise format ID nicely (SSPSLS18 -> Season 18)
            displayName: data.name || doc.id.replace('SSPSLS', 'Season '),
          };
        });

        // Sort by season number (extract number from ID)
        seasonsData.sort((a, b) => {
          const numA = parseInt(a.id.replace(/\D/g, '')) || 0;
          const numB = parseInt(b.id.replace(/\D/g, '')) || 0;
          return numA - numB;
        });

        setSeasons(seasonsData);
        
        // Set current season as default
        if (userSeasonId) {
          setSelectedSeasons([userSeasonId]);
        }
      } catch (error) {
        console.error('Error fetching seasons:', error);
      }
    };

    if (isCommitteeAdmin) {
      fetchSeasons();
    }
  }, [isCommitteeAdmin, userSeasonId]);

  const toggleSeason = (seasonId: string) => {
    setSelectedSeasons(prev => {
      if (prev.includes(seasonId)) {
        return prev.filter(s => s !== seasonId);
      } else {
        return [...prev, seasonId];
      }
    });
  };

  const selectAllSeasons = () => {
    setSelectedSeasons(seasons.map(s => s.id));
  };

  const clearAllSeasons = () => {
    setSelectedSeasons([]);
  };

  const fetchPlayers = async () => {
    if (selectedSeasons.length === 0) {
      setError('Please select at least one season');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      // Step 1: Get players registered in current admin season (base season)
      const baseSeasonResponse = await fetchWithTokenRefresh(
        `/api/realplayers/season-players?seasonId=${userSeasonId}`
      );
      const baseSeasonResult = await baseSeasonResponse.json();

      if (!baseSeasonResult.success || !baseSeasonResult.data) {
        setError('Failed to load players from current season');
        setIsLoading(false);
        return;
      }

      // Get unique player IDs from base season
      const basePlayerIds = new Set<string>();
      baseSeasonResult.data.forEach((p: any) => {
        if (p.player_id) {
          basePlayerIds.add(p.player_id);
        }
      });

      console.log(`Found ${basePlayerIds.size} players registered in ${userSeasonId}`);

      // Step 2: Fetch stats for these players from all selected seasons
      const playersMap = new Map<string, PlayerData>();

      // Initialize all players from base season
      baseSeasonResult.data.forEach((p: any) => {
        const playerId = p.player_id || '';
        const playerName = p.player_name || '';

        if (playerId && basePlayerIds.has(playerId)) {
          playersMap.set(playerId, {
            player_id: playerId,
            player_name: playerName,
            seasons: new Map(),
          });
        }
      });

      for (const seasonId of selectedSeasons) {
        const response = await fetchWithTokenRefresh(
          `/api/realplayers/season-players?seasonId=${seasonId}`
        );
        const result = await response.json();

        if (result.success && result.data) {
          const seasonName = seasons.find(s => s.id === seasonId)?.displayName || seasons.find(s => s.id === seasonId)?.name || seasonId.replace('SSPSLS', 'Season ');

          // Only include players that are in the base season
          result.data.forEach((p: any) => {
            const playerId = p.player_id || '';

            if (!playerId || !basePlayerIds.has(playerId)) {
              return; // Skip players not in base season
            }

            const playerData = playersMap.get(playerId)!;
            
            // Add season stats
            playerData.seasons.set(seasonId, {
              season_id: seasonId,
              season_name: seasonName,
              team_name: p.team_name || 'Unassigned',
              category: p.category || 'N/A',
              points: parseInt(p.points) || 0,
              matches_played: parseInt(p.matches_played) || 0,
              goals_scored: parseInt(p.goals_scored) || 0,
              assists: parseInt(p.assists) || 0,
              clean_sheets: parseInt(p.clean_sheets) || 0,
              wins: parseInt(p.wins) || 0,
              draws: parseInt(p.draws) || 0,
              losses: parseInt(p.losses) || 0,
              base_price: parseInt(p.base_price) || 0,
              price: parseInt(p.price) || 0,
            });
          });
        }
      }

      // Count players with no stats in any selected season
      let playersWithNoStats = 0;
      playersMap.forEach(player => {
        if (player.seasons.size === 0) {
          playersWithNoStats++;
        }
      });

      setPlayers(playersMap);
      setSuccess(
        `Loaded ${playersMap.size} players registered in ${userSeasonId} with stats from ${selectedSeasons.length} season(s)` +
        (playersWithNoStats > 0 ? ` (${playersWithNoStats} players with no stats in selected seasons)` : '')
      );
    } catch (error: any) {
      console.error('Error fetching players:', error);
      setError('Failed to fetch players');
    } finally {
      setIsLoading(false);
    }
  };

  const exportToExcel = async () => {
    if (players.size === 0) {
      setError('No players to export. Please load data first.');
      return;
    }

    try {
      // Sort selected seasons by number for consistent column order
      const sortedSeasons = [...selectedSeasons].sort((a, b) => {
        const numA = parseInt(a.replace(/\D/g, '')) || 0;
        const numB = parseInt(b.replace(/\D/g, '')) || 0;
        return numA - numB;
      });

      // Create manual array data for proper header structure
      const excelArray: any[][] = [];

      // Header Row 1: Season names (merged style)
      const headerRow1: any[] = ['#', 'Player Name'];
      sortedSeasons.forEach(seasonId => {
        const season = seasons.find(s => s.id === seasonId);
        const seasonName = season?.displayName || season?.name || seasonId.replace('SSPSLS', 'Season ');
        // Add season name only once, followed by empty cells for colspan effect (5 columns)
        headerRow1.push(seasonName, '', '', '', '');
      });
      excelArray.push(headerRow1);

      // Header Row 2: Stat column names
      const headerRow2: any[] = ['', '']; // Empty for player info columns
      sortedSeasons.forEach(() => {
        headerRow2.push('Matches', 'Goals', 'Wins', 'Draws', 'Losses');
      });
      excelArray.push(headerRow2);

      // Data rows
      Array.from(players.values()).forEach((player, index) => {
        const row: any[] = [
          index + 1,
          player.player_name,
        ];

        // Add stats for each season
        sortedSeasons.forEach(seasonId => {
          const stats = player.seasons.get(seasonId);

          if (stats) {
            row.push(
              stats.matches_played,
              stats.goals_scored,
              stats.wins,
              stats.draws,
              stats.losses
            );
          } else {
            // Player didn't play in this season
            row.push('-', '-', '-', '-', '-');
          }
        });

        excelArray.push(row);
      });

      // Create workbook with ExcelJS
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Players', {
        views: [{ state: 'frozen', ySplit: 2 }]
      });

      // Build column definitions
      const baseCols = [
        { header: '#', key: 'num', width: 5 },
        { header: 'Player Name', key: 'name', width: 25 },
      ];
      const seasonCols = sortedSeasons.flatMap(() => [
        { header: 'MP', width: 10 },
        { header: 'Goals', width: 10 },
        { header: 'W', width: 8 },
        { header: 'D', width: 8 },
        { header: 'L', width: 8 },
      ]);
      worksheet.columns = [...baseCols, ...seasonCols];

      // Merge cells for season headers
      let colIdx = 3; // 1-indexed, after # and Name
      sortedSeasons.forEach((season) => {
        worksheet.mergeCells(1, colIdx, 1, colIdx + 4);
        const cell = worksheet.getCell(1, colIdx);
        cell.value = season.displayName || season.name;
        cell.font = { bold: true, size: 12 };
        cell.alignment = { horizontal: 'center', vertical: 'center' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD4AF37' } };
        colIdx += 5;
      });

      // Add data rows (skip the first two header rows from excelArray)
      for (let i = 2; i < excelArray.length; i++) {
        const row = excelArray[i];
        if (row && row.length > 0) {
          worksheet.addRow(row);
        }
      }

      // Style sub-header row (row 2)
      worksheet.getRow(2).eachCell((cell) => {
        cell.font = { bold: true, size: 10 };
        cell.alignment = { horizontal: 'center', vertical: 'center' };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF3F4F6' } };
      });

      // Generate buffer
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);

      // Generate filename with proper season names
      const seasonsText = selectedSeasons.length === 1
        ? (seasons.find(s => s.id === selectedSeasons[0])?.displayName || 
           seasons.find(s => s.id === selectedSeasons[0])?.name || 
           selectedSeasons[0].replace('SSPSLS', 'S'))
        : `${selectedSeasons.length}_Seasons`;
      const filename = `RealPlayers_${seasonsText}_${new Date().toISOString().split('T')[0]}.xlsx`;

      // Download
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);

      setSuccess(`Excel file "${filename}" downloaded successfully with ${players.size} players!`);
    } catch (error: any) {
      console.error('Error exporting to Excel:', error);
      setError('Failed to export to Excel');
    }
  };

  if (loading || !isCommitteeAdmin) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center">
        <div className="text-center font-mono">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-500 font-bold uppercase tracking-wider">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 px-4 sm:px-6">
      {/* Decorative overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-4xl mx-auto relative z-10 space-y-6">
        {/* Back Button */}
        <Link
          href="/dashboard/committee"
          className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
        >
          &larr; Back to Committee
        </Link>

        {/* Header */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0">
              <FileSpreadsheet className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold uppercase tracking-wider text-slate-800">
                Export Players to Excel
              </h1>
              <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                Download real players stats for selected season
              </p>
            </div>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="bg-rose-50 border border-rose-200/60 rounded-2xl p-4 font-mono text-xs">
            <div className="flex items-center gap-2 text-rose-800">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-bold uppercase">{error}</span>
            </div>
          </div>
        )}

        {success && (
          <div className="bg-emerald-50 border border-emerald-200/60 rounded-2xl p-4 font-mono text-xs">
            <div className="flex items-center gap-2 text-emerald-800">
              <CheckCircle className="w-4 h-4" />
              <span className="font-bold uppercase">{success}</span>
            </div>
          </div>
        )}

        {/* Season Selection & Actions */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-6">
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                Select Seasons ({selectedSeasons.length} selected)
              </label>
              <div className="flex gap-2">
                <button
                  onClick={selectAllSeasons}
                  className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold uppercase transition-all"
                >
                  Select All
                </button>
                <button
                  onClick={clearAllSeasons}
                  className="px-3 py-1 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-lg text-[10px] font-bold uppercase transition-all"
                >
                  Clear All
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-64 overflow-y-auto p-3 bg-slate-50 rounded-xl border border-slate-200">
              {seasons.map(season => (
                <button
                  key={season.id}
                  onClick={() => toggleSeason(season.id)}
                  className={`px-4 py-3 rounded-xl text-xs font-bold uppercase tracking-wide transition-all border-2 ${
                    selectedSeasons.includes(season.id)
                      ? 'bg-amber-500 text-white border-amber-600 shadow-md'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-amber-300'
                  }`}
                >
                  {season.displayName || season.name || season.id}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={fetchPlayers}
              disabled={selectedSeasons.length === 0 || isLoading}
              className={`flex-1 py-3 px-4 font-mono font-bold text-sm uppercase tracking-wider rounded-xl transition-all shadow-sm ${
                selectedSeasons.length === 0 || isLoading
                  ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-slate-800 hover:bg-slate-700 text-white'
              }`}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  Loading...
                </span>
              ) : (
                `Load Players from ${selectedSeasons.length} Season(s)`
              )}
            </button>

            <button
              onClick={exportToExcel}
              disabled={players.size === 0}
              className={`flex-1 py-3 px-4 font-mono font-bold text-sm uppercase tracking-wider rounded-xl transition-all shadow-sm ${
                players.size === 0
                  ? 'bg-slate-100 border border-slate-200 text-slate-400 cursor-not-allowed'
                  : 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-emerald-500/20'
              }`}
            >
              <span className="flex items-center justify-center gap-2">
                <Download className="w-4 h-4" />
                Export to Excel
              </span>
            </button>
          </div>
        </div>

        {/* Players Preview */}
        {players.size > 0 && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
            <div className="bg-slate-800 text-white p-5 border-b border-slate-700">
              <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-amber-500" />
                Players Preview ({players.size} unique players)
              </h2>
            </div>

            <div className="max-h-96 overflow-y-auto overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 sticky left-0 bg-slate-50 z-10">#</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500 sticky left-12 bg-slate-50 z-10">Player</th>
                    {[...selectedSeasons].sort((a, b) => {
                      const numA = parseInt(a.replace(/\D/g, '')) || 0;
                      const numB = parseInt(b.replace(/\D/g, '')) || 0;
                      return numA - numB;
                    }).map(seasonId => {
                      const season = seasons.find(s => s.id === seasonId);
                      const seasonName = season?.displayName || season?.name || seasonId.replace('SSPSLS', 'Season ');
                      return (
                        <th key={seasonId} colSpan={5} className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wider text-blue-600 border-l-2 border-slate-300">
                          {seasonName}
                        </th>
                      );
                    })}
                  </tr>
                  <tr className="bg-slate-100">
                    <th className="px-4 py-2 sticky left-0 bg-slate-100 z-10"></th>
                    <th className="px-4 py-2 sticky left-12 bg-slate-100 z-10"></th>
                    {[...selectedSeasons].sort((a, b) => {
                      const numA = parseInt(a.replace(/\D/g, '')) || 0;
                      const numB = parseInt(b.replace(/\D/g, '')) || 0;
                      return numA - numB;
                    }).map(seasonId => (
                      <React.Fragment key={`${seasonId}-sub`}>
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase text-slate-500 border-l-2 border-slate-300">M</th>
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase text-blue-600">G</th>
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase text-emerald-600">W</th>
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase text-amber-600">D</th>
                        <th className="px-2 py-2 text-center text-[9px] font-bold uppercase text-rose-600">L</th>
                      </React.Fragment>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {Array.from(players.values()).slice(0, 50).map((player, index) => (
                    <tr key={player.player_id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-slate-500 font-bold sticky left-0 bg-white z-10">{index + 1}</td>
                      <td className="px-4 py-3 font-bold text-slate-800 sticky left-12 bg-white z-10">{player.player_name}</td>
                      {[...selectedSeasons].sort((a, b) => {
                        const numA = parseInt(a.replace(/\D/g, '')) || 0;
                        const numB = parseInt(b.replace(/\D/g, '')) || 0;
                        return numA - numB;
                      }).map(seasonId => {
                        const stats = player.seasons.get(seasonId);
                        return (
                          <React.Fragment key={`${player.player_id}-${seasonId}`}>
                            <td className="px-2 py-3 text-center font-bold text-slate-700 border-l-2 border-slate-200">
                              {stats ? stats.matches_played : '-'}
                            </td>
                            <td className="px-2 py-3 text-center font-bold text-blue-600">
                              {stats ? stats.goals_scored : '-'}
                            </td>
                            <td className="px-2 py-3 text-center font-bold text-emerald-600">
                              {stats ? stats.wins : '-'}
                            </td>
                            <td className="px-2 py-3 text-center font-bold text-amber-600">
                              {stats ? stats.draws : '-'}
                            </td>
                            <td className="px-2 py-3 text-center font-bold text-rose-600">
                              {stats ? stats.losses : '-'}
                            </td>
                          </React.Fragment>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {players.size > 50 && (
                <div className="p-4 bg-slate-50 text-center text-[10px] text-slate-500 font-bold uppercase">
                  Showing first 50 of {players.size} players. Export to see all.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info Card */}
        <div className="console-card bg-blue-50 border border-blue-200/60 rounded-2xl p-4 font-mono text-xs">
          <h3 className="font-bold text-blue-800 uppercase mb-2 text-[10px]"><BarChart2 className="w-3 h-3 inline text-blue-500 mr-1" /> How This Works:</h3>
          <ul className="space-y-1 text-blue-700 font-semibold">
            <li>• Shows players registered in <strong>your current season ({userSeasonId})</strong></li>
            <li>• Displays their stats from <strong>selected seasons</strong></li>
            <li>• One row per player with stats columns for each season</li>
            <li>• Shows "-" for seasons where player didn't play</li>
          </ul>
          <div className="mt-3 p-2 bg-blue-100 border border-blue-300 rounded-lg">
            <p className="text-[10px] font-bold text-blue-800">
              💡 Example: If you're S18 admin and select S15, S16, S17, S18 - you'll see S18 players with their stats from all 4 seasons.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
