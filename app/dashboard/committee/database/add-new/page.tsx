'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { fetchWithTokenRefresh } from '@/lib/token-refresh'
import { 
import { normalizeStr } from '@/lib/utils/normalizeStr';
  ArrowLeft, 
  Search, 
  RefreshCw, 
  Database, 
  UserPlus, 
  AlertTriangle, 
  CheckCircle,
  HelpCircle,
  Plus,
  Info
} from 'lucide-react'

export default function AddScrapedPlayersPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newPlayers, setNewPlayers] = useState<any[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [searchTerm, setSearchTerm] = useState('')
  const [positionFilter, setPositionFilter] = useState('ALL')
  const [duplicateFilter, setDuplicateFilter] = useState<'all' | 'any_dup' | 'active_dup' | 'temp_dup' | 'no_dup' | 'diff_pos_dup'>('all')
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  // Expandable Rows State
  const [expandedPlayerIds, setExpandedPlayerIds] = useState<Set<string>>(new Set())

  const toggleExpandRow = (playerId: string) => {
    setExpandedPlayerIds(prev => {
      const next = new Set(prev)
      if (next.has(playerId)) {
        next.delete(playerId)
      } else {
        next.add(playerId)
      }
      return next
    })
  }

  // Sorting State
  const [sortField, setSortField] = useState<string>('overall_rating')
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc')

  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDirection(field === 'overall_rating' || field === 'player_id' ? 'desc' : 'asc')
    }
  }

  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm, positionFilter, duplicateFilter])

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
    if (!authLoading && user && user.role !== 'committee_admin') {
      router.push('/dashboard')
    }
  }, [user, authLoading, router])

  const fetchNewPlayers = async () => {
    try {
      setLoading(true)
      const res = await fetchWithTokenRefresh('/api/players/database/compare')
      const result = await res.json()
      if (result.success) {
        const createList = result.data.toCreate || []
        setNewPlayers(createList)
        // Default check all players
        setSelectedIds(new Set(createList.map((p: any) => p.player_id.toString())))
      } else {
        throw new Error(result.error)
      }
    } catch (e: any) {
      console.error('Error fetching new players:', e)
      alert(`Failed to load new players: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user?.role === 'committee_admin') {
      fetchNewPlayers()
    }
  }, [user])

  const handleToggleSelect = (playerId: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(playerId)) {
        next.delete(playerId)
      } else {
        next.add(playerId)
      }
      return next
    })
  }

  const handleSelectAll = () => {
    const visibleIds = filteredPlayers.map(p => p.player_id.toString())
    setSelectedIds(prev => {
      const next = new Set(prev)
      visibleIds.forEach(id => next.add(id))
      return next
    })
  }

  const handleDeselectAll = () => {
    const visibleIds = filteredPlayers.map(p => p.player_id.toString())
    setSelectedIds(prev => {
      const next = new Set(prev)
      visibleIds.forEach(id => next.delete(id))
      return next
    })
  }

  const handleAddPlayers = async () => {
    if (selectedIds.size === 0) {
      alert('Please select at least one player to add.')
      return
    }

    if (!confirm(`Are you sure you want to add the ${selectedIds.size} selected players to the active database?`)) {
      return
    }

    try {
      setAdding(true)
      const playerIdsArray = Array.from(selectedIds)
      
      const res = await fetchWithTokenRefresh('/api/players/database/add-scraped', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerIds: playerIdsArray })
      })

      const result = await res.json()
      if (result.success) {
        alert(result.message || `Successfully added players!`)
        // Filter out successfully added players from state list
        setNewPlayers(prev => prev.filter(p => !selectedIds.has(p.player_id.toString())))
        setSelectedIds(new Set())
      } else {
        throw new Error(result.error)
      }
    } catch (e: any) {
      alert(`Failed to add players: ${e.message}`)
    } finally {
      setAdding(false)
    }
  }

  const handleAddSinglePlayer = async (playerId: string, playerName: string) => {
    if (!confirm(`Are you sure you want to add ${playerName} to the active database?`)) {
      return
    }

    try {
      setAdding(true)
      const res = await fetchWithTokenRefresh('/api/players/database/add-scraped', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ playerIds: [playerId] })
      })

      const result = await res.json()
      if (result.success) {
        alert(result.message || `Successfully added ${playerName}!`)
        // Filter out successfully added player from state list
        setNewPlayers(prev => prev.filter(p => p.player_id.toString() !== playerId))
        setSelectedIds(prev => {
          const next = new Set(prev)
          next.delete(playerId)
          return next
        })
      } else {
        throw new Error(result.error)
      }
    } catch (e: any) {
      alert(`Failed to add player: ${e.message}`)
    } finally {
      setAdding(false)
    }
  }

  // Filter players
  const filteredPlayers = newPlayers.filter(p => {
    const matchesSearch = 
      normalizeStr(p.name).includes(normalizeStr(searchTerm)) ||
      normalizeStr(p.team_name).includes(normalizeStr(searchTerm)) ||
      normalizeStr(p.nationality).includes(normalizeStr(searchTerm)) ||
      p.player_id?.toString().includes(searchTerm)

    const matchesPosition = positionFilter === 'ALL' || p.position === positionFilter
    
    let matchesDuplicates = true
    if (duplicateFilter === 'any_dup') {
      matchesDuplicates = !!p.hasDuplicates
    } else if (duplicateFilter === 'active_dup') {
      matchesDuplicates = !!p.hasDuplicates && p.duplicates?.some((d: any) => d.source === 'active')
    } else if (duplicateFilter === 'temp_dup') {
      matchesDuplicates = !!p.hasDuplicates && p.duplicates?.some((d: any) => d.source === 'temp')
    } else if (duplicateFilter === 'no_dup') {
      matchesDuplicates = !p.hasDuplicates
    } else if (duplicateFilter === 'diff_pos_dup') {
      matchesDuplicates = !!p.hasDuplicates && p.duplicates?.some((d: any) => d.position !== p.position)
    }

    return matchesSearch && matchesPosition && matchesDuplicates
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

  // Helper to count position players
  const getPositionCount = (pos: string) => newPlayers.filter(p => p.position === pos).length

  // Pre-calculate duplicate filter counts
  const totalCount = newPlayers.length
  const noDupCount = newPlayers.filter(p => !p.hasDuplicates).length
  const anyDupCount = newPlayers.filter(p => p.hasDuplicates).length
  const activeDupCount = newPlayers.filter(p => p.hasDuplicates && p.duplicates?.some((d: any) => d.source === 'active')).length
  const tempDupCount = newPlayers.filter(p => p.hasDuplicates && p.duplicates?.some((d: any) => d.source === 'temp')).length
  const diffPosDupCount = newPlayers.filter(p => p.hasDuplicates && p.duplicates?.some((d: any) => d.position !== p.position)).length

  if (authLoading || loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center font-mono">
          <RefreshCw className="animate-spin h-10 w-10 text-blue-500 mx-auto mb-4" />
          <p className="text-slate-600 text-xs">Querying new scraped entries...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-blue-500/5 to-transparent pointer-events-none" />
      
      <div className="max-w-screen-2xl mx-auto relative z-10">
      {/* Header card */}
      <div className="glass rounded-3xl p-6 mb-8 shadow-lg bg-white border border-slate-200/60">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <UserPlus className="w-5 h-5 text-blue-500" />
              <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider">New Player Admissions</span>
            </div>
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Add Scraped Players</h1>
            <p className="text-slate-500 text-xs mt-1 max-w-xl font-mono">
              Review and select new players discovered on eFootball/pesdb.net that are not yet registered in the active database.
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
            
            {newPlayers.length > 0 && (
              <button
                onClick={handleAddPlayers}
                disabled={adding || selectedIds.size === 0}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {adding ? (
                  <>
                    <RefreshCw className="animate-spin w-4 h-4" />
                    Adding...
                  </>
                ) : (
                  <>
                    <Plus className="w-4 h-4" />
                    Add {selectedIds.size} Selected
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>

      {newPlayers.length === 0 ? (
        <div className="glass rounded-3xl p-12 text-center bg-white border border-slate-200/60 max-w-xl mx-auto shadow-md font-mono">
          <CheckCircle className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
          <h2 className="text-lg font-extrabold text-slate-700">All Scraped Players Synced</h2>
          <p className="text-slate-500 text-xs mt-2 leading-relaxed">
            There are currently no new scraped players missing in the active database registry.
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
          {/* Quick info note */}
          <div className="bg-blue-50/50 border border-blue-200/60 rounded-2xl p-4 flex items-center gap-3 text-blue-800">
            <Info className="w-5 h-5 text-blue-500 shrink-0" />
            <p className="text-[11px] leading-relaxed">
              These players are currently in the temporary table and can be added as new entries. Added players will automatically receive baseline eligibility flags, start as unsold Free Agents, and their records will be cleared from the temporary table.
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
                  <option value="ALL">ALL POSITIONS ({newPlayers.length})</option>
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

              {/* Duplicates filter selector */}
              {newPlayers.some(p => p.hasDuplicates) && (
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-500">Duplicates:</span>
                  <select
                    value={duplicateFilter}
                    onChange={(e) => setDuplicateFilter(e.target.value as any)}
                    className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                  >
                    <option value="all">SHOW ALL PLAYERS ({totalCount})</option>
                    <option value="no_dup">HIDE ALL POTENTIAL DUPLICATES ({noDupCount})</option>
                    <option value="any_dup">ALL POTENTIAL DUPLICATES ({anyDupCount})</option>
                    <option value="active_dup">ACTIVE DB DUPLICATES ONLY ({activeDupCount})</option>
                    <option value="temp_dup">TEMP DB DUPLICATES ONLY ({tempDupCount})</option>
                    <option value="diff_pos_dup">SAME NAME & NATION, DIFF POSITION ({diffPosDupCount})</option>
                  </select>
                </div>
              )}

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
                    <th className="py-3 px-4 w-12 text-center">Select</th>
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
                      <button type="button" onClick={() => handleSort('team_name')} className="font-bold uppercase tracking-wider flex items-center gap-1 focus:outline-none hover:text-slate-800 transition-colors cursor-pointer">
                        Team Club {sortField === 'team_name' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                      </button>
                    </th>
                    <th className="py-3 px-4">
                      <button type="button" onClick={() => handleSort('nationality')} className="font-bold uppercase tracking-wider flex items-center gap-1 focus:outline-none hover:text-slate-800 transition-colors cursor-pointer">
                        Nationality {sortField === 'nationality' ? (sortDirection === 'asc' ? '▲' : '▼') : '↕'}
                      </button>
                    </th>
                    <th className="py-3 px-4">Stats overview</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {paginatedPlayers.map((player) => {
                    const isChecked = selectedIds.has(player.player_id.toString())
                    const isExpanded = expandedPlayerIds.has(player.player_id.toString())
                    return (
                      <React.Fragment key={player.player_id}>
                        <tr className={`hover:bg-slate-50/50 transition-colors text-slate-700 ${isChecked ? 'bg-blue-50/10' : ''} ${isExpanded ? 'border-b-0 bg-slate-50/30' : ''}`}>
                          <td className="py-2.5 px-4 text-center">
                            <input
                              type="checkbox"
                              checked={isChecked}
                              onChange={() => handleToggleSelect(player.player_id.toString())}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 h-4 w-4 cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 px-4">
                            <img 
                              src={`https://pesdb.net/assets/img/card/f${player.player_id}max.png`} 
                              alt={player.name}
                              onError={(e) => { e.currentTarget.src = '/images/players/placeholder.webp' }}
                              className="w-8 h-11 object-contain rounded shadow-sm border border-slate-100" 
                            />
                          </td>
                          <td className="py-2.5 px-4 font-bold text-slate-500">{player.player_id}</td>
                          <td className="py-2.5 px-4">
                            <div className="flex flex-col">
                              <span className="font-extrabold text-slate-900">{player.name}</span>
                              {player.hasDuplicates && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpandRow(player.player_id.toString())}
                                  className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 mt-0.5 hover:underline cursor-pointer text-left w-fit focus:outline-none"
                                >
                                  <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                  Warning: {player.duplicates.filter((d: any) => d.source === 'active').length} in Active DB, {player.duplicates.filter((d: any) => d.source === 'temp').length} in Temp DB ({isExpanded ? 'Click to collapse' : 'Click to compare'})
                                </button>
                              )}
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <span className="inline-block px-2 py-1 rounded bg-slate-100 border border-slate-200 text-[10px] font-extrabold text-slate-700">
                              {player.position}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <span className="inline-block px-2 py-1 rounded bg-blue-50 border border-blue-200 text-[10px] font-extrabold text-blue-700">
                              {player.overall_rating}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-slate-500">{player.team_name || 'Free Agent'}</td>
                          <td className="py-2.5 px-4 text-slate-500">{player.nationality}</td>
                          <td className="py-2.5 px-4">
                            <div className="flex flex-wrap gap-1 text-[10px]">
                              <span className="bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded text-slate-500">PAC: <strong>{player.pace || 0}</strong></span>
                              <span className="bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded text-slate-500">SHO: <strong>{player.shooting || 0}</strong></span>
                              <span className="bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded text-slate-500">PAS: <strong>{player.passing || 0}</strong></span>
                              <span className="bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded text-slate-500">DRI: <strong>{player.dribbling || 0}</strong></span>
                              <span className="bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded text-slate-500">DEF: <strong>{player.defending || 0}</strong></span>
                              <span className="bg-slate-50 border border-slate-100 px-1.5 py-0.5 rounded text-slate-500">PHY: <strong>{player.physical || 0}</strong></span>
                            </div>
                          </td>
                          <td className="py-2.5 px-4 text-center">
                            <button
                              onClick={() => handleAddSinglePlayer(player.player_id.toString(), player.name)}
                              disabled={adding}
                              className="p-1 px-2.5 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-600 font-extrabold text-[10px] uppercase rounded transition-all inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <Plus className="w-3 h-3" />
                              Add
                            </button>
                          </td>
                        </tr>

                        {/* Expanded details comparisons */}
                        {isExpanded && player.hasDuplicates && (
                          <tr className="bg-slate-50/50">
                            <td colSpan={10} className="px-6 py-4 border-t border-slate-200/50">
                              <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm space-y-3 font-mono text-[11px] text-slate-600">
                                <h4 className="font-extrabold text-slate-800 text-[10px] uppercase tracking-wider flex items-center gap-1.5">
                                  <Info className="w-3.5 h-3.5 text-blue-500" />
                                  Duplicate Match Details & Attributes comparison
                                </h4>
                                
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                  {/* Left: Scraped Player details */}
                                  <div className="border border-blue-100 rounded-xl p-3 bg-blue-50/10">
                                    <div className="text-[10px] font-bold text-blue-500 uppercase font-mono mb-2">Scraped Player (New Entry)</div>
                                    <div className="space-y-1.5">
                                      <div>Name: <strong className="text-slate-900 font-extrabold">{player.name}</strong></div>
                                      <div>Player ID: <strong className="text-slate-800 font-bold">{player.player_id}</strong></div>
                                      <div>Position: <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 text-[10px] font-extrabold text-slate-700">{player.position}</span></div>
                                      <div>OVR Rating: <span className="px-1.5 py-0.5 rounded bg-blue-50 border border-blue-200 text-[10px] font-extrabold text-blue-700">{player.overall_rating}</span></div>
                                      <div>Club: <strong className="text-slate-800 font-bold">{player.team_name || 'Free Agent'}</strong></div>
                                      <div>Nationality: <strong className="text-slate-800 font-bold">{player.nationality}</strong></div>
                                    </div>
                                  </div>

                                  {/* Right: Existing matching players */}
                                  <div className="space-y-3">
                                    {player.duplicates.map((dup: any, idx: number) => (
                                      <div key={idx} className="border border-amber-100 rounded-xl p-3 bg-amber-50/10">
                                        <div className="text-[9px] font-bold text-amber-600 uppercase font-mono mb-2 flex justify-between">
                                          <span>Existing Match #{idx + 1}</span>
                                          <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-extrabold">Found in {dup.source === 'active' ? 'Active DB' : 'Scraped Temp DB'}</span>
                                        </div>
                                        <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-slate-600">
                                          <div>Name: <strong className="text-slate-800 font-bold">{dup.name}</strong></div>
                                          <div>ID: <strong className="text-slate-800 font-bold">{dup.player_id}</strong></div>
                                          <div>Position: <strong className="text-slate-800 font-bold">{dup.position}</strong></div>
                                          <div>OVR: <strong className="text-slate-800 font-bold">{dup.overall_rating}</strong></div>
                                          <div>Club/Team: <strong className="text-slate-800 font-bold">{dup.club || dup.team_name || 'Free Agent'}</strong></div>
                                          <div>Nationality: <strong className="text-slate-800 font-bold">{dup.nationality}</strong></div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })}
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
  )
}
