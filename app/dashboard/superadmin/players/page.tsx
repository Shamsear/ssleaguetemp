'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getAllRealPlayers, getRealPlayerStatistics, createRealPlayer } from '@/lib/firebase/realPlayers';
import { RealPlayerData } from '@/types/realPlayer';
import { db } from '@/lib/firebase/config';
import { collection, getDocs } from 'firebase/firestore';

export default function PlayersManagement() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  // Real data from Firestore
  const [stats, setStats] = useState({
    totalPlayers: 0,
    registeredPlayers: 0,
    unregisteredPlayers: 0,
  });

  const [seasonsWithPlayers, setSeasonsWithPlayers] = useState<{
    id: string;
    name: string;
    playerCount: number;
  }[]>([]);

  const [players, setPlayers] = useState<RealPlayerData[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<RealPlayerData[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'registered' | 'unregistered'>('all');
  const [filterCompleteness, setFilterCompleteness] = useState<'all' | 'complete' | 'incomplete'>('complete'); // Default to complete
  const [error, setError] = useState<string | null>(null);
  
  // Form state for adding single player
  const [addingPlayer, setAddingPlayer] = useState(false);
  const [playerName, setPlayerName] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch real players data
  useEffect(() => {
    const fetchPlayersData = async () => {
      if (!user || user.role !== 'super_admin') return;

      try {
        setLoadingData(true);
        setError(null);
        
        // Fetch all players
        const allPlayers = await getAllRealPlayers();
        setPlayers(allPlayers);

        // Calculate statistics
        const playerStats = await getRealPlayerStatistics();
        setStats({
          totalPlayers: playerStats.totalPlayers,
          registeredPlayers: allPlayers.filter(p => p.is_registered).length,
          unregisteredPlayers: allPlayers.filter(p => !p.is_registered).length,
        });

        // Calculate players by season from realplayer collection (actual registrations)
        const [realPlayerRegistrations, seasonsSnapshot] = await Promise.all([
          getDocs(collection(db, 'realplayer')),
          getDocs(collection(db, 'seasons'))
        ]);
        
        // Create a map of season IDs to names
        const seasonNames = new Map<string, string>();
        seasonsSnapshot.docs.forEach(doc => {
          seasonNames.set(doc.id, doc.data().name || `Season ${doc.id.replace('SSPSLS', '')}`);
        });
        
        const seasonMap = new Map<string, { name: string; players: Set<string> }>();
        
        realPlayerRegistrations.docs.forEach(doc => {
          const data = doc.data();
          const seasonId = data.season_id;
          const playerId = data.player_id;
          
          if (seasonId && playerId) {
            const seasonName = seasonNames.get(seasonId) || `Season ${seasonId.replace('SSPSLS', '')}`;
            
            const existing = seasonMap.get(seasonId);
            if (existing) {
              existing.players.add(playerId);
            } else {
              seasonMap.set(seasonId, {
                name: seasonName,
                players: new Set([playerId])
              });
            }
          }
        });
        
        // Convert player sets to counts
        const seasonsArray = Array.from(seasonMap.entries()).map(([id, data]) => ({
          id,
          name: data.name,
          playerCount: data.players.size
        }));
        setSeasonsWithPlayers(seasonsArray);

      } catch (error) {
        console.error('Error fetching players data:', error);
        const errorMessage = error instanceof Error ? error.message : 'Failed to load players data';
        setError(errorMessage);
      } finally {
        setLoadingData(false);
      }
    };

    fetchPlayersData();
  }, [user]);

  // Filter and search players
  useEffect(() => {
    let filtered = players;

    // Apply completeness filter (team and season assigned)
    if (filterCompleteness === 'complete') {
      filtered = filtered.filter(p => p.team_name && p.season_name);
    } else if (filterCompleteness === 'incomplete') {
      filtered = filtered.filter(p => !p.team_name || !p.season_name);
    }

    // Apply status filter
    if (filterStatus === 'registered') {
      filtered = filtered.filter(p => p.is_registered);
    } else if (filterStatus === 'unregistered') {
      filtered = filtered.filter(p => !p.is_registered);
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p => {
        // Search in player name and ID
        const matchesBasicInfo = 
          p.name.toLowerCase().includes(term) ||
          p.player_id.toLowerCase().includes(term) ||
          (p.display_name && p.display_name.toLowerCase().includes(term));
        
        // Search in team info (team_name is the assigned team, team is previous team)
        const matchesTeam = 
          (p.team_name && p.team_name.toLowerCase().includes(term)) ||
          (p.team && p.team.toLowerCase().includes(term)) ||
          (p.team_code && p.team_code.toLowerCase().includes(term));
        
        // Search in season info
        const matchesSeason = 
          (p.season_name && p.season_name.toLowerCase().includes(term));
        
        return matchesBasicInfo || matchesTeam || matchesSeason;
      });
    }

    setFilteredPlayers(filtered);
  }, [players, searchTerm, filterStatus, filterCompleteness]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!selectedFile) {
      alert('Please select a file first');
      return;
    }

    // Validate file type
    const validTypes = ['.xlsx', '.xls', '.csv'];
    const fileExtension = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();
    
    if (!validTypes.includes(fileExtension)) {
      alert('Please upload a valid Excel (.xlsx, .xls) or CSV file');
      return;
    }

    setUploading(true);
    
    try {
      // Read the file
      const text = await selectedFile.text();
      
      // Parse CSV
      const lines = text.split('\n').filter(line => line.trim());
      
      if (lines.length < 2) {
        alert('File is empty or has no data rows');
        setUploading(false);
        return;
      }
      
      // Get headers (first line)
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      
      // Find column indices
      const playerIdIndex = headers.findIndex(h => h === 'player_id');
      const nameIndex = headers.findIndex(h => h === 'name');
      
      if (nameIndex === -1) {
        alert('CSV file must have a "name" column');
        setUploading(false);
        return;
      }
      
      // Parse data rows (skip header)
      const players: Array<{ player_id?: string; name: string }> = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const playerName = values[nameIndex];
        const playerId = playerIdIndex !== -1 ? values[playerIdIndex] : undefined;
        
        if (playerName) {
          players.push({
            player_id: playerId || undefined,
            name: playerName
          });
        }
      }
      
      if (players.length === 0) {
        alert('No valid player names found in file');
        setUploading(false);
        return;
      }
      
      // Store in sessionStorage to pass to preview page
      sessionStorage.setItem('importPlayers', JSON.stringify(players));
      
      // Redirect to preview page
      router.push('/dashboard/superadmin/players/import-preview');
    } catch (error) {
      console.error('Error reading file:', error);
      alert('Failed to read file. Please make sure it is a valid CSV file.');
      setUploading(false);
    }
  };

  const handleAddPlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!playerName.trim()) {
      alert('Please enter a player name');
      return;
    }
    
    try {
      setAddingPlayer(true);
      
      // Create player with only name (other fields will be assigned later)
      await createRealPlayer({
        name: playerName.trim(),
      }, user?.uid);
      
      // Clear form
      setPlayerName('');
      
      // Refresh players list
      const allPlayers = await getAllRealPlayers();
      setPlayers(allPlayers);
      
      // Update statistics
      const playerStats = await getRealPlayerStatistics();
      setStats({
        totalPlayers: playerStats.totalPlayers,
        registeredPlayers: allPlayers.filter(p => p.is_registered).length,
        unregisteredPlayers: allPlayers.filter(p => !p.is_registered).length,
      });
      
      // Recalculate seasons with players
      const seasonMap = new Map<string, { name: string; count: number }>();
      allPlayers.forEach(player => {
        if (player.season_id && player.season_name) {
          const existing = seasonMap.get(player.season_id);
          if (existing) {
            existing.count++;
          } else {
            seasonMap.set(player.season_id, {
              name: player.season_name,
              count: 1
            });
          }
        }
      });
      
      const seasonsArray = Array.from(seasonMap.entries()).map(([id, data]) => ({
        id,
        name: data.name,
        playerCount: data.count
      }));
      setSeasonsWithPlayers(seasonsArray);
      
      alert('Player added successfully!');
    } catch (error) {
      console.error('Error adding player:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to add player';
      alert(`Error: ${errorMessage}`);
    } finally {
      setAddingPlayer(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      // Fetch all real players from Firestore
      const allPlayers = await getAllRealPlayers();
      
      let csvRows: string[];
      let filename: string;
      
      if (allPlayers.length === 0) {
        // No players in database - provide sample template
        csvRows = [
          // Header
          'player_id,name',
          // Sample data for bulk import
          ',Cristiano Ronaldo',
          ',Lionel Messi',
          ',Neymar Jr',
          ',Kylian Mbappe',
          ',Erling Haaland',
          ',Kevin De Bruyne',
          ',Mohamed Salah',
          ',', // Empty row for user input
          ',', // Empty row for user input
          ',', // Empty row for user input
        ];
        filename = 'player_import_template.csv';
      } else {
        // Export existing players
        csvRows = [
          // Header
          'player_id,name',
          // Data rows - all existing players
          ...allPlayers.map(player => 
            `${player.player_id},${player.name}`
          )
        ];
        filename = `realplayers_export_${new Date().toISOString().split('T')[0]}.csv`;
      }
      
      const csvContent = csvRows.join('\n');

      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      
      link.setAttribute('href', url);
      link.setAttribute('download', filename);
      link.style.visibility = 'hidden';
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      // Cleanup
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading template:', error);
      alert('Failed to download template. Please try again.');
    }
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return 'N/A';
    try {
      const dateObj = date instanceof Date ? date : new Date(date);
      if (isNaN(dateObj.getTime())) return 'Invalid Date';
      return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      });
    } catch (error) {
      console.error('Error formatting date:', error);
      return 'Invalid Date';
    }
  };

  if (loading || loadingData) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0066FF] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="space-y-8 animate-fade-in font-mono">
      {/* Page Header */}
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
              Player Database
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-1">
              Manage all players in the system, edit details, and run bulk operations.
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
          <div>
            <p className="font-bold">Error loading players data</p>
            <p className="mt-0.5">{error}</p>
          </div>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-rose-500 hover:text-rose-750"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Statistics Section */}
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
            <div className="text-[10px] font-mono font-semibold text-slate-400 uppercase tracking-wider">Total Players</div>
            <div className="text-2xl font-extrabold text-slate-800 mt-1">{stats.totalPlayers}</div>
          </div>
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
            <div className="text-[10px] font-mono font-semibold text-emerald-600 uppercase tracking-wider">Registered Players</div>
            <div className="text-2xl font-extrabold text-emerald-600 mt-1">{stats.registeredPlayers}</div>
          </div>
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm">
            <div className="text-[10px] font-mono font-semibold text-amber-600 uppercase tracking-wider">Unregistered Players</div>
            <div className="text-2xl font-extrabold text-amber-600 mt-1">{stats.unregisteredPlayers}</div>
          </div>
        </div>

        {/* Season Breakdown */}
        {seasonsWithPlayers.length > 0 && (
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 mb-4">Players by Season Breakdown</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {seasonsWithPlayers.map((season) => (
                season.playerCount > 0 && (
                  <div key={season.id} className="p-4 rounded-xl bg-slate-50 border border-slate-200/60 hover:border-slate-350 transition-all">
                    <p className="text-xs text-slate-405 font-mono">Season</p>
                    <p className="text-sm font-bold text-slate-800 mt-0.5">{season.name}</p>
                    <p className="text-lg font-extrabold text-amber-600 mt-2 font-mono">{season.playerCount} players</p>
                  </div>
                )
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Forms Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Bulk Import */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-805 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Bulk Import Players
            </h2>
            <div className="rounded-xl p-4 mb-6 bg-slate-50 border border-slate-200/60 text-xs text-slate-600 space-y-2">
              <p className="font-bold text-slate-700">Import Instructions:</p>
              <ul className="list-disc list-inside space-y-1 pl-1">
                <li><strong>Download Template:</strong> Get all existing players for local editing.</li>
                <li><strong>Edit Names:</strong> Set names in the CSV file row-by-row.</li>
                <li><strong>Add Players:</strong> Leave player_id blank for new players (auto-generated ID).</li>
                <li><strong>Format:</strong> Supports standard CSV files.</li>
              </ul>
            </div>

            <div className="mb-6">
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="inline-flex items-center gap-2 px-4 py-2 border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-semibold text-slate-700 transition-all shadow-sm"
              >
                <svg className="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3M3 17V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v10a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
                </svg>
                Download CSV Template
              </button>
              <p className="text-[10px] text-slate-400 mt-2 font-mono">
                {stats.totalPlayers > 0 
                  ? `Exports all ${stats.totalPlayers} existing records`
                  : 'Downloads a sample CSV structure'}
              </p>
            </div>
          </div>

          <form onSubmit={handleFileUpload} className="space-y-4">
            <div>
              <label htmlFor="player_file" className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
                Select Player File (CSV)
              </label>
              <input
                type="file"
                id="player_file"
                accept=".csv"
                onChange={handleFileChange}
                required
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 outline-none text-slate-800 transition-all font-mono text-xs"
              />
            </div>
            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="w-full px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {uploading ? (
                <>
                  <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing file...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  Import Players List
                </>
              )}
            </button>
          </form>
        </div>

        {/* Add Single Player */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-805 mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
              </svg>
              Add Single Player
            </h2>
            <div className="rounded-xl p-4 mb-6 bg-slate-50 border border-slate-200/60 text-xs text-slate-600">
              <p className="font-bold text-slate-700">Quick Registration:</p>
              <p className="mt-1">Only the player's name is required to initialize a record. Team and active league season parameters can be assigned later.</p>
            </div>
          </div>

          <form onSubmit={handleAddPlayer} className="space-y-4">
            <div>
              <label htmlFor="player_name" className="block text-xs font-semibold text-slate-500 mb-2 uppercase tracking-wider">
                Player Name
              </label>
              <input
                type="text"
                id="player_name"
                value={playerName}
                onChange={(e) => setPlayerName(e.target.value)}
                required
                disabled={addingPlayer}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 outline-none text-slate-800 transition-all font-semibold"
                placeholder="E.g. Kylian Mbappé"
              />
            </div>
            <button
              type="submit"
              disabled={addingPlayer || !playerName.trim()}
              className="w-full px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              {addingPlayer ? (
                <>
                  <svg className="animate-spin w-4 h-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating player...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  Register Player
                </>
              )}
            </button>
          </form>
        </div>
      </div>

      {/* Players List */}
      <div className="console-card bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-200/60 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Registered Player Registry
            </h2>
          </div>
          <button
            onClick={async () => {
              setLoadingData(true);
              try {
                const allPlayers = await getAllRealPlayers();
                setPlayers(allPlayers);
                
                const playerStats = await getRealPlayerStatistics();
                setStats({
                  totalPlayers: playerStats.totalPlayers,
                  registeredPlayers: allPlayers.filter(p => p.is_registered).length,
                  unregisteredPlayers: allPlayers.filter(p => !p.is_registered).length,
                });
                
                const seasonMap = new Map<string, { name: string; count: number }>();
                allPlayers.forEach(player => {
                  if (player.season_id && player.season_name) {
                    const existing = seasonMap.get(player.season_id);
                    if (existing) {
                      existing.count++;
                    } else {
                      seasonMap.set(player.season_id, {
                        name: player.season_name,
                        count: 1
                      });
                    }
                  }
                });
                
                const seasonsArray = Array.from(seasonMap.entries()).map(([id, data]) => ({
                  id,
                  name: data.name,
                  playerCount: data.count
                }));
                setSeasonsWithPlayers(seasonsArray);
              } catch (error) {
                console.error('Error refreshing players:', error);
                alert('Failed to refresh players data. Please try again.');
              } finally {
                setLoadingData(false);
              }
            }}
            disabled={loadingData}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white hover:bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-semibold text-slate-700 transition-all shadow-sm"
          >
            <svg className={`w-3.5 h-3.5 ${loadingData ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Refresh Table
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Search and Filters */}
          <div className="flex flex-col gap-4">
            {/* Search Bar */}
            <div className="relative">
              <input
                type="text"
                placeholder="Search by name, ID, team, or season..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full px-4 py-3 pl-10 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 outline-none text-slate-800 transition-all font-mono text-xs"
              />
              <svg className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 transform -translate-y-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>

            {/* Filters Block */}
            <div className="flex flex-col sm:flex-row gap-3">
              {/* Completeness Filter */}
              <div className="p-1 bg-slate-100 border border-slate-200/60 rounded-xl flex gap-1 overflow-x-auto scrollbar-none">
                {[
                  { id: 'all', label: 'All Players' },
                  { id: 'complete', label: 'Complete (Team + Season)' },
                  { id: 'incomplete', label: 'Incomplete' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilterCompleteness(f.id as any)}
                    className={`px-4 py-2 rounded-lg text-[11px] font-mono font-bold transition-all whitespace-nowrap ${
                      filterCompleteness === f.id
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-805 hover:bg-slate-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {/* Status Filter */}
              <div className="p-1 bg-slate-100 border border-slate-200/60 rounded-xl flex gap-1 overflow-x-auto scrollbar-none">
                {[
                  { id: 'all', label: 'All Status' },
                  { id: 'registered', label: 'Registered' },
                  { id: 'unregistered', label: 'Pending' },
                ].map((f) => (
                  <button
                    key={f.id}
                    onClick={() => setFilterStatus(f.id as any)}
                    className={`px-4 py-2 rounded-lg text-[11px] font-mono font-bold transition-all whitespace-nowrap ${
                      filterStatus === f.id
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-805 hover:bg-slate-50'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Results Count */}
          {players.length > 0 && (
            <div className="text-xs text-slate-505 font-mono">
              Showing <span className="font-bold text-slate-800">{filteredPlayers.length}</span> of <span className="font-bold text-slate-800">{players.length}</span> players
            </div>
          )}

          {filteredPlayers.length > 0 ? (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200/60 bg-white shadow-sm">
                <table className="min-w-full divide-y divide-slate-100 text-sm font-mono">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider">Player ID</th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider">Name</th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider">Team</th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider">Season</th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider">Status</th>
                      <th className="px-5 py-3.5 text-left text-xs font-bold uppercase tracking-wider">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {filteredPlayers.map((player) => (
                      <tr key={player.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="px-5 py-4 whitespace-nowrap text-amber-600 font-semibold text-xs">
                          {player.player_id}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          <div className="font-bold text-slate-850">{player.name}</div>
                          {player.display_name && (
                            <div className="text-[10px] text-slate-400">({player.display_name})</div>
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-xs">
                          {player.team_name ? (
                            <span className="font-semibold text-slate-800">{player.team_name}</span>
                          ) : player.team ? (
                            <span className="text-slate-500">{player.team}</span>
                          ) : (
                            <span className="text-slate-400">No team</span>
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          {player.season_name ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-700">
                              {player.season_name}
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-50 border border-slate-200 text-slate-505">
                              No season
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap">
                          {player.is_registered ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 border border-emerald-200 text-emerald-700">
                              Registered
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-50 border border-amber-200 text-amber-700">
                              Pending
                            </span>
                          )}
                        </td>
                        <td className="px-5 py-4 whitespace-nowrap text-xs text-slate-400">
                          {formatDate(player.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-4">
                {filteredPlayers.map((player) => (
                  <div key={player.id} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/60 shadow-sm space-y-3">
                    <div>
                      <div className="font-bold text-slate-805">{player.name}</div>
                      {player.display_name && (
                        <div className="text-[10px] text-slate-400">({player.display_name})</div>
                      )}
                      <div className="text-xs font-semibold text-amber-605 font-mono mt-1">{player.player_id}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-slate-400">Team:</span>{' '}
                        {player.team_name ? (
                          <span className="font-semibold text-slate-700">{player.team_name}</span>
                        ) : player.team ? (
                          <span className="text-slate-500">{player.team}</span>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </div>
                      <div>
                        <span className="text-slate-400">Season:</span>{' '}
                        {player.season_name ? (
                          <span className="text-emerald-700 font-semibold">{player.season_name}</span>
                        ) : (
                          <span className="text-slate-400">None</span>
                        )}
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400">Status:</span>{' '}
                        {player.is_registered ? (
                          <span className="text-emerald-700 font-semibold">Registered</span>
                        ) : (
                          <span className="text-amber-700 font-semibold">Pending</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
              <svg className="w-12 h-12 mx-auto text-slate-400 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zm-4 7a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <h3 className="text-lg font-bold text-slate-805 mb-1">No players found</h3>
              <p className="text-xs text-slate-500 font-mono">Import player records or search with different filters.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
