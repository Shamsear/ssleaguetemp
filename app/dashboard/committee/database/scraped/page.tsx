'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { fetchWithTokenRefresh } from '@/lib/token-refresh'
import { 
  ArrowLeft, 
  Search, 
  Trash2, 
  RefreshCw, 
  Filter, 
  Database, 
  Users, 
  Activity, 
  CheckCircle, 
  ChevronRight,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  TrendingUp,
  AlertCircle
} from 'lucide-react'

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200]

export default function ScrapedPlayersViewPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  
  const [loading, setLoading] = useState(true)
  const [players, setPlayers] = useState<any[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [positionFilter, setPositionFilter] = useState('ALL')
  const [minRatingFilter, setMinRatingFilter] = useState('')
  const [clearing, setClearing] = useState(false)

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
    if (!authLoading && user && user.role !== 'committee_admin') {
      router.push('/dashboard')
    }
  }, [user, authLoading, router])

  const fetchScrapedPlayers = async () => {
    try {
      setLoading(true)
      const res = await fetchWithTokenRefresh('/api/players/database/temp')
      const result = await res.json()
      if (result.success) {
        setPlayers(result.players || [])
      } else {
        throw new Error(result.error)
      }
    } catch (e: any) {
      console.error('Error fetching temp players:', e)
      alert(`Failed to load scraped players: ${e.message}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (user?.role === 'committee_admin') {
      fetchScrapedPlayers()
    }
  }, [user])

  const handleClearTempDb = async () => {
    if (!confirm('Are you sure you want to clear ALL scraped players from the temporary import table? This cannot be undone.')) {
      return
    }

    try {
      setClearing(true)
      const res = await fetchWithTokenRefresh('/api/players/database/temp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'clear' })
      })
      const result = await res.json()
      
      if (result.success) {
        setPlayers([])
        alert('Temporary database cleared successfully!')
      } else {
        throw new Error(result.error)
      }
    } catch (e: any) {
      alert(`Error clearing table: ${e.message}`)
    } finally {
      setClearing(false)
    }
  }

  // Filter logic — reset to page 1 on any filter change
  const filteredPlayers = useMemo(() => {
    setCurrentPage(1)
    return players.filter(p => {
      const matchesSearch = 
        p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.team_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.nationality?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        p.player_id?.toString().includes(searchTerm)

      const matchesPosition = positionFilter === 'ALL' || p.position === positionFilter
      const matchesRating = minRatingFilter === '' || Number(p.overall_rating) >= Number(minRatingFilter)

      return matchesSearch && matchesPosition && matchesRating
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, searchTerm, positionFilter, minRatingFilter])

  // Pagination calculations
  const totalPages = Math.max(1, Math.ceil(filteredPlayers.length / pageSize))
  const safePage = Math.min(currentPage, totalPages)
  const pageStart = (safePage - 1) * pageSize
  const pageEnd = pageStart + pageSize
  const pagePlayers = filteredPlayers.slice(pageStart, pageEnd)

  // Quick stats
  const totalCount = players.length
  const filteredCount = filteredPlayers.length
  const avgRating = totalCount > 0 
    ? Math.round(players.reduce((sum, p) => sum + (p.overall_rating || 0), 0) / totalCount)
    : 0

  const positionCounts = players.reduce((acc: any, p) => {
    acc[p.position] = (acc[p.position] || 0) + 1
    return acc
  }, {})

  const goToPage = (n: number) => setCurrentPage(Math.max(1, Math.min(n, totalPages)))

  // Build compact page window (shows up to 5 page buttons)
  const pageWindow = useMemo(() => {
    const delta = 2
    const pages: (number | '...')[] = []
    const left = Math.max(2, safePage - delta)
    const right = Math.min(totalPages - 1, safePage + delta)
    pages.push(1)
    if (left > 2) pages.push('...')
    for (let i = left; i <= right; i++) pages.push(i)
    if (right < totalPages - 1) pages.push('...')
    if (totalPages > 1) pages.push(totalPages)
    return pages
  }, [safePage, totalPages])

  if (authLoading || loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <RefreshCw className="animate-spin h-10 w-10 text-emerald-500 mx-auto mb-4" />
          <p className="text-slate-600 font-mono text-xs">Loading temporary database registry...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-screen-2xl">
      {/* Top Banner Header */}
      <div className="glass rounded-3xl p-6 mb-8 shadow-lg bg-white border border-slate-200/60">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Database className="w-5 h-5 text-emerald-500" />
              <span className="text-xs font-bold text-slate-400 font-mono uppercase tracking-wider">Temporary Import Registry</span>
            </div>
            <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight">Scraped Players View</h1>
            <p className="text-slate-500 text-xs mt-1 max-w-xl font-mono">
              Review and audit scraped players currently stored inside the `temp_players_import` table on Neon.
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
            
            {players.length > 0 && (
              <>
                <button
                  onClick={fetchScrapedPlayers}
                  disabled={loading}
                  className="px-4 py-2.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  Refresh
                </button>

                <button
                  onClick={handleClearTempDb}
                  disabled={clearing}
                  className="px-4 py-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-4 h-4 text-rose-500" />
                  Clear Temp DB
                </button>

                <Link
                  href="/dashboard/committee/database/update-preview"
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center gap-1.5"
                >
                  Sync to Active DB
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      {players.length === 0 ? (
        <div className="glass rounded-3xl p-12 text-center bg-white border border-slate-200/60 max-w-xl mx-auto shadow-md">
          <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-4" />
          <h2 className="text-lg font-extrabold text-slate-700 font-mono">Scraped Registry is Empty</h2>
          <p className="text-slate-500 text-xs mt-2 leading-relaxed font-mono">
            No player stats have been crawled yet. Go back to the Database Scraper Console to select a position and trigger a live import job.
          </p>
          <Link
            href="/dashboard/committee/database"
            className="mt-5 inline-block px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
          >
            Go to Database Scraper
          </Link>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Quick Metrics Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 font-mono">
            <div className="glass bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Scraped</div>
                <div className="text-2xl font-black text-slate-800">{totalCount}</div>
              </div>
            </div>

            <div className="glass bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Average OVR</div>
                <div className="text-2xl font-black text-slate-800">{avgRating}</div>
              </div>
            </div>

            <div className="glass bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm col-span-2 overflow-x-auto">
              <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-2">By Position counts</div>
              <div className="flex gap-2 flex-wrap">
                {Object.entries(positionCounts).map(([pos, count]: any) => (
                  <span key={pos} className="bg-slate-50 border border-slate-200 px-2 py-1 rounded-lg text-[10px] font-extrabold text-slate-600">
                    {pos}: <strong className="text-emerald-600">{count}</strong>
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Filtering Controls */}
          <div className="glass bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search Bar */}
              <div className="relative flex-grow max-w-md">
                <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search name, club, nationality, or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-slate-50 border border-slate-200/80 rounded-xl pl-10 pr-4 py-2.5 w-full text-xs font-mono focus:outline-none focus:bg-white focus:ring-1 focus:ring-slate-300 transition-all"
                />
              </div>

              {/* Position Filter */}
              <div className="flex items-center gap-2 font-mono text-xs">
                <Filter className="w-4 h-4 text-slate-400" />
                <span className="font-bold text-slate-500">Position:</span>
                <select
                  value={positionFilter}
                  onChange={(e) => setPositionFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                >
                  <option value="ALL">ALL POSITIONS</option>
                  <option value="GK">GK</option>
                  <option value="CB">CB</option>
                  <option value="LB">LB</option>
                  <option value="RB">RB</option>
                  <option value="DMF">DMF</option>
                  <option value="CMF">CMF</option>
                  <option value="LMF">LMF</option>
                  <option value="RMF">RMF</option>
                  <option value="AMF">AMF</option>
                  <option value="LWF">LWF</option>
                  <option value="RWF">RWF</option>
                  <option value="SS">SS</option>
                  <option value="CF">CF</option>
                </select>
              </div>

              {/* Min Rating Filter */}
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="font-bold text-slate-500">Min OVR:</span>
                <input
                  type="number"
                  min="40"
                  max="100"
                  placeholder="e.g. 80"
                  value={minRatingFilter}
                  onChange={(e) => setMinRatingFilter(e.target.value)}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 w-20 text-xs focus:outline-none"
                />
              </div>

              {/* Page Size */}
              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="font-bold text-slate-500">Per page:</span>
                <select
                  value={pageSize}
                  onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1) }}
                  className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-bold focus:outline-none"
                >
                  {PAGE_SIZE_OPTIONS.map(n => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>

              {/* Result counter */}
              <div className="ml-auto text-[11px] font-mono font-bold text-slate-400">
                Showing {pageStart + 1}–{Math.min(pageEnd, filteredCount)} of {filteredCount} players
              </div>
            </div>

            {/* Players Table */}
            <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm">
              <table className="w-full text-left font-mono text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200/50 text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    <th className="py-3 px-4">Thumbnail</th>
                    <th className="py-3 px-4">Player ID</th>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4 text-center">Pos</th>
                    <th className="py-3 px-4 text-center">OVR</th>
                    <th className="py-3 px-4">Team Club</th>
                    <th className="py-3 px-4">Nationality</th>
                    <th className="py-3 px-4 text-center">Age</th>
                    <th className="py-3 px-4">Playing Style</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {pagePlayers.map((player) => (
                    <tr key={player.player_id} className="hover:bg-slate-50/50 transition-colors text-slate-700">
                      <td className="py-2.5 px-4">
                        <img 
                          src={`https://pesdb.net/assets/img/card/f${player.player_id}max.png`} 
                          alt={player.name}
                          onError={(e) => {
                            e.currentTarget.src = '/images/players/placeholder.webp'
                          }}
                          className="w-10 h-14 object-contain rounded shadow-sm border border-slate-100" 
                        />
                      </td>
                      <td className="py-2.5 px-4 font-bold text-slate-500">{player.player_id}</td>
                      <td className="py-2.5 px-4 font-extrabold text-slate-900">{player.name}</td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="inline-block px-2 py-1 rounded bg-slate-100 border border-slate-200 text-[10px] font-extrabold text-slate-700">
                          {player.position}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-center">
                        <span className="inline-block px-2 py-1 rounded bg-emerald-50 border border-emerald-200 text-[10px] font-extrabold text-emerald-700">
                          {player.overall_rating}
                        </span>
                      </td>
                      <td className="py-2.5 px-4 text-slate-500">{player.team_name || 'Free Agent'}</td>
                      <td className="py-2.5 px-4 text-slate-500">{player.nationality}</td>
                      <td className="py-2.5 px-4 text-center text-slate-500">{player.age || '-'}</td>
                      <td className="py-2.5 px-4 text-slate-500 text-[11px]">{player.playing_style || '-'}</td>
                    </tr>
                  ))}

                  {pagePlayers.length === 0 && (
                    <tr>
                      <td colSpan={9} className="py-10 text-center text-slate-400 font-mono text-xs">
                        No players match the current filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex flex-wrap items-center justify-between gap-4 pt-2 font-mono text-xs">
                <span className="text-slate-500 font-bold">
                  Page <strong className="text-slate-800">{safePage}</strong> of <strong className="text-slate-800">{totalPages}</strong>
                </span>

                <div className="flex items-center gap-1.5">
                  {/* First */}
                  <button
                    onClick={() => goToPage(1)}
                    disabled={safePage === 1}
                    className="p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                    title="First page"
                  >
                    <ChevronsLeft className="w-3.5 h-3.5 text-slate-600" />
                  </button>

                  {/* Prev */}
                  <button
                    onClick={() => goToPage(safePage - 1)}
                    disabled={safePage === 1}
                    className="p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                    title="Previous page"
                  >
                    <ChevronLeft className="w-3.5 h-3.5 text-slate-600" />
                  </button>

                  {/* Page window */}
                  {pageWindow.map((pg, idx) =>
                    pg === '...'
                      ? <span key={`ellipsis-${idx}`} className="px-2 text-slate-400 select-none">…</span>
                      : (
                        <button
                          key={pg}
                          onClick={() => goToPage(pg as number)}
                          className={`w-8 h-8 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                            pg === safePage
                              ? 'bg-slate-800 border-slate-800 text-white shadow'
                              : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {pg}
                        </button>
                      )
                  )}

                  {/* Next */}
                  <button
                    onClick={() => goToPage(safePage + 1)}
                    disabled={safePage === totalPages}
                    className="p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                    title="Next page"
                  >
                    <ChevronRight className="w-3.5 h-3.5 text-slate-600" />
                  </button>

                  {/* Last */}
                  <button
                    onClick={() => goToPage(totalPages)}
                    disabled={safePage === totalPages}
                    className="p-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer"
                    title="Last page"
                  >
                    <ChevronsRight className="w-3.5 h-3.5 text-slate-600" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
