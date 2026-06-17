'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { 
  ArrowLeft, 
  Download, 
  Upload, 
  Info, 
  FileText, 
  Check, 
  Sparkles, 
  AlertCircle,
  HelpCircle,
  Calendar,
  RefreshCw,
  Layers
} from 'lucide-react';

export default function ImportHistoricalSeason() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [seasonNumber, setSeasonNumber] = useState('');
  const [isDownloadingTemplate, setIsDownloadingTemplate] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

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

    if (!seasonNumber.trim() || isNaN(parseInt(seasonNumber))) {
      alert('Please enter a valid season number (e.g., 12)');
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
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('seasonNumber', seasonNumber.trim());
      
      const response = await fetchWithTokenRefresh('/api/seasons/historical/upload', {
        method: 'POST',
        body: formData,
      });
      
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }
      
      if (!result.success) {
        throw new Error(result.error || 'Upload failed');
      }
      
      // Check if there's existing data with linkings for the same season
      const existingDataStr = localStorage.getItem('seasonUploadData');
      let preservedLinkings: any = {};
      
      if (existingDataStr) {
        try {
          const existingData = JSON.parse(existingDataStr);
          
          // Only preserve linkings if it's the same season number
          if (existingData.seasonInfo?.seasonNumber === parseInt(seasonNumber)) {
            console.log('🔗 Preserving existing linkings for Season', seasonNumber);
            
            // Build maps of existing linkings by name
            const existingTeamLinkings = new Map();
            const existingPlayerLinkings = new Map();
            
            existingData.teams?.forEach((team: any) => {
              if (team.linked_team_id && team.team) {
                existingTeamLinkings.set(team.team.toLowerCase().trim(), team.linked_team_id);
              }
            });
            
            existingData.players?.forEach((player: any) => {
              if (player.linked_player_id && player.name) {
                existingPlayerLinkings.set(player.name.toLowerCase().trim(), player.linked_player_id);
              }
            });
            
            preservedLinkings = { teams: existingTeamLinkings, players: existingPlayerLinkings };
          }
        } catch (e) {
          console.warn('Could not parse existing data:', e);
        }
      }
      
      // Apply preserved linkings to new data
      if (preservedLinkings.teams?.size > 0 || preservedLinkings.players?.size > 0) {
        result.data.teams = result.data.teams.map((team: any) => {
          const linkedTeamId = preservedLinkings.teams?.get(team.team?.toLowerCase().trim());
          if (linkedTeamId) {
            console.log(`  ✅ Restored team linking: ${team.team} -> ${linkedTeamId}`);
            return { ...team, linked_team_id: linkedTeamId };
          }
          return team;
        });
        
        result.data.players = result.data.players.map((player: any) => {
          const linkedPlayerId = preservedLinkings.players?.get(player.name?.toLowerCase().trim());
          if (linkedPlayerId) {
            console.log(`  ✅ Restored player linking: ${player.name} -> ${linkedPlayerId}`);
            return { ...player, linked_player_id: linkedPlayerId };
          }
          return player;
        });
        
        console.log('✅ All linkings restored!');
      }
      
      // Store the parsed data (with preserved linkings) in localStorage for the preview page
      localStorage.setItem('seasonUploadData', JSON.stringify(result.data));
      
      // Redirect to preview page
      router.push('/dashboard/superadmin/historical-seasons/preview');
      
    } catch (error: any) {
      console.error('Upload error:', error);
      alert(`Upload failed: ${error.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      setIsDownloadingTemplate(true);
      
      const response = await fetchWithTokenRefresh('/api/seasons/historical/template');
      
      if (!response.ok) {
        throw new Error('Failed to download template');
      }
      
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'SS_League_Historical_Season_Template.xlsx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error downloading template:', error);
      alert('Failed to download template. Please try again.');
    } finally {
      setIsDownloadingTemplate(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center pt-32">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-550 font-mono text-xs tracking-widest uppercase animate-pulse">Initializing Uploader...</p>
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
      <div className="flex items-center gap-4 pb-6 border-b border-slate-200/60">
        <button
          onClick={() => router.push('/dashboard/superadmin/historical-seasons')}
          className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-650 hover:text-slate-950 transition-all flex-shrink-0 shadow-sm"
          title="Back to Historical Seasons"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Import Historical Season
          </h1>
          <p className="text-xs text-slate-505 font-mono mt-1">
            Initialize previous tournament drafts by uploading season schema spreadsheets.
          </p>
        </div>
      </div>

      {/* Instructions Section */}
      <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl space-y-6">
        <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-3">
          <HelpCircle className="w-4 h-4 text-amber-500" />
          Import Guidelines
        </h2>
        
        <div className="bg-amber-500/5 border border-amber-200/60 rounded-xl p-4 flex gap-3">
          <Info className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="space-y-2 text-xs leading-relaxed text-slate-600">
            <p className="font-bold text-slate-800">Spreadsheet Schema Requirements:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-600 font-mono text-[11px]">
              <li><strong>Teams Sheet:</strong> Columns: <code className="text-amber-700 font-bold">rank, team, owner_name, p, mp, w, d, l, f, a, gd, percentage, cup (optional)</code>.</li>
              <li><strong>Players Sheet:</strong> Columns: <code className="text-amber-700 font-bold">name, team, category, goals_scored, goals_per_game, goals_conceded, conceded_per_game, net_goals, cleansheets, points, win, draw, loss, total_matches, total_points</code>.</li>
              <li><strong>Workbook structure:</strong> Must be a standard Excel (.xlsx, .xls) workbook with exactly two sheets: <code className="font-semibold text-slate-800">Teams</code> and <code className="font-semibold text-slate-800">Players</code>.</li>
            </ul>
          </div>
        </div>

        <div>
          <button
            onClick={handleDownloadTemplate}
            disabled={isDownloadingTemplate}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDownloadingTemplate ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            {isDownloadingTemplate ? 'Downloading...' : 'Download Template spreadsheet'}
          </button>
        </div>
      </div>

      {/* Season Details Form */}
      <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl space-y-4">
        <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2 border-b border-slate-100 pb-3">
          <Calendar className="w-4 h-4 text-amber-500" />
          Season Context
        </h2>
        
        <div className="max-w-md space-y-2 text-xs font-mono">
          <label htmlFor="season_number" className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
            Season Index Number *
          </label>
          <input
            type="number"
            id="season_number"
            value={seasonNumber}
            onChange={(e) => setSeasonNumber(e.target.value)}
            required
            min="1"
            max="999"
            className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-450 focus:ring-1 focus:ring-amber-400/20 outline-none text-slate-800 font-mono text-xs transition-all placeholder-slate-400"
            placeholder="e.g., 12 (creates database key ID: SSPSLS12)"
          />
          <p className="text-[10px] text-slate-450 mt-1">
            💡 The entered number defines the key identifier. Example: 12 maps as <span className="font-bold text-amber-600">SSPSLS12</span>.
          </p>
        </div>
      </div>

      {/* File Upload Section */}
      <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl space-y-4">
        <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-705 flex items-center gap-2 border-b border-slate-100 pb-3">
          <Upload className="w-4 h-4 text-amber-500" />
          Import File Payload
        </h2>
        
        <form onSubmit={handleFileUpload} className="space-y-6">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-4 max-w-3xl">
            <div className="flex-grow">
              <label htmlFor="season_file" className="block text-[10px] font-mono font-bold text-slate-505 uppercase tracking-wider mb-2">
                Select Spreadsheet (.xlsx, .xls, .csv)
              </label>
              <input
                type="file"
                id="season_file"
                accept=".xlsx,.xls,.csv"
                onChange={handleFileChange}
                required
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 outline-none text-slate-850 font-mono text-xs transition-all"
              />
              {selectedFile && (
                <p className="mt-2 text-xs text-slate-500 font-mono">
                  Selected Payload: <span className="font-bold text-amber-600">{selectedFile.name}</span>
                </p>
              )}
            </div>
            <div className="flex-shrink-0">
              <button
                type="submit"
                disabled={uploading || !selectedFile || !seasonNumber.trim()}
                className="w-full sm:w-auto px-5 py-3 bg-slate-850 hover:bg-slate-900 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {uploading ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Processing spreadsheet...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Upload & Preview
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Additional Pipeline Steps Info */}
      <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl space-y-6">
        <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 border-b border-slate-100 pb-3 flex items-center gap-1.5">
          <Layers className="w-4 h-4 text-amber-500" />
          Database Import Pipeline Steps
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 font-mono text-xs text-slate-700">
          <div className="flex items-start gap-3.5">
            <div className="flex-shrink-0 w-7 h-7 bg-slate-100 border border-slate-200/80 rounded-xl flex items-center justify-center text-slate-700 font-bold text-xs">
              1
            </div>
            <div>
              <h3 className="font-bold text-slate-905 mb-0.5">Spreadsheet Validation</h3>
              <p className="text-[11px] text-slate-450 leading-relaxed">The server parsers validate structure, datatypes, and columns compliance.</p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="flex-shrink-0 w-7 h-7 bg-slate-100 border border-slate-200/80 rounded-xl flex items-center justify-center text-slate-700 font-bold text-xs">
              2
            </div>
            <div>
              <h3 className="font-bold text-slate-905 mb-0.5">Preview & Resolve</h3>
              <p className="text-[11px] text-slate-450 leading-relaxed">Verify team assignments, resolve missing player profile UUIDs, and map aliases.</p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="flex-shrink-0 w-7 h-7 bg-slate-100 border border-slate-200/80 rounded-xl flex items-center justify-center text-slate-700 font-bold text-xs">
              3
            </div>
            <div>
              <h3 className="font-bold text-slate-905 mb-0.5">Commit Database</h3>
              <p className="text-[11px] text-slate-450 leading-relaxed">Commit transaction batch updates to Firestore realplayers/playerstats tables.</p>
            </div>
          </div>

          <div className="flex items-start gap-3.5">
            <div className="flex-shrink-0 w-7 h-7 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-xl flex items-center justify-center font-bold text-xs">
              ✓
            </div>
            <div>
              <h3 className="font-bold text-slate-905 mb-0.5">Completion</h3>
              <p className="text-[11px] text-slate-450 leading-relaxed">Review transaction audit report logs and view the new historical season details.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
