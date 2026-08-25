'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { fetchWithTokenRefresh } from '@/lib/token-refresh'
import { 
  ArrowLeft, 
  Search, 
  RefreshCw, 
  Database, 
  AlertTriangle, 
  CheckCircle,
  Download,
  Info
} from 'lucide-react'
import { normalizeStr } from '@/lib/utils/normalizeStr';
import AuthGuard from '@/components/auth/AuthGuard';

export default function NotInTempPlayersPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  
  const [loading, setLoading] = useState(true)
  const [players, setPlayers] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [positionFilter, setPositionFilter] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState<'all' | 'sold' | 'unsold'>('all')
  const [isExporting, setIsExporting] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkDeleting, setIsBulkDeleting] = useState(false)
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // Sorting State
  const [sortField, setSortField] = useState<string>('overall_rating')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection(field === 'overall_rating' || field === 'player_id' || field === 'age' ? 'desc' : 'asc')
    }
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, positionFilter, statusFilter])

  const fetchPlayers = async () => {
    try {
      setLoading(true)
      const res = await fetchWithTokenRefresh('/api/players/database/compare')
      const result = await res.json()
      if (result.success) {
        setPlayers(result.data.notFoundInNew || [])
      } else {
        throw new Error(result.error)
      }
    } catch (e: any) {
      console.error('Error fetching players:', e)
      alert(`Failed to load players: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleDeletePlayer = async (id: string, name: string) => {
    if (!confirm(`WARNING: Are you sure you want to permanently delete player "${name}" from the active database? This will completely remove them and release their status. This action cannot be undone.`)) {
      return
    }

    try {
      setDeletingId(id)
      const res = await fetchWithTokenRefresh(`/api/players/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' }
      })

      const result = await res.json()
      if (result.success) {
        alert(result.message || `Permanently deleted ${name}.`)
        // Filter out deleted player from local state list
        setPlayers(prev => prev.filter(p => p.id !== id))
        setSelectedIds(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      } else {
        throw new Error(result.error)
      }
    } catch (e: any) {
      alert(`Failed to delete player: ${e.message}`)
    } finally {
      setDeletingId(null)
    }
  }

  const handleToggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) {
        next.delete(id)
      } else {
        next.add(id)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    const visibleIds = filteredPlayers.map(p => p.id)
    setSelectedIds(prev => {
      const next = new Set(prev)
      visibleIds.forEach(id => next.add(id))
      return next
    })
  }

  const handleDeselectAll = () => {
    const visibleIds = filteredPlayers.map(p => p.id)
    setSelectedIds(prev => {
      const next = new Set(prev)
      visibleIds.forEach(id => next.delete(id))
      return next
    })
  }

  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) {
      alert('Please select at least one player to delete.')
      return
    }

    if (!confirm(`WARNING: Are you sure you want to permanently delete the ${selectedIds.size} selected players from the active database? This will completely remove them and release their status. This action cannot be undone.`)) {
      return
    }

    try {
      setIsBulkDeleting(true)
      const res = await fetchWithTokenRefresh('/api/players/delete-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerIds: Array.from(selectedIds) })
      })

      const result = await res.json()
      if (result.success) {
        alert(result.message || `Successfully deleted ${result.deleted || selectedIds.size} players.`)
        // Filter out successfully deleted players from state list
        setPlayers(prev => prev.filter(p => !selectedIds.has(p.id)))
        setSelectedIds(new Set())
      } else {
        throw new Error(result.error)
      }
    } catch (e: any) {
      alert(`Failed to delete players: ${e.message}`)
    } finally {
      setIsBulkDeleting(false)
    }
  }

  useEffect(() => {
    if (user?.role === 'committee_admin') {
      fetchPlayers()
    }
  }, [user])

  // Filter players
  const filteredPlayers = players.filter(p => {
    const matchesSearch = 
      normalizeStr(p.name).includes(normalizeStr(searchTerm)) ||
      normalizeStr(p.team_name).includes(normalizeStr(searchTerm)) ||
      normalizeStr(p.club).includes(normalizeStr(searchTerm)) ||
      normalizeStr(p.nationality).includes(normalizeStr(searchTerm)) ||
      p.player_id?.toString().includes(searchTerm)

    const matchesPosition = positionFilter === 'ALL' || p.position === positionFilter
    
    let matchesStatus = true
    if (statusFilter === 'sold') {
      matchesStatus = !!p.is_sold
    } else if (statusFilter === 'unsold') {
      matchesStatus = !p.is_sold
    }

    return matchesSearch && matchesPosition && matchesStatus
  })

  // Sort players
  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    let aVal = a[sortField]
    let bVal = b[sortField]

    if (sortField === 'overall_rating' || sortField === 'player_id' || sortField === 'age') {
      const aNum = parseInt(aVal) || 0
      const bNum = parseInt(bVal) || 0
      return sortDirection === 'asc' ? aNum - bNum : bNum - aNum
    }

    aVal = (aVal || '').toString().toLowerCase()
    bVal = (bVal || '').toString().toLowerCase()

    if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
    if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
    return 0
  })

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredPlayers.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pageEnd = pageStart + pageSize
  const paginatedPlayers = sortedPlayers.slice(pageStart, pageEnd)

  const isAllVisibleSelected = paginatedPlayers.length > 0 && paginatedPlayers.every(p => selectedIds.has(p.id))

  const handleToggleSelectAllVisible = () => {
    if (isAllVisibleSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev)
        paginatedPlayers.forEach(p => next.delete(p.id))
        return next
      })
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev)
        paginatedPlayers.forEach(p => next.add(p.id))
        return next
      })
    }
  }

  // Helper to count position players
  const getPositionCount = (pos: string) => players.filter(p => p.position === pos).length

  // Export to Excel
  const handleExportToExcel = async () => {
    if (filteredPlayers.length === 0) return
    setIsExporting(true)
    try {
      const ExcelJS = (await import('exceljs')).default
      const workbook = new ExcelJS.Workbook()
      const worksheet = workbook.addWorksheet('Missing in Scraped Temp DB')

      worksheet.columns = [
        { header: 'Player ID', key: 'id', width: 15 },
        { header: 'Player Name', key: 'name', width: 25 },
        { header: 'Position', key: 'position', width: 12 },
        { header: 'Rating (OVR)', key: 'rating', width: 12 },
        { header: 'Club/Team', key: 'club', width: 25 },
        { header: 'Fantasy Team', key: 'fantasyTeam', width: 25 },
        { header: 'Nationality', key: 'nationality', width: 20 },
        { header: 'Age', key: 'age', width: 10 },
        { header: 'Status', key: 'status', width: 15 }
      ]

      filteredPlayers.forEach(p => {
        worksheet.addRow({
          id: p.player_id,
          name: p.name,
          position: p.position,
          rating: p.overall_rating,
          club: p.club || 'N/A',
          fantasyTeam: p.team_name || 'Free Agent',
          nationality: p.nationality || 'N/A',
          age: p.age || 'N/A',
          status: p.is_sold ? 'SOLD' : 'UNSOLD'
        })
      })

      // Style header
      worksheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
      worksheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF1E293B' }
      }
      worksheet.getRow(1).alignment = { vertical: 'middle', horizontal: 'center' }

      // Borders
      worksheet.eachRow((row, rowNum) => {
        row.eachCell(cell => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
          }
          if (rowNum > 1) {
            cell.alignment = { vertical: 'middle' }
          }
        })
      })

      const buffer = await workbook.xlsx.writeBuffer()
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `active_players_not_in_temp_${new Date().toISOString().split('T')[0]}.xlsx`
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (e: any) {
      console.error('Export error:', e)
      alert(`Export failed: ${e.message}`)
    } finally {
      setIsExporting(false)
    }
  }

  const getPositionColor = (position: string) => {
    switch (position) {
      case 'GK':
        return 'bg-yellow-50 text-yellow-700 border-yellow-200'
      case 'CB':
      case 'LB':
      case 'RB':
        return 'bg-blue-50 text-blue-700 border-blue-200'
      case 'DMF':
      case 'CMF':
      case 'LMF':
      case 'RMF':
      case 'AMF':
        return 'bg-green-50 text-green-700 border-green-200'
      case 'LWF':
      case 'RWF':
      case 'SS':
      case 'CF':
        return 'bg-red-50 text-red-700 border-red-200'
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200'
    }
  }

  if (authLoading || loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center font-mono">
          <RefreshCw className="animate-spin h-10 w-10 text-blue-500 mx-auto mb-4" />
          <p className="text-slate-600 text-xs">Querying database entries...</p>
        </div>
      </div>
    )
  }

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none" />
      
      <div className="max-w-screen-2xl mx-auto relative z-10">
        {/* Header card */}
        <div className="glass rounded-3xl p-6 mb-8 shadow-lg bg-white border border-slate-200/60">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Database className="w-5 h-5 text-blue-500" />
                <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider">Active DB Exclusions</span>
              </div>
              <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Players Not in Temp Scraper DB</h1>
              <p className="text-slate-500 text-xs mt-1 max-w-xl font-mono">
                Lists all players registered in the active database that do not exist in the temporary scraped table.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard/committee/database"
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </Link>

              {selectedIds.size > 0 && (
                <button
                  onClick={handleBulkDelete}
                  disabled={isBulkDeleting}
                  className="px-4 py-2.5 bg-red-600 hover:bg-red-500 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isBulkDeleting ? (
                    <>
                      <RefreshCw className="animate-spin w-4 h-4" />
                      Deleting...
                    </>
                  ) : (
                    <>
                      🗑️ Delete {selectedIds.size} Selected
                    </>
                  )}
                </button>
              )}

              {filteredPlayers.length > 0 && (
                <button
                  onClick={handleExportToExcel}
                  disabled={isExporting}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isExporting ? (
                    <>
                      <RefreshCw className="animate-spin w-4 h-4" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Export Excel
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {players.length === 0 ? (
          <div className="glass rounded-3xl p-12 text-center bg-white border border-slate-200/60 max-w-xl mx-auto shadow-md font-mono">
            <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
            <h2 className="text-lg font-extrabold text-slate-700">All Database Players Match Scraper</h2>
            <p className="text-slate-500 text-xs mt-2 leading-relaxed">
              There are currently no active database players missing from the temp scraper table.
            </p>
            <Link
              href="/dashboard/committee/database"
              className="mt-5 inline-block px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
            >
              Go to Scraper Dashboard
            </Link>
          </div>
        ) : (
          <div className="space-y-6 font-mono text-xs">
            <div className="bg-amber-50/50 border border-amber-200/60 rounded-2xl p-4 flex items-center gap-3 text-amber-800">
              <Info className="w-5 h-5 text-amber-500 shrink-0" />
              <p className="text-[11px] leading-relaxed">
                These players are registered in the active database but are missing from the latest scraping batch. They will remain intact in the database unless explicitly managed.
              </p>
            </div>

            {/* Filtering Controls */}
            <div className="glass bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                {/* Search Bar */}
                <div className="relative flex-grow max-w-md">
                  <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                  <input
                    type="text"
                    placeholder="Search name, club, or ID..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-4 py-2.5 w-full text-xs focus:outline-none focus:bg-white focus:ring-1 focus:ring-slate-300 transition-all"
                  />
                </div>

                {/* Position Filter */}
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-500">Position:</span>
                  <select
                    value={positionFilter}
                    onChange={(e) => setPositionFilter(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                  >
                    <option value="ALL">ALL POSITIONS ({players.length})</option>
                    <option value="GK">GK ({getPositionCount('GK')})</option>
                    <option value="CB">CB ({getPositionCount('CB')})</option>
                    <option value="LB">LB ({getPositionCount('LB')})</option>
                    <option value="RB">RB ({getPositionCount('RB')})</option>
                    <option value="DMF">DMF ({getPositionCount('DMF')})</option>
                    <option value="CMF">CMF ({getPositionCount('CMF')})</option>
                    <option value="LMF">LMF ({getPositionCount('LMF')})</option>
                    <option value="RMF">RMF ({getPositionCount('RMF')})</option>
                    <option value="AMF">AMF ({getPositionCount('AMF')})</option>
                    <option value="LWF">LWF ({getPositionCount('LWF')})</option>
                    <option value="RWF">RWF ({getPositionCount('RWF')})</option>
                    <option value="SS">SS ({getPositionCount('SS')})</option>
                    <option value="CF">CF ({getPositionCount('CF')})</option>
                  </select>
                </div>

                {/* Status Filter */}
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-500">Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as any)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                  >
                    <option value="all">ALL ({players.length})</option>
                    <option value="sold">SOLD ({players.filter(p => p.is_sold).length})</option>
                    <option value="unsold">UNSOLD ({players.filter(p => !p.is_sold).length})</option>
                  </select>
                </div>

                {/* Select Actions */}
                <div className="flex gap-2 ml-auto">
                  <button
                    onClick={handleSelectAll}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    Select All
                  </button>
                  <button
                    onClick={handleDeselectAll}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    Deselect All
                  </button>
                </div>
              </div>

              {/* List Table */}
              <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80 border-b border-slate-200/50 text-[10px] text-slate-500 uppercase font-bold tracking-wider select-none">
                      <th className="py-3 px-4 w-12 text-center">
                        <input
                          type="checkbox"
                          checked={isAllVisibleSelected}
                          onChange={handleToggleSelectAllVisible}
                          className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                        />
                      </th>
                      <th className="py-3 px-4 w-16">Card</th>
                      <th className="py-3 px-4">
                        <button type="button" onClick={() => handleSort('player_id')} className="font-bold uppercase tracking-wider flex items-center gap-1 focus:outline-none hover:text-slate-800 transition-colors cursor-pointer">
                          Player ID {sortField === 'player_id' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </button>
                      </th>
                      <th className="py-3 px-4">
                        <button type="button" onClick={() => handleSort('name')} className="font-bold uppercase tracking-wider flex items-center gap-1 focus:outline-none hover:text-slate-800 transition-colors cursor-pointer">
                          Name {sortField === 'name' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </button>
                      </th>
                      <th className="py-3 px-4 text-center">
                        <button type="button" onClick={() => handleSort('position')} className="font-bold uppercase tracking-wider flex items-center gap-1 mx-auto focus:outline-none hover:text-slate-800 transition-colors cursor-pointer">
                          Pos {sortField === 'position' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </button>
                      </th>
                      <th className="py-3 px-4 text-center">
                        <button type="button" onClick={() => handleSort('overall_rating')} className="font-bold uppercase tracking-wider flex items-center gap-1 mx-auto focus:outline-none hover:text-slate-800 transition-colors cursor-pointer">
                          OVR {sortField === 'overall_rating' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </button>
                      </th>
                      <th className="py-3 px-4">
                        <button type="button" onClick={() => handleSort('club')} className="font-bold uppercase tracking-wider flex items-center gap-1 focus:outline-none hover:text-slate-800 transition-colors cursor-pointer">
                          Club {sortField === 'club' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </button>
                      </th>
                      <th className="py-3 px-4">
                        <button type="button" onClick={() => handleSort('team_name')} className="font-bold uppercase tracking-wider flex items-center gap-1 focus:outline-none hover:text-slate-800 transition-colors cursor-pointer">
                          Fantasy Team {sortField === 'team_name' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </button>
                      </th>
                      <th className="py-3 px-4">
                        <button type="button" onClick={() => handleSort('nationality')} className="font-bold uppercase tracking-wider flex items-center gap-1 focus:outline-none hover:text-slate-800 transition-colors cursor-pointer">
                          Nationality {sortField === 'nationality' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                        </button>
                      </th>
                      <th className="py-3 px-4 text-center">Status</th>
                      <th className="py-3 px-4 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {paginatedPlayers.map((player) => (
                      <tr key={player.player_id} className={`hover:bg-slate-50/50 transition-colors text-slate-700 ${selectedIds.has(player.id) ? 'bg-blue-50/10' : ''}`}>
                        <td className="py-2.5 px-4 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(player.id)}
                            onChange={() => handleToggleSelect(player.id)}
                            className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                          />
                        </td>
                        <td className="py-2.5 px-4">
                          <img 
                            src={`/images/players/${player.player_id}.webp`} 
                            alt={player.name}
                            onError={(e) => { e.currentTarget.src = '/images/player-placeholder.png' }}
                            className="w-10 h-10 object-cover rounded-lg shadow-sm border border-slate-100" 
                          />
                        </td>
                        <td className="py-2.5 px-4 font-bold text-slate-500">{player.player_id}</td>
                        <td className="py-2.5 px-4">
                          <div className="font-extrabold text-slate-900">{player.name}</div>
                          <div className="flex flex-wrap items-center gap-1 mt-1 font-mono">
                            {player.bidsCount > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-[9px] text-blue-600 border border-blue-100 font-bold" title="Normal auction bids count">
                                Bids: {player.bidsCount}
                              </span>
                            )}
                            {player.roundBidsCount > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-indigo-50 text-[9px] text-indigo-600 border border-indigo-100 font-bold" title="Bulk round bids count">
                                Bulk Bids: {player.roundBidsCount}
                              </span>
                            )}
                            {player.historyCount > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-purple-50 text-[9px] text-purple-600 border border-purple-100 font-bold" title="History records count">
                                History: {player.historyCount}
                              </span>
                            )}
                            {player.teamPlayersCount > 0 && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-[9px] text-amber-600 border border-amber-100 font-bold" title="Active contract details">
                                Team Ref
                              </span>
                            )}
                            {!player.bidsCount && !player.roundBidsCount && !player.historyCount && !player.teamPlayersCount && (
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-slate-50 text-[9px] text-slate-400 font-bold border border-slate-100">
                                Clean (No Ref)
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className={`inline-block px-2 py-1 rounded border text-[10px] font-extrabold ${getPositionColor(player.position)}`}>
                            {player.position}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <span className="inline-block px-2 py-1 rounded bg-blue-50 border border-blue-200 text-[10px] font-extrabold text-blue-700">
                            {player.overall_rating}
                          </span>
                        </td>
                        <td className="py-2.5 px-4 text-slate-500">{player.club || 'N/A'}</td>
                        <td className="py-2.5 px-4 text-slate-500">{player.team_name || 'Free Agent'}</td>
                        <td className="py-2.5 px-4 text-slate-500">{player.nationality || 'N/A'}</td>
                        <td className="py-2.5 px-4 text-center">
                          {player.is_sold ? (
                            <span className="px-2 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 font-extrabold text-[9px] uppercase tracking-wider">
                              Sold
                            </span>
                          ) : (
                            <span className="px-2 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-400 font-extrabold text-[9px] uppercase tracking-wider">
                              Unsold
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-4 text-center">
                          <button
                            onClick={() => handleDeletePlayer(player.id, player.name)}
                            disabled={deletingId === player.id}
                            className="px-2.5 py-1 bg-red-50 hover:bg-red-100 disabled:bg-red-50 border border-red-200 text-red-600 font-bold rounded-lg text-[10px] uppercase transition-colors tracking-wide disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
                          >
                            {deletingId === player.id ? 'Deleting...' : 'Delete'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination controls */}
              {totalPages > 1 && (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-4 px-4 py-3 bg-slate-50 border border-slate-200/50 rounded-2xl">
                  <span className="text-[10px] text-slate-400 font-bold">
                    Showing {pageStart + 1} to {Math.min(pageEnd, filteredPlayers.length)} of {filteredPlayers.length} entries
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setCurrentPage(1)}
                      disabled={safePage === 1}
                      className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold rounded-lg disabled:opacity-50 cursor-pointer"
                    >
                      &laquo; First
                    </button>
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                      disabled={safePage === 1}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold rounded-lg disabled:opacity-50 cursor-pointer"
                    >
                      &lsaquo; Prev
                    </button>
                    <span className="px-3 text-[10px] font-bold text-slate-500">
                      Page {safePage} of {totalPages}
                    </span>
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                      disabled={safePage === totalPages}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold rounded-lg disabled:opacity-50 cursor-pointer"
                    >
                      Next &rsaquo;
                    </button>
                    <button
                      onClick={() => setCurrentPage(totalPages)}
                      disabled={safePage === totalPages}
                      className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold rounded-lg disabled:opacity-50 cursor-pointer"
                    >
                      Last &raquo;
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  
    </AuthGuard>
  )
}
