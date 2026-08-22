'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { 
  ArrowLeft, 
  Download, 
  Upload, 
  CheckCircle, 
  AlertCircle,
  FileSpreadsheet,
  Eye,
  Database,
  TrendingUp
} from 'lucide-react';

interface Season {
  id: string;
  name: string;
  season_number?: number;
  player_count?: number;
}

const AVAILABLE_STATS = [
  { value: 'points', label: 'Total Points', description: 'Total points accumulated' },
  { value: 'matches_played', label: 'Matches Played', description: 'Total matches played' },
  { value: 'wins', label: 'Wins', description: 'Matches won' },
  { value: 'draws', label: 'Draws', description: 'Matches drawn' },
  { value: 'losses', label: 'Losses', description: 'Matches lost' },
  { value: 'goals_scored', label: 'Goals Scored', description: 'Goals scored' },
  { value: 'goals_conceded', label: 'Goals Conceded', description: 'Goals conceded' },
  { value: 'assists', label: 'Assists', description: 'Assists made' },
  { value: 'clean_sheets', label: 'Clean Sheets', description: 'Clean sheets kept' },
  { value: 'motm_awards', label: 'MOTM Awards', description: 'Man of the Match awards' },
];

export default function PlayerStatsBulkUpdate() {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [selectedSeason, setSelectedSeason] = useState('');
  const [selectedStats, setSelectedStats] = useState<string[]>(['points']);
  const [isExporting, setIsExporting] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<any>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && user.role === 'super_admin') {
      fetchSeasons();
    }
  }, [user]);

  const fetchSeasons = async () => {
    try {
      // Fetch seasons that actually have player stats data
      const response = await fetchWithTokenRefresh('/api/superadmin/player-stats-bulk-update/seasons');
      const result = await response.json();
      if (result.success) {
        setSeasons(result.seasons);
      }
    } catch (error) {
      console.error('Error fetching seasons:', error);
    }
  };

  const handleStatsToggle = (statValue: string) => {
    setSelectedStats(prev => {
      if (prev.includes(statValue)) {
        // Don't allow deselecting if it's the only one selected
        if (prev.length === 1) {
          alert('At least one stat field must be selected');
          return prev;
        }
        return prev.filter(s => s !== statValue);
      } else {
        return [...prev, statValue];
      }
    });
  };

  const handleExport = async () => {
    if (!selectedSeason) {
      alert('Please select a season first');
      return;
    }

    if (selectedStats.length === 0) {
      alert('Please select at least one stats field');
      return;
    }

    setIsExporting(true);
    try {
      const response = await fetchWithTokenRefresh('/api/superadmin/player-stats-bulk-update/export', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          seasonId: selectedSeason,
          statsFields: selectedStats
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage;
        try {
          const error = JSON.parse(errorText);
          errorMessage = error.error || 'Export failed';
        } catch {
          errorMessage = errorText || 'Export failed';
        }
        throw new Error(errorMessage);
      }

      // Download the file
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      
      const timestamp = new Date().toISOString().split('T')[0];
      link.download = `player_stats_update_${selectedSeason}_${timestamp}.xlsx`;
      
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      alert('✅ Excel file exported successfully! Fill in the yellow "new_*" columns and upload it back.');
    } catch (error: any) {
      console.error('Export error:', error);
      alert(`Export failed: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
      setPreviewData(null);
      setImportResult(null);
    }
  };

  const handlePreview = async () => {
    if (!selectedFile) {
      alert('Please select a file first');
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetchWithTokenRefresh('/api/superadmin/player-stats-bulk-update/preview', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Preview failed');
      }

      if (!result.success) {
        throw new Error(result.error || 'Preview failed');
      }

      setPreviewData(result);
      alert(`✅ Preview loaded! ${result.summary.playersToUpdate} players will be updated.`);
    } catch (error: any) {
      console.error('Preview error:', error);
      alert(`Preview failed: ${error.message}`);
      setPreviewData(null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleImport = async () => {
    if (!selectedFile || !previewData) {
      alert('Please preview the file first');
      return;
    }

    if (previewData.summary.playersToUpdate === 0) {
      alert('No updates to import');
      return;
    }

    const confirm = window.confirm(
      `⚠️ This will update ${previewData.summary.playersToUpdate} players in the database.\n\n` +
      `Fields to update: ${previewData.summary.statsFields.join(', ')}\n\n` +
      `Are you sure you want to proceed?`
    );

    if (!confirm) return;

    setIsImporting(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetchWithTokenRefresh('/api/superadmin/player-stats-bulk-update/import', {
        method: 'POST',
        body: formData
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Import failed');
      }

      if (!result.success) {
        throw new Error(result.error || 'Import failed');
      }

      setImportResult(result);
      alert(`✅ ${result.message}`);
      
      // Reset form
      setSelectedFile(null);
      setPreviewData(null);
      
    } catch (error: any) {
      console.error('Import error:', error);
      alert(`Import failed: ${error.message}`);
    } finally {
      setIsImporting(false);
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
          <p className="text-slate-550 font-mono text-xs tracking-widest uppercase animate-pulse">Loading...</p>
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
          onClick={() => router.push('/dashboard/superadmin')}
          className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-650 hover:text-slate-950 transition-all flex-shrink-0 shadow-sm"
          title="Back to Dashboard"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Player Stats Bulk Update
          </h1>
          <p className="text-xs text-slate-505 font-mono mt-1">
            Export, update, and import player statistics for historical seasons
          </p>
        </div>
      </div>

      {/* Step 1: Export */}
      <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
            <span className="text-amber-600 font-bold text-sm">1</span>
          </div>
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Database className="w-4 h-4 text-amber-500" />
            Export Current Data
          </h2>
        </div>

        <div className="space-y-4">
          {/* Season Selection */}
          <div>
            <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-2">
              Select Season
            </label>
            <select
              value={selectedSeason}
              onChange={(e) => setSelectedSeason(e.target.value)}
              className="w-full max-w-md px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-450 focus:ring-1 focus:ring-amber-400/20 outline-none text-slate-800 font-mono text-xs transition-all"
            >
              <option value="">Choose a season...</option>
              {seasons.map(season => (
                <option key={season.id} value={season.id}>
                  {season.name} ({season.id}) - {season.player_count || 0} players
                </option>
              ))}
            </select>
          </div>

          {/* Stats Selection */}
          <div>
            <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-3">
              Select Stats Fields to Update
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {AVAILABLE_STATS.map(stat => (
                <label
                  key={stat.value}
                  className={`
                    flex items-start gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all
                    ${selectedStats.includes(stat.value)
                      ? 'border-amber-400 bg-amber-50/50'
                      : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                    }
                  `}
                >
                  <input
                    type="checkbox"
                    checked={selectedStats.includes(stat.value)}
                    onChange={() => handleStatsToggle(stat.value)}
                    className="mt-0.5 w-4 h-4 text-amber-600 border-slate-300 rounded focus:ring-amber-500"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-xs text-slate-800">{stat.label}</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">{stat.description}</div>
                  </div>
                </label>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-2">
              💡 Selected: {selectedStats.length} field{selectedStats.length !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Export Button */}
          <button
            onClick={handleExport}
            disabled={isExporting || !selectedSeason || selectedStats.length === 0}
            className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExporting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Exporting...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                Export to Excel
              </>
            )}
          </button>
        </div>
      </div>

      {/* Step 2: Upload & Preview */}
      <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl space-y-6">
        <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
          <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
            <span className="text-amber-600 font-bold text-sm">2</span>
          </div>
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <FileSpreadsheet className="w-4 h-4 text-amber-500" />
            Upload Updated File
          </h2>
        </div>

        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-200/60 rounded-xl p-4 flex gap-3 text-xs text-blue-800">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-blue-500" />
            <div>
              <p className="font-bold mb-1">Instructions:</p>
              <ol className="list-decimal list-inside space-y-1 text-[11px]">
                <li>Open the exported Excel file</li>
                <li>Fill in the yellow "new_*" columns with updated values</li>
                <li>Leave cells empty for players you don't want to update</li>
                <li>Save the file and upload it here</li>
              </ol>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-2">
              Select Updated File
            </label>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 outline-none text-slate-850 font-mono text-xs transition-all"
            />
            {selectedFile && (
              <p className="mt-2 text-xs text-slate-500 font-mono">
                Selected: <span className="font-bold text-amber-600">{selectedFile.name}</span>
              </p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handlePreview}
              disabled={isUploading || !selectedFile}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Loading Preview...
                </>
              ) : (
                <>
                  <Eye className="w-4 h-4" />
                  Preview Changes
                </>
              )}
            </button>
          </div>
        </div>

        {/* Preview Data */}
        {previewData && (
          <div className="space-y-4 mt-6 pt-6 border-t border-slate-200">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
              Preview Summary
            </h3>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200">
                <div className="text-2xl font-bold text-slate-900">{previewData.summary.totalRows}</div>
                <div className="text-[10px] text-slate-500 font-mono uppercase mt-1">Total Rows</div>
              </div>
              <div className="bg-green-50 rounded-xl p-4 border border-green-200">
                <div className="text-2xl font-bold text-green-700">{previewData.summary.playersToUpdate}</div>
                <div className="text-[10px] text-green-600 font-mono uppercase mt-1">To Update</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-4 border border-amber-200">
                <div className="text-2xl font-bold text-amber-700">{previewData.summary.playersSkipped}</div>
                <div className="text-[10px] text-amber-600 font-mono uppercase mt-1">Skipped</div>
              </div>
              <div className="bg-red-50 rounded-xl p-4 border border-red-200">
                <div className="text-2xl font-bold text-red-700">{previewData.summary.errors}</div>
                <div className="text-[10px] text-red-600 font-mono uppercase mt-1">Errors</div>
              </div>
            </div>

            {previewData.summary.errors > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-xs font-bold text-red-800 mb-2"><AlertCircle className="w-3 h-3 inline text-red-500 mr-1" /> Errors Found:</p>
                <ul className="text-[11px] text-red-700 space-y-1">
                  {previewData.summary.errorMessages.map((error: string, idx: number) => (
                    <li key={idx}>• {error}</li>
                  ))}
                </ul>
              </div>
            )}

            {previewData.updates && previewData.updates.length > 0 && (
              <div>
                <p className="text-xs font-bold text-slate-700 mb-3">Sample Updates (first 10):</p>
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 max-h-96 overflow-y-auto">
                  <div className="space-y-3">
                    {previewData.updates.slice(0, 10).map((update: any, idx: number) => (
                      <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200">
                        <div className="font-bold text-xs text-slate-900">{update.player_name}</div>
                        <div className="text-[10px] text-slate-500 mb-2">{update.team_name} • {update.season_id}</div>
                        <div className="space-y-1">
                          {Object.entries(update.updates).map(([field, data]: [string, any]) => (
                            <div key={field} className="flex items-center justify-between text-[10px]">
                              <span className="text-slate-600 font-mono">{field}:</span>
                              <span className="font-mono">
                                {data.current} → <span className="font-bold text-green-600">{data.new}</span>
                                <span className={`ml-2 ${data.change >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  ({data.change >= 0 ? '+' : ''}{data.change})
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Step 3: Import */}
      {previewData && previewData.summary.playersToUpdate > 0 && (
        <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl space-y-6">
          <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
            <div className="w-8 h-8 rounded-xl bg-amber-50 flex items-center justify-center">
              <span className="text-amber-600 font-bold text-sm">3</span>
            </div>
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-amber-500" />
              Execute Import
            </h2>
          </div>

          <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-4 flex gap-3 text-xs text-amber-800">
            <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5 text-amber-500" />
            <div>
              <p className="font-bold mb-1"><AlertCircle className="w-3 h-3 inline text-amber-500 mr-1" /> Warning:</p>
              <p className="text-[11px]">
                This will update {previewData.summary.playersToUpdate} players in the database. 
                Only the selected stats fields will be modified. Make sure the preview looks correct before proceeding.
              </p>
            </div>
          </div>

          <button
            onClick={handleImport}
            disabled={isImporting}
            className="inline-flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isImporting ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Importing...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Execute Import
              </>
            )}
          </button>

          {importResult && (
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 mt-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="text-xs font-bold text-green-800 mb-2"><CheckCircle className="w-4 h-4 inline text-green-500 mr-1" /> Import Successful!</p>
                  <div className="text-[11px] text-green-700 space-y-1">
                    <p>• Updated: {importResult.summary.successful} players</p>
                    {importResult.summary.failed > 0 && (
                      <p className="text-red-700">• Failed: {importResult.summary.failed} players</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
