'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { fetchWithTokenRefresh } from '@/lib/token-refresh'
import { 
  ArrowLeft, 
  Search, 
  RefreshCw, 
  Database, 
  CheckCircle,
  AlertTriangle,
  UserMinus,
  UserPlus,
  HelpCircle,
  ExternalLink
} from 'lucide-react'
import AuthGuard from '@/components/auth/AuthGuard';

const PLAYERS_PER_PAGE = 50

export default function RetiredPlayersPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  
  const [loading, setLoading] = useState(true)
  const [players, setPlayers] = useState<any[]>([])
  const [totalPlayersCount, setTotalPlayersCount] = useState(0)
  const [searchTerm, setSearchTerm] = useState('')
  const [positionFilter, setPositionFilter] = useState('')
  const [activeTab, setActiveTab] = useState<'active' | 'retired'>('active')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isBulkProcessing, setIsBulkProcessing] = useState(false)
  const [processingId, setProcessingId] = useState<string | null>(null)
  
  // Real-world retirement verification state
  const [verifiedStatus, setVerifiedStatus] = useState<{
    [key: string]: { loading: boolean; retired: boolean | null; summary?: string; url?: string }
  }>({})
  
  // Pagination State
  const [currentPage, setCurrentPage] = useState(1)

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
    setCurrentPage(1)
  }

  // Clear selections when switching tabs or filters
  useEffect(() => {
    setSelectedIds(new Set())
    setCurrentPage(1)
  }, [activeTab, positionFilter])

  // Reset to page 1 when search query changes
  useEffect(() => {
    setCurrentPage(1)
  }, [searchTerm])

  const fetchPlayers = useCallback(async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({
        limit: PLAYERS_PER_PAGE.toString(),
        offset: ((currentPage - 1) * PLAYERS_PER_PAGE).toString(),
      })

      if (sortField) {
        params.append('sortBy', sortField)
      }
      if (sortDirection) {
        params.append('sortOrder', sortDirection)
      }

      if (activeTab === 'retired') {
        params.append('retired', 'true')
      } else {
        params.append('retired', 'false')
      }

      if (positionFilter) {
        params.append('position', positionFilter)
      }

      if (searchTerm.trim()) {
        params.append('search', searchTerm.trim())
      }

      const res = await fetchWithTokenRefresh(`/api/players?${params.toString()}`)
      const result = await res.json()
      if (result.success) {
        setPlayers(result.data || [])
        setTotalPlayersCount(result.totalCount || 0)
      } else {
        throw new Error(result.error)
      }
    } catch (e: any) {
      console.error('Error fetching players:', e)
      alert(`Failed to load players: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }, [currentPage, activeTab, positionFilter, searchTerm, sortField, sortDirection])

  useEffect(() => {
    if (user && user.role === 'committee_admin') {
      fetchPlayers()
    }
  }, [user, fetchPlayers])

  const checkRealWorldStatus = useCallback(async (id: string, name: string, nation: string, force = false) => {
    setVerifiedStatus(prev => {
      // Don't overwrite if already loading or fetched (unless forced)
      if (prev[id] && !force) return prev;
      return {
        ...prev,
        [id]: { loading: true, retired: null }
      };
    })
    
    try {
      const res = await fetch(`/api/players/check-real-world-retirement?name=${encodeURIComponent(name)}&nationality=${encodeURIComponent(nation)}`)
      const result = await res.json()
      if (result.success) {
        setVerifiedStatus(prev => ({
          ...prev,
          [id]: { 
            loading: false, 
            retired: result.retired, 
            summary: result.summary, 
            url: result.url,
            thumbnail: result.thumbnail
          }
        }))
      } else {
        throw new Error(result.error)
      }
    } catch (e: any) {
      setVerifiedStatus(prev => ({
        ...prev,
        [id]: { loading: false, retired: null, summary: e.message || 'Error loading verification.' }
      }))
    }
  }, [])

  // Auto-run status verification for all visible players in current viewport slice (staggered in 5-worker parallel lanes for maximum speed)
  useEffect(() => {
    const timers: NodeJS.Timeout[] = [];
    const CONCURRENT_WORKERS = 5;
    const BATCH_STAGGER_MS = 120;
    
    if (players.length > 0) {
      players.forEach((player, index) => {
        // Only queue if we haven't checked or queued this player yet
        if (!verifiedStatus[player.id]) {
          const batchIndex = Math.floor(index / CONCURRENT_WORKERS);
          const timer = setTimeout(() => {
            checkRealWorldStatus(player.id, player.name, player.nationality);
          }, batchIndex * BATCH_STAGGER_MS); // Fire 5 requests in parallel, then wait 120ms before firing next 5
          
          timers.push(timer);
        }
      });
    }

    return () => {
      // Clear any pending timers when page changes or component updates
      timers.forEach(t => clearTimeout(t));
    };
  }, [players, verifiedStatus, checkRealWorldStatus])

  const handleToggleStatus = async (id: string, name: string, makeRetired: boolean) => {
    const actionText = makeRetired ? 'retire' : 'reactivate'
    const confirmMessage = makeRetired 
      ? `Are you sure you want to retire "${name}"? They will be removed from all active auction pages and roster assignments.`
      : `Are you sure you want to reactivate "${name}"? They will be restored to active rosters and search lists.`
      
    if (!confirm(confirmMessage)) {
      return
    }

    try {
      setProcessingId(id)
      const res = await fetchWithTokenRefresh(`/api/players/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ retired: makeRetired })
      })

      const result = await res.json()
      if (result.success) {
        alert(`Successfully ${makeRetired ? 'retired' : 'reactivated'} ${name}.`)
        fetchPlayers()
        setSelectedIds(prev => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      } else {
        throw new Error(result.error)
      }
    } catch (e: any) {
      alert(`Failed to update player status: ${e.message}`)
    } finally {
      setProcessingId(null)
    }
  }

  const handleBulkToggle = async () => {
    if (selectedIds.size === 0) return
    const makeRetired = activeTab === 'active'
    
    if (!confirm(`Are you sure you want to ${makeRetired ? 'retire' : 'reactivate'} the ${selectedIds.size} selected players?`)) {
      return
    }

    try {
      setIsBulkProcessing(true)
      const idsToProcess = Array.from(selectedIds)
      
      const promises = idsToProcess.map(id => 
        fetchWithTokenRefresh(`/api/players/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ retired: makeRetired })
        }).then(res => res.json())
      )

      const results = await Promise.all(promises)
      const successfulActions = results.filter(r => r.success).length
      
      alert(`Successfully ${makeRetired ? 'retired' : 'reactivated'} ${successfulActions} of ${idsToProcess.length} players.`)
      
      fetchPlayers()
      setSelectedIds(new Set())
    } catch (e: any) {
      alert(`Failed during bulk update: ${e.message}`)
    } finally {
      setIsBulkProcessing(false)
    }
  }

  const handleToggleSelectAll = (visiblePlayers: any[]) => {
    const visibleIds = visiblePlayers.map(p => p.id)
    const allSelected = visibleIds.every(id => selectedIds.has(id))
    
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (allSelected) {
        visibleIds.forEach(id => next.delete(id))
      } else {
        visibleIds.forEach(id => next.add(id))
      }
      return next
    })
  }

  const handleToggleSelectRow = (id: string) => {
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

  const totalPages = Math.ceil(totalPlayersCount / PLAYERS_PER_PAGE)
  const isAllVisibleSelected = players.length > 0 && players.every(p => selectedIds.has(p.id))

  // Constant list of positions for filters
  const positions = ['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'LMF', 'RMF', 'AMF', 'LWF', 'RWF', 'SS', 'CF']

  if (authLoading || (loading && players.length === 0)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 font-mono">
        <div className="text-center font-mono">
          <RefreshCw className="animate-spin h-10 w-10 text-purple-650 mx-auto mb-4" />
          <p className="text-slate-600 text-xs">Querying database entries...</p>
        </div>
      </div>
    )
  }

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-purple-500/5 to-transparent pointer-events-none" />

      <div className="max-w-screen-2xl mx-auto relative z-10 space-y-6">
        
        {/* Header card */}
        <div className="glass rounded-3xl p-6 shadow-lg bg-white border border-slate-200/60">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div className="space-y-1">
              <Link 
                href="/dashboard/committee/database"
                className="inline-flex items-center gap-1.5 text-[10px] font-bold font-mono uppercase tracking-wider text-slate-450 hover:text-purple-600 transition-colors"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Database Manager
              </Link>
              
              <div className="flex items-center gap-3 mt-1">
                <div className="p-2.5 bg-purple-50 text-purple-600 border border-purple-100 rounded-2xl">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Roster Retirement Manager</h1>
                  <p className="text-slate-555 text-xs mt-1 font-mono">
                    Retire active database players or reactivate retired ones from a single dashboard
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={fetchPlayers}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Refresh List
              </button>
            </div>
          </div>
        </div>

        {/* Tabs Control */}
        <div className="flex gap-2 p-1.5 bg-white border border-slate-200/60 rounded-2xl max-w-md shadow-sm">
          <button
            onClick={() => setActiveTab('active')}
            className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer text-center ${
              activeTab === 'active' 
                ? 'bg-purple-600 text-white shadow-md' 
                : 'hover:bg-slate-50 text-slate-500'
            }`}
          >
            Active Roster (To Retire)
          </button>
          <button
            onClick={() => setActiveTab('retired')}
            className={`flex-1 py-2 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer text-center ${
              activeTab === 'retired' 
                ? 'bg-purple-600 text-white shadow-md' 
                : 'hover:bg-slate-50 text-slate-500'
            }`}
          >
            Retired Registry
          </button>
        </div>

        {/* Filters Panel */}
        <div className="glass rounded-3xl p-5 shadow-md bg-white border border-slate-200/60 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Search className="w-4 h-4" />
              </span>
              <input
                type="text"
                placeholder={activeTab === 'active' ? "Search active roster..." : "Search retired registry..."}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-55 border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-550/20 focus:border-purple-550/80 text-xs font-semibold text-slate-800 placeholder:text-slate-400"
              />
            </div>

            <div className="relative">
              <select
                value={positionFilter}
                onChange={(e) => setPositionFilter(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-55 border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-purple-550/20 focus:border-purple-550/80 text-xs font-bold uppercase tracking-wider text-slate-600 appearance-none cursor-pointer"
              >
                <option value="">All Positions</option>
                {positions.map(pos => (
                  <option key={pos} value={pos}>{pos}</option>
                ))}
              </select>
              <div className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>

            <div className="flex items-center justify-end">
              <div className="text-[11px] font-mono font-bold text-slate-500 uppercase">
                Total matching: <span className="text-purple-650 font-extrabold">{totalPlayersCount}</span> Players
              </div>
            </div>
          </div>
        </div>

        {/* Bulk Action Banner */}
        {selectedIds.size > 0 && (
          <div className="bg-purple-50/85 border border-purple-100 rounded-xl p-4 flex items-center justify-between gap-4 animate-fade-in shadow-sm">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-purple-600" />
              <span className="text-xs font-bold font-mono text-purple-700 uppercase">
                {selectedIds.size} player{selectedIds.size > 1 ? 's' : ''} selected
              </span>
            </div>
            <button
              onClick={handleBulkToggle}
              disabled={isBulkProcessing}
              className={`px-4 py-1.5 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-lg transition-all shadow-md flex items-center gap-1.5 disabled:opacity-50 cursor-pointer ${
                activeTab === 'active' ? 'bg-orange-600 hover:bg-orange-550' : 'bg-emerald-600 hover:bg-emerald-550'
              }`}
            >
              {isBulkProcessing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : activeTab === 'active' ? (
                <UserMinus className="w-3.5 h-3.5" />
              ) : (
                <UserPlus className="w-3.5 h-3.5" />
              )}
              {activeTab === 'active' ? 'Retire Selected' : 'Reactivate Selected'}
            </button>
          </div>
        )}

        {/* Players List Table */}
        <div className="glass rounded-3xl overflow-hidden shadow-lg border border-slate-200/60 bg-white">
          {loading ? (
            <div className="py-16 text-center text-slate-500">
              <RefreshCw className="w-10 h-10 mx-auto text-purple-500 animate-spin mb-4" />
              <p className="text-xs font-bold font-mono text-slate-400 uppercase">Updating roster viewport...</p>
            </div>
          ) : players.length === 0 ? (
            <div className="py-16 text-center text-slate-500">
              <AlertTriangle className="w-12 h-12 mx-auto text-slate-350 mb-4 animate-bounce" />
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-1">No Players Found</h3>
              <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
                There are currently no matching entries in this registry view
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50 font-mono text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                    <th className="p-4 w-12 text-center">
                      <input
                        type="checkbox"
                        checked={isAllVisibleSelected}
                        onChange={() => handleToggleSelectAll(players)}
                        className="rounded border-slate-200 text-purple-650 focus:ring-purple-500/20 bg-slate-55 cursor-pointer"
                      />
                    </th>
                    <th className="p-4 w-16">Photo</th>
                    <th className="p-4 cursor-pointer hover:text-slate-800 transition-colors" onClick={() => handleSort('player_id')}>
                      ID {sortField === 'player_id' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th className="p-4 cursor-pointer hover:text-slate-800 transition-colors" onClick={() => handleSort('name')}>
                      Name {sortField === 'name' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th className="p-4">Nation</th>
                    <th className="p-4 text-center">Position</th>
                    <th className="p-4 cursor-pointer hover:text-slate-800 text-center transition-colors" onClick={() => handleSort('overall_rating')}>
                      Ovr {sortField === 'overall_rating' ? (sortDirection === 'asc' ? '▲' : '▼') : ''}
                    </th>
                    <th className="p-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono text-xs text-slate-700">
                  {players.map((player) => (
                    <tr key={player.id} className="hover:bg-slate-50/40 transition-colors font-mono">
                      <td className="p-4 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(player.id)}
                          onChange={() => handleToggleSelectRow(player.id)}
                          className="rounded border-slate-200 text-purple-650 focus:ring-purple-500/20 bg-slate-55 cursor-pointer"
                        />
                      </td>
                      <td className="p-4">
                        <img
                          src={player.player_id ? `/images/players/${player.player_id}.webp` : '/images/player-placeholder.png'}
                          onError={(e) => {
                            (e.target as HTMLImageElement).src = '/images/player-placeholder.png'
                          }}
                          alt=""
                          className="w-8 h-10 object-contain rounded-md bg-slate-55 border border-slate-200/50"
                        />
                      </td>
                      <td className="p-4 text-slate-500 font-semibold">{player.player_id || '--'}</td>
                      <td className="p-4 font-bold text-slate-800">
                        <div>
                          <div className="font-extrabold uppercase text-slate-900 tracking-wide">{player.name}</div>
                          <div className="mt-1 flex items-center gap-1.5 font-sans">
                            {verifiedStatus[player.id] ? (
                              verifiedStatus[player.id].loading ? (
                                <span className="text-[9px] text-slate-400 font-bold animate-pulse font-mono uppercase">
                                  Checking real-world status...
                                </span>
                              ) : verifiedStatus[player.id].retired === true ? (
                                <div className="flex items-center gap-2">
                                  {verifiedStatus[player.id].thumbnail && (
                                    <img 
                                      src={verifiedStatus[player.id].thumbnail} 
                                      alt="" 
                                      className="w-7 h-7 rounded-full object-cover border border-rose-100 shadow-sm"
                                      title="Wikipedia Profile Photo"
                                    />
                                  )}
                                  <a 
                                    href={verifiedStatus[player.id].url} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="inline-flex items-center gap-0.5 text-[9px] font-extrabold bg-rose-50 text-rose-700 border border-rose-100 rounded px-1.5 py-0.5 hover:bg-rose-100 transition-colors"
                                    title={verifiedStatus[player.id].summary}
                                  >
                                    🔴 Retired in Real World <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                </div>
                              ) : verifiedStatus[player.id].retired === false ? (
                                <div className="flex items-center gap-2">
                                  {verifiedStatus[player.id].thumbnail && (
                                    <img 
                                      src={verifiedStatus[player.id].thumbnail} 
                                      alt="" 
                                      className="w-7 h-7 rounded-full object-cover border border-emerald-100 shadow-sm"
                                      title="Wikipedia Profile Photo"
                                    />
                                  )}
                                  <a 
                                    href={verifiedStatus[player.id].url} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="inline-flex items-center gap-0.5 text-[9px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-100 rounded px-1.5 py-0.5 hover:bg-emerald-100 transition-colors"
                                    title={verifiedStatus[player.id].summary}
                                  >
                                    🟢 Active in Real World <ExternalLink className="w-2.5 h-2.5" />
                                  </a>
                                </div>
                              ) : (
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[9px] text-slate-450 font-bold font-mono" title={verifiedStatus[player.id].summary}>
                                    No article found
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => checkRealWorldStatus(player.id, player.name, player.nationality, true)}
                                    className="text-[9px] text-purple-650 hover:text-purple-800 hover:underline font-bold font-mono uppercase cursor-pointer"
                                  >
                                    (Retry)
                                  </button>
                                </div>
                              )
                            ) : (
                              <span className="text-[9px] text-slate-400 font-bold animate-pulse font-mono uppercase">
                                Queueing check...
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="p-4 text-slate-500 font-semibold uppercase">{player.nationality || '--'}</td>
                      <td className="p-4 text-center">
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-55 text-slate-600 border border-slate-200/60 uppercase tracking-wider">
                          {player.position || '--'}
                        </span>
                      </td>
                      <td className="p-4 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-100/30">
                          {player.overall_rating || '--'}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {activeTab === 'active' ? (
                          <button
                            onClick={() => handleToggleStatus(player.id, player.name, true)}
                            disabled={processingId === player.id}
                            className="px-3 py-1.5 bg-orange-50 hover:bg-orange-500 hover:text-white border border-orange-250 text-orange-600 rounded-lg transition-all font-bold text-[10px] uppercase tracking-wider cursor-pointer"
                          >
                            Retire
                          </button>
                        ) : (
                          <button
                            onClick={() => handleToggleStatus(player.id, player.name, false)}
                            disabled={processingId === player.id}
                            className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-500 hover:text-white border border-emerald-250 text-emerald-600 rounded-lg transition-all font-bold text-[10px] uppercase tracking-wider cursor-pointer"
                          >
                            Reactivate
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination Footer */}
          {totalPages > 1 && (
            <div className="bg-slate-55 border-t border-slate-200/60 p-4 flex flex-col sm:flex-row items-center justify-between gap-4 font-mono text-[10px] uppercase font-bold text-slate-500">
              <div>
                Showing <strong className="text-slate-800">{((currentPage - 1) * PLAYERS_PER_PAGE) + 1}</strong> to <strong className="text-slate-800">{Math.min(currentPage * PLAYERS_PER_PAGE, totalPlayersCount)}</strong> of <strong className="text-slate-800">{totalPlayersCount}</strong> players
              </div>
              
              <div className="flex items-center gap-1.5">
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200/60 rounded disabled:opacity-40 disabled:hover:bg-white cursor-pointer disabled:cursor-not-allowed"
                >
                  ≪
                </button>
                <button
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200/60 rounded disabled:opacity-40 disabled:hover:bg-white cursor-pointer disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                
                <span className="px-3 text-slate-800 font-bold">
                  Page {currentPage} of {totalPages}
                </span>

                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200/60 rounded disabled:opacity-40 disabled:hover:bg-white cursor-pointer disabled:cursor-not-allowed"
                >
                  Next
                </button>
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                  className="px-2.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200/60 rounded disabled:opacity-40 disabled:hover:bg-white cursor-pointer disabled:cursor-not-allowed"
                >
                  ≫
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  
    </AuthGuard>
  )
}
