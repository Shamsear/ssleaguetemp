'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { fetchWithTokenRefresh } from '@/lib/token-refresh'
import { 
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
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false)

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

  // Filter players
  const filteredPlayers = newPlayers.filter(p => {
    const matchesSearch = 
      p.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.team_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.nationality?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.player_id?.toString().includes(searchTerm)

    const matchesPosition = positionFilter === 'ALL' || p.position === positionFilter
    const matchesDuplicates = !showDuplicatesOnly || p.hasDuplicates

    return matchesSearch && matchesPosition && matchesDuplicates
  })

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
    <div className="container mx-auto px-4 py-8 max-w-screen-2xl">
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

              {/* Duplicates checkbox filter */}
              {newPlayers.some(p => p.hasDuplicates) && (
                <label className="flex items-center gap-2 font-bold text-slate-600 select-none cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showDuplicatesOnly}
                    onChange={(e) => setShowDuplicatesOnly(e.target.checked)}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Potential Duplicates Only</span>
                </label>
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
                  <tr className="bg-slate-50/80 border-b border-slate-200/50 text-[10px] text-slate-500 uppercase font-bold tracking-wider">
                    <th className="py-3 px-4 w-12 text-center">Select</th>
                    <th className="py-3 px-4 w-16">Card</th>
                    <th className="py-3 px-4">Player ID</th>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4 text-center">Pos</th>
                    <th className="py-3 px-4 text-center">OVR</th>
                    <th className="py-3 px-4">Team Club</th>
                    <th className="py-3 px-4">Nationality</th>
                    <th className="py-3 px-4">Stats overview</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {filteredPlayers.map((player) => {
                    const isChecked = selectedIds.has(player.player_id.toString())
                    return (
                      <tr key={player.player_id} className={`hover:bg-slate-50/50 transition-colors text-slate-700 ${isChecked ? 'bg-blue-50/10' : ''}`}>
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
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 mt-0.5">
                                <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0" />
                                Duplicate Warning: Already has {player.duplicates.length} match(es) in database (OVR: {player.duplicates.map((d: any) => d.overall_rating).join(', ')})
                              </span>
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
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
