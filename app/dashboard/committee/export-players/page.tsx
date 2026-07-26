'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import { Download, FileSpreadsheet, AlertTriangle, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import * as XLSX from 'xlsx';

interface PlayerStats {
  player_id: string;
  player_name: string;
  category: string;
  team_name: string | null;
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

export default function ExportPlayersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { isCommitteeAdmin, userSeasonId } = usePermissions();

  const [seasons, setSeasons] = useState<any[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [players, setPlayers] = useState<PlayerStats[]>([]);
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
        const seasonsData = seasonsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));

        setSeasons(seasonsData);
        
        // Set current season as default
        if (userSeasonId) {
          setSelectedSeason(userSeasonId);
        }
      } catch (error) {
        console.error('Error fetching seasons:', error);
      }
    };

    if (isCommitteeAdmin) {
      fetchSeasons();
    }
  }, [isCommitteeAdmin, userSeasonId]);

  const fetchPlayers = async () => {
    if (!selectedSeason) {
      setError('Please select a season');
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetchWithTokenRefresh(
        `/api/realplayers/season-players?seasonId=${selectedSeason}`
      );
      const result = await response.json();

      if (result.success && result.data) {
        const playersData: PlayerStats[] = result.data.map((p: any) => ({
          player_id: p.player_id || '',
          player_name: p.player_name || '',
          category: p.category || 'N/A',
          team_name: p.team_name || 'Unassigned',
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
        }));

        setPlayers(playersData);
        setSuccess(`Loaded ${playersData.length} players from ${selectedSeason}`);
      } else {
        setError('Failed to load players');
      }
    } catch (error: any) {
      console.error('Error fetching players:', error);
      setError('Failed to fetch players');
    } finally {
      setIsLoading(false);
    }
  };

  const exportToExcel = () => {
    if (players.length === 0) {
      setError('No players to export. Please load data first.');
      return;
    }

    try {
      // Prepare data for Excel
      const excelData = players.map((player, index) => ({
        '#': index + 1,
        'Player ID': player.player_id,
        'Player Name': player.player_name,
        'Category': player.category,
        'Team': player.team_name || 'Unassigned',
        'Base Price': player.base_price,
        'Auction Price': player.price,
        'Points': player.points,
        'Matches': player.matches_played,
        'Goals': player.goals_scored,
        'Assists': player.assists,
        'Clean Sheets': player.clean_sheets,
        'Wins': player.wins,
        'Draws': player.draws,
        'Losses': player.losses,
      }));

      // Create worksheet
      const worksheet = XLSX.utils.json_to_sheet(excelData);

      // Set column widths
      const columnWidths = [
        { wch: 5 },  // #
        { wch: 15 }, // Player ID
        { wch: 25 }, // Player Name
        { wch: 12 }, // Category
        { wch: 20 }, // Team
        { wch: 12 }, // Base Price
        { wch: 12 }, // Auction Price
        { wch: 10 }, // Points
        { wch: 10 }, // Matches
        { wch: 10 }, // Goals
        { wch: 10 }, // Assists
        { wch: 12 }, // Clean Sheets
        { wch: 10 }, // Wins
        { wch: 10 }, // Draws
        { wch: 10 }, // Losses
      ];
      worksheet['!cols'] = columnWidths;

      // Create workbook
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Players');

      // Generate filename
      const seasonName = seasons.find(s => s.id === selectedSeason)?.name || selectedSeason;
      const filename = `RealPlayers_${seasonName}_${new Date().toISOString().split('T')[0]}.xlsx`;

      // Download
      XLSX.writeFile(workbook, filename);

      setSuccess(`Excel file "${filename}" downloaded successfully!`);
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
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">
              Select Season
            </label>
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
              className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 bg-white font-mono text-sm font-bold outline-none uppercase tracking-wide cursor-pointer hover:border-slate-300 transition-all"
            >
              <option value="">Choose season...</option>
              {seasons.map(season => (
                <option key={season.id} value={season.id}>
                  {season.name || season.id}
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-3">
            <button
              onClick={fetchPlayers}
              disabled={!selectedSeason || isLoading}
              className={`flex-1 py-3 px-4 font-mono font-bold text-sm uppercase tracking-wider rounded-xl transition-all shadow-sm ${
                !selectedSeason || isLoading
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
                'Load Players Data'
              )}
            </button>

            <button
              onClick={exportToExcel}
              disabled={players.length === 0}
              className={`flex-1 py-3 px-4 font-mono font-bold text-sm uppercase tracking-wider rounded-xl transition-all shadow-sm ${
                players.length === 0
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
        {players.length > 0 && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
            <div className="bg-slate-800 text-white p-5 border-b border-slate-700">
              <h2 className="text-xs font-bold uppercase tracking-wider flex items-center gap-2">
                <FileSpreadsheet className="w-4 h-4 text-amber-500" />
                Players Preview ({players.length} players)
              </h2>
            </div>

            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-xs font-mono">
                <thead className="bg-slate-50 sticky top-0">
                  <tr>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">#</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Player</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Category</th>
                    <th className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-slate-500">Team</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Matches</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">Goals</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">W</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">D</th>
                    <th className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-slate-500">L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {players.slice(0, 50).map((player, index) => (
                    <tr key={player.player_id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-4 py-3 text-slate-500 font-bold">{index + 1}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{player.player_name}</td>
                      <td className="px-4 py-3">
                        <span className="px-2 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded text-[9px] font-bold uppercase">
                          {player.category}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-semibold">{player.team_name}</td>
                      <td className="px-4 py-3 text-right font-bold text-slate-700">{player.matches_played}</td>
                      <td className="px-4 py-3 text-right font-bold text-blue-600">{player.goals_scored}</td>
                      <td className="px-4 py-3 text-right font-bold text-emerald-600">{player.wins}</td>
                      <td className="px-4 py-3 text-right font-bold text-amber-600">{player.draws}</td>
                      <td className="px-4 py-3 text-right font-bold text-rose-600">{player.losses}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {players.length > 50 && (
                <div className="p-4 bg-slate-50 text-center text-[10px] text-slate-500 font-bold uppercase">
                  Showing first 50 of {players.length} players. Export to see all.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Info Card */}
        <div className="console-card bg-blue-50 border border-blue-200/60 rounded-2xl p-4 font-mono text-xs">
          <h3 className="font-bold text-blue-800 uppercase mb-2 text-[10px]">📊 Export Includes:</h3>
          <ul className="space-y-1 text-blue-700 font-semibold">
            <li>• Player ID, Name, Category</li>
            <li>• Team Assignment</li>
            <li>• Base Price & Auction Price</li>
            <li>• Points, Matches Played</li>
            <li>• Goals, Assists, Clean Sheets</li>
            <li>• Wins, Draws, Losses</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
