'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import BulkPhotoUpload from '@/components/BulkPhotoUpload'
import { fetchWithTokenRefresh } from '@/lib/token-refresh'
import {
  ArrowLeft,
  Database,
  UploadCloud,
  FileSpreadsheet,
  DownloadCloud,
  CheckCircle2,
  Trash2,
  Filter,
  Sparkles,
  RefreshCw,
  AlertTriangle,
  Info,
  Users,
  Eye,
  ChevronDown,
  ChevronUp,
  Activity,
  PlusCircle,
  ShieldAlert
} from 'lucide-react'

interface PlayerCount {
  total: number
  byPosition: { [key: string]: number }
}

export default function DatabaseManagementPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [playerCount, setPlayerCount] = useState<PlayerCount>({ total: 0, byPosition: {} })
  const [loading, setLoading] = useState(false)
  const [showPositions, setShowPositions] = useState(false)
  const [deleteConfirmed, setDeleteConfirmed] = useState(false)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadStatus, setUploadStatus] = useState('')
  const [importStatus, setImportStatus] = useState('')
  const [deleteStatus, setDeleteStatus] = useState('')
  const [backupStatus, setBackupStatus] = useState('')
  const [restoreStatus, setRestoreStatus] = useState('')

  // Filters
  const [positionFilter, setPositionFilter] = useState('')
  const [minRating, setMinRating] = useState('')
  const [maxRating, setMaxRating] = useState('')
  const [filteredCount, setFilteredCount] = useState('')

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
    if (!authLoading && user && user.role !== 'committee_admin') {
      router.push('/dashboard')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    if (user?.role === 'committee_admin') {
      fetchPlayerCount()
    }
  }, [user])

  const fetchPlayerCount = async () => {
    try {
      console.log('🔄 Fetching player stats from Neon database')
      const response = await fetchWithTokenRefresh('/api/players/stats')
      const { data, success } = await response.json()
      
      if (!success) {
        throw new Error('Failed to fetch player stats')
      }
      
      console.log(`✅ Fetched stats: ${data.total} players from Neon`)
      setPlayerCount({
        total: data.total,
        byPosition: data.byPosition
      })
    } catch (err) {
      console.error('Error fetching player count:', err)
    }
  }

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0])
      setUploadStatus('')
    }
  }

  const handleSQLUpload = async () => {
    if (!selectedFile) {
      setUploadStatus('Please select a SQLite database file')
      return
    }

    if (!selectedFile.name.endsWith('.db')) {
      setUploadStatus('Please select a .db (SQLite database) file')
      return
    }

    setLoading(true)
    setUploadStatus('Loading SQLite parser...')

    try {
      setUploadStatus('Initializing database engine...')
      
      // Load SQL.js from CDN (browser-compatible version)
      const initSqlJs = await (async () => {
        const script = document.createElement('script')
        script.src = 'https://sql.js.org/dist/sql-wasm.js'
        document.head.appendChild(script)
        
        return new Promise((resolve) => {
          script.onload = () => {
        // @ts-expect-error - External library type issue
            resolve(window.initSqlJs)
          }
        })
      })()
      
      // @ts-expect-error - External library type issue
      const SQL = await initSqlJs({
        locateFile: (file: string) => `https://sql.js.org/dist/${file}`
      })

      setUploadStatus('Reading database file...')
      const arrayBuffer = await selectedFile.arrayBuffer()
      const buffer = new Uint8Array(arrayBuffer)
      
      setUploadStatus('Parsing SQLite database...')
      const db = new SQL.Database(buffer)
      
      // Try common table names
      const tableNames = ['players', 'players_all', 'footballplayers', 'footballplayer', 'player']
      let tableName = ''
      
      for (const name of tableNames) {
        try {
          const result = db.exec(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`)
          if (result.length > 0) {
            tableName = name
            break
          }
        } catch (e) {
          continue
        }
      }
      
      if (!tableName) {
        // Get first table
        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'")
        if (tables.length > 0 && tables[0].values.length > 0) {
          tableName = tables[0].values[0][0] as string
        } else {
          db.close()
          setUploadStatus('Error: No player tables found in database')
          return
        }
      }
      
      setUploadStatus(`Found table: ${tableName}. Extracting data...`)
      
      // Query all data from the found table
      const results = db.exec(`SELECT * FROM ${tableName}`)
      
      let players: any[] = []
      if (results.length > 0) {
        const columns = results[0].columns
        const values = results[0].values
        
        players = values.map((row: any[]) => {
          const player: any = {}
          columns.forEach((col: string, index: number) => {
            player[col] = row[index]
          })
          return player
        })
      }
      
      db.close()

      setUploadStatus(`Successfully parsed ${players.length} players from table "${tableName}". Click "Preview & Import" to review before importing.`)
      // Store parsed data in sessionStorage for preview
      sessionStorage.setItem('parsedPlayers', JSON.stringify(players))
      
    } catch (err: any) {
      console.error('Parse error:', err)
      setUploadStatus(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleQuickImport = async () => {
    const parsedData = sessionStorage.getItem('parsedPlayers')
    if (!parsedData) {
      setImportStatus('No parsed data found. Please upload a SQL file first.')
      return
    }

    if (!confirm('This will import all players directly. Continue?')) {
      return
    }

    setLoading(true)
    setImportStatus('Checking for existing players...')

    try {
      const players = JSON.parse(parsedData)
      
      // Fetch existing players from Neon to check for duplicates
      const existingResponse = await fetchWithTokenRefresh('/api/players')
      const { data: existingPlayers } = await existingResponse.json()
      
      const existingPlayerNames = new Set(
        existingPlayers.map((player: any) => player.name?.toLowerCase())
      )
      
      // Filter out duplicates
      const newPlayers = players.filter((player: any) => {
        const playerName = player.name?.toLowerCase()
        return playerName && !existingPlayerNames.has(playerName)
      })
      
      const duplicateCount = players.length - newPlayers.length
      
      if (duplicateCount > 0) {
        setImportStatus(`Found ${duplicateCount} duplicate(s). Importing ${newPlayers.length} new players...`)
      } else {
        setImportStatus('Importing players...')
      }
      
      // Check if all players are duplicates
      if (newPlayers.length === 0) {
        setImportStatus(`All ${players.length} players already exist in the database. No new players imported.`)
        sessionStorage.removeItem('parsedPlayers')
        fetchPlayerCount()
        return
      }
      
      // Use bulk create API endpoint
      const importResponse = await fetchWithTokenRefresh('/api/players/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'import',
          players: newPlayers.map((player: any) => ({
            ...player,
            is_auction_eligible: player.is_auction_eligible || false
          }))
        })
      })

      const result = await importResponse.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to import players')
      }
      
      setImportStatus(`Successfully imported ${result.count} new players! (${duplicateCount} duplicates skipped)`)
      sessionStorage.removeItem('parsedPlayers')
      fetchPlayerCount()
    } catch (err: any) {
      setImportStatus(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleUpdateStats = () => {
    const parsedData = sessionStorage.getItem('parsedPlayers')
    if (!parsedData) {
      setImportStatus('No parsed data found. Please upload a SQL file first.')
      return
    }

    router.push('/dashboard/committee/database/update-preview')
  }

  const handlePreviewImport = () => {
    const parsedData = sessionStorage.getItem('parsedPlayers')
    if (!parsedData) {
      setImportStatus('No parsed data found. Please upload a SQL file first.')
      return
    }

    router.push('/dashboard/committee/database/import-preview')
  }

  const handleDeleteAll = async () => {
    if (!deleteConfirmed) {
      setDeleteStatus('Please confirm deletion by checking the checkbox')
      return
    }

    if (!confirm('WARNING: This will permanently delete ALL players. This cannot be undone. Continue?')) {
      return
    }

    setLoading(true)
    setDeleteStatus('Deleting all players...')

    try {
      // Call Neon API to delete all players
      const response = await fetchWithTokenRefresh('/api/players/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteAll' })
      })
      
      const result = await response.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to delete players')
      }
      
      setDeleteStatus(`Successfully deleted ${result.count} players`)
      setDeleteConfirmed(false)
      fetchPlayerCount()
    } catch (err: any) {
      setDeleteStatus(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleCreateBackup = async () => {
    setBackupStatus('Creating backup...')
    setLoading(true)

    try {
      // Fetch all players from Neon
      const response = await fetchWithTokenRefresh('/api/players')
      const { data: players, success } = await response.json()
      
      if (!success) {
        throw new Error('Failed to fetch players for backup')
      }
      
      console.log(`📊 Creating backup of ${players.length} players from Neon database`)

      const backup = {
        timestamp: new Date().toISOString(),
        players,
        count: players.length
      }

      const dataStr = JSON.stringify(backup, null, 2)
      const blob = new Blob([dataStr], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `players_backup_${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      setBackupStatus('Backup created successfully!')
    } catch (err: any) {
      setBackupStatus(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleRestoreBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    if (!confirm('WARNING: This will overwrite ALL existing players. Continue?')) {
      return
    }

    setRestoreStatus('Restoring backup...')
    setLoading(true)

    try {
      const text = await file.text()
      const backup = JSON.parse(text)

      if (!backup.players || !Array.isArray(backup.players)) {
        throw new Error('Invalid backup file format')
      }

      // Delete all existing players using Neon API
      const deleteResponse = await fetchWithTokenRefresh('/api/players/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteAll' })
      })
      
      const deleteResult = await deleteResponse.json()
      if (!deleteResult.success) {
        throw new Error('Failed to delete existing players')
      }

      // Restore players from backup using Neon API
      const restoreResponse = await fetchWithTokenRefresh('/api/players/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'import',
          players: backup.players.map((player: any) => {
            const { id, ...playerData } = player
            return playerData
          })
        })
      })
      
      const restoreResult = await restoreResponse.json()
      if (!restoreResult.success) {
        throw new Error('Failed to restore players')
      }

      setRestoreStatus(`Successfully restored ${backup.players.length} players!`)
      fetchPlayerCount()
    } catch (err: any) {
      setRestoreStatus(`Error: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleFilterPlayers = async () => {
    try {
      // Fetch all players from Neon
      const response = await fetchWithTokenRefresh('/api/players')
      const { data: allPlayers } = await response.json()
      
      // Apply filters client-side
      let filtered = allPlayers

      if (positionFilter) {
        filtered = filtered.filter((player: any) => player.position === positionFilter)
      }

      if (minRating || maxRating) {
        filtered = filtered.filter((player: any) => {
          const rating = player.overall_rating || 0
          const min = minRating ? parseInt(minRating) : 0
          const max = maxRating ? parseInt(maxRating) : 99
          return rating >= min && rating <= max
        })
      }

      console.log(`🔍 Filtered ${filtered.length} players from Neon database`)
      setFilteredCount(`Found ${filtered.length} players matching your criteria`)
    } catch (err: any) {
      setFilteredCount(`Error: ${err.message}`)
    }
  }

  if (authLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-500 uppercase tracking-wider font-extrabold">Loading...</p>
        </div>
      </div>
    )
  }

  if (user.role !== 'committee_admin') {
    return null
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 space-y-6">
        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/committee"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <Database className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">COMMITTEE CONSOLE</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Database Management
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Manage player data, backups, photo storage and SQLite import operations.
              </p>
            </div>
          </div>
          <div className="bg-slate-800 text-white font-mono font-bold text-xs uppercase tracking-wider px-3.5 py-1.5 rounded-xl border border-slate-700 shadow-sm shrink-0">
            Total Players: {playerCount.total}
          </div>
        </div>

        {/* Database Status */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
            <Activity className="w-4 h-4 text-amber-500" />
            Database Status
          </h3>
          <div className="space-y-3 font-mono text-xs">
            <div className="flex justify-between items-center p-3 bg-slate-50 border border-slate-200/50 rounded-xl">
              <span className="text-slate-500 uppercase tracking-wide">Current Player Count:</span>
              <span className="font-extrabold text-slate-800 bg-white px-2.5 py-0.5 rounded-md border border-slate-200 shadow-sm">{playerCount.total}</span>
            </div>

            {Object.keys(playerCount.byPosition).length > 0 && (
              <div className="p-3 bg-slate-50 border border-slate-200/50 rounded-xl">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-slate-500 uppercase tracking-wide">Player Positions:</span>
                  <button
                    onClick={() => setShowPositions(!showPositions)}
                    className="text-amber-600 hover:text-amber-700 font-extrabold flex items-center gap-1 cursor-pointer transition-colors"
                  >
                    {showPositions ? (
                      <>Hide Breakdown <ChevronUp className="w-3 h-3" /></>
                    ) : (
                      <>Show Breakdown <ChevronDown className="w-3 h-3" /></>
                    )}
                  </button>
                </div>
                {showPositions && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2 mt-3 pt-3 border-t border-slate-200/50">
                    {Object.entries(playerCount.byPosition).map(([position, count]) => (
                      <div key={position} className="text-[11px] bg-white border border-slate-200/55 rounded-lg px-2.5 py-1.5 flex justify-between shadow-sm">
                        <span className="font-extrabold text-slate-600">{position}</span>
                        <span className="text-amber-600 font-extrabold">{count}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Upload SQLite Database */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <FileSpreadsheet className="w-4 h-4 text-amber-500" />
            Upload SQLite Database
          </h3>
          <p className="text-[11px] text-slate-400 font-mono mb-4">
            Upload a SQLite database file (.db) containing player data. The system will automatically detect and import the player table.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 items-stretch">
            <div className="flex-grow">
              <input
                type="file"
                accept=".db"
                onChange={handleFileSelect}
                className="block w-full text-xs text-slate-500 font-mono
                  file:mr-4 file:py-2.5 file:px-4
                  file:rounded-xl file:border file:border-slate-200
                  file:text-xs file:font-bold file:uppercase file:tracking-wide
                  file:bg-slate-50 file:text-slate-700
                  hover:file:bg-slate-100 file:cursor-pointer"
              />
            </div>
            <button
              onClick={handleSQLUpload}
              disabled={!selectedFile || loading}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-md disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {loading && uploadStatus.includes('Parsing') ? (
                <>
                  <RefreshCw className="animate-spin h-3.5 w-3.5 text-amber-400" />
                  Parsing...
                </>
              ) : (
                <>
                  <UploadCloud className="w-3.5 h-3.5 text-amber-400" />
                  Parse Database
                </>
              )}
            </button>
          </div>
          {uploadStatus && (
            <div className="mt-3 bg-slate-50 border border-slate-200/50 rounded-xl p-3 text-[11px] font-mono text-slate-600 flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>{uploadStatus}</span>
            </div>
          )}
        </div>

        {/* Import Players */}
        <div className={`console-card p-6 sm:p-8 rounded-3xl border ${playerCount.total === 0 ? 'bg-emerald-50/20 border-emerald-200/60' : 'bg-white border-slate-200/60'} shadow-sm space-y-6`}>
          <div>
            <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-1 flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Import Players
            </h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Import players from the parsed SQL data. Choose between quick import or enhanced import with preview.
            </p>
            {playerCount.total === 0 && (
              <div className="mt-2 bg-emerald-500/10 border border-emerald-200/60 rounded-xl p-3 text-emerald-800 text-[11px] font-mono font-extrabold flex items-center gap-1.5">
                <Info className="w-4 h-4 text-emerald-500" />
                No players found in the system. Import is recommended to initialize the database.
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs">
            {/* Update Stats */}
            <div className="console-card bg-slate-50/40 border border-slate-200/50 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <h4 className="text-amber-700 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4 text-amber-500" />
                  Update Stats
                </h4>
                <p className="text-slate-500 text-[11px] mt-2 leading-relaxed">
                  Preview and update player stats, add new players. Preserves existing team ownership records.
                </p>
              </div>
              <button
                onClick={handleUpdateStats}
                disabled={loading}
                className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-colors w-full disabled:opacity-50 cursor-pointer"
              >
                Preview Update
              </button>
            </div>

            {/* Quick Import */}
            <div className="console-card bg-slate-50/40 border border-slate-200/50 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <h4 className="text-blue-700 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                  <PlusCircle className="w-4 h-4 text-blue-500" />
                  Quick Import
                </h4>
                <p className="text-slate-500 text-[11px] mt-2 leading-relaxed">
                  Import new players directly. Automatically skips duplicate records by matching player names.
                </p>
              </div>
              <button
                onClick={handleQuickImport}
                disabled={loading}
                className={`mt-4 px-4 py-2 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-colors w-full disabled:opacity-50 cursor-pointer ${
                  playerCount.total === 0 ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-800 hover:bg-slate-700'
                }`}
              >
                Quick Import
              </button>
            </div>

            {/* Enhanced Import */}
            <div className="console-card bg-slate-50/40 border border-slate-200/50 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <h4 className="text-emerald-700 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                  <Eye className="w-4 h-4 text-emerald-500" />
                  Enhanced Import
                </h4>
                <p className="text-slate-500 text-[11px] mt-2 leading-relaxed">
                  Preview, refine, and edit parsed player data line-by-line before running the database import.
                </p>
              </div>
              <button
                onClick={handlePreviewImport}
                disabled={loading}
                className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-colors w-full disabled:opacity-50 cursor-pointer"
              >
                Preview & Import
              </button>
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <Link
              href="/dashboard/committee/players"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-900 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center gap-2"
            >
              <Users className="w-3.5 h-3.5 text-amber-400" />
              View All Players
            </Link>
          </div>

          {importStatus && (
            <div className="bg-slate-50 border border-slate-200/50 rounded-xl p-3 text-[11px] font-mono text-slate-600 flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
              <span>{importStatus}</span>
            </div>
          )}
        </div>

        {/* Bulk Photo Upload */}
        <BulkPhotoUpload />

        {/* Delete All Players */}
        <div className="console-card bg-white border border-rose-200/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
          <h3 className="text-xs font-mono font-bold text-rose-500 uppercase tracking-wider flex items-center gap-1.5">
            <ShieldAlert className="w-4 h-4 text-rose-500" />
            Delete All Players
          </h3>
          <p className="text-[11px] text-slate-400 font-mono leading-relaxed">
            This will permanently delete all players from the database. This action cannot be undone and will reset the players registry.
          </p>

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="confirmDelete"
                checked={deleteConfirmed}
                onChange={(e) => setDeleteConfirmed(e.target.checked)}
                className="rounded border-slate-300 text-rose-500 focus:ring-rose-500/20 cursor-pointer"
              />
              <label htmlFor="confirmDelete" className="text-xs font-mono font-extrabold text-rose-600 select-none cursor-pointer">
                I understand this will delete all player data
              </label>
            </div>

            <button
              onClick={handleDeleteAll}
              disabled={!deleteConfirmed || loading}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              Delete All Players
            </button>
          </div>
          {deleteStatus && (
            <div className="bg-rose-50 border border-rose-200/50 rounded-xl p-3 text-[11px] font-mono text-rose-800 flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0 animate-bounce" />
              <span>{deleteStatus}</span>
            </div>
          )}
        </div>

        {/* Backup and Restore */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <DownloadCloud className="w-4 h-4 text-amber-500" />
            Backup and Restore
          </h3>
          <p className="text-[11px] text-slate-400 font-mono mb-4">
            Create backups of your entire database or restore from a previous JSON backup file.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-xs">
            {/* Backup */}
            <div className="console-card bg-slate-50/40 border border-slate-200/50 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <h4 className="text-slate-800 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                  <DownloadCloud className="w-4 h-4 text-amber-500" />
                  Create Backup
                </h4>
                <p className="text-slate-500 text-[11px] mt-2 leading-relaxed">
                  Download a complete JSON database dump containing all players' attributes and parameters.
                </p>
              </div>
              <button
                onClick={handleCreateBackup}
                disabled={loading}
                className="mt-4 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-colors w-full disabled:opacity-50 cursor-pointer"
              >
                Create Backup
              </button>
              {backupStatus && (
                <div className="mt-2 bg-white border border-slate-200/50 rounded-lg p-2.5 text-[11px] font-mono text-slate-600 flex items-center gap-1.5 shadow-sm">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                  <span>{backupStatus}</span>
                </div>
              )}
            </div>

            {/* Restore */}
            <div className="console-card bg-slate-50/40 border border-slate-200/50 rounded-2xl p-5 flex flex-col justify-between">
              <div>
                <h4 className="text-amber-700 font-extrabold uppercase tracking-wider flex items-center gap-1.5">
                  <RefreshCw className="w-4 h-4 text-amber-500" />
                  Restore from Backup
                </h4>
                <p className="text-slate-500 text-[11px] mt-2 leading-relaxed">
                  Upload a JSON backup file to restore your database. <strong className="text-rose-600">This will overwrite existing data.</strong>
                </p>
              </div>
              <div className="mt-4 space-y-2">
                <input
                  type="file"
                  accept=".json"
                  onChange={handleRestoreBackup}
                  disabled={loading}
                  className="block w-full text-[11px] text-slate-500
                    file:mr-4 file:py-2 file:px-3
                    file:rounded-xl file:border file:border-slate-200
                    file:text-[10px] file:font-bold file:uppercase file:tracking-wide
                    file:bg-white file:text-slate-700
                    hover:file:bg-slate-50 file:cursor-pointer
                    disabled:opacity-50"
                />
                {restoreStatus && (
                  <div className="mt-2 bg-white border border-slate-200/50 rounded-lg p-2.5 text-[11px] font-mono text-slate-600 flex items-center gap-1.5 shadow-sm">
                    <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{restoreStatus}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Enhanced Data Management */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <h3 className="text-xs font-mono font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Filter className="w-4 h-4 text-amber-500" />
            Filter Players
          </h3>
          <p className="text-[11px] text-slate-400 font-mono mb-4">
            Quickly query database player matches using custom filters.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4 font-mono text-xs">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Position</label>
              <select
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold cursor-pointer"
              >
                <option value="">All Positions</option>
                {Object.keys(playerCount.byPosition).map(pos => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Rating Range</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  value={minRating}
                  onChange={(e) => setMinRating(e.target.value)}
                  placeholder="Min"
                  min="1"
                  max="99"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold"
                />
                <span className="text-slate-400 font-bold">to</span>
                <input
                  type="number"
                  value={maxRating}
                  onChange={(e) => setMaxRating(e.target.value)}
                  placeholder="Max"
                  min="1"
                  max="99"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold"
                />
              </div>
            </div>
          </div>

          <button
            onClick={handleFilterPlayers}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-colors cursor-pointer"
          >
            Filter Players
          </button>

          {filteredCount && (
            <div className="mt-3 bg-slate-50 border border-slate-200/50 rounded-xl p-3 text-[11px] font-mono text-slate-600 flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>{filteredCount}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
