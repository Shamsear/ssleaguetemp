'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { fetchWithTokenRefresh } from '@/lib/token-refresh'
import { ArrowLeft, Trash2, ShieldAlert, CheckCircle2, AlertTriangle, Info, Sparkles, Users, Copy, ChevronRight, Database, RefreshCw, CheckCircle } from 'lucide-react'

interface DuplicateGroup {
  name: string
  position: string
  nationality: string
  duplicate_count: number
  players: any[]
}

export default function DuplicateManagementPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [duplicates, setDuplicates] = useState<DuplicateGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedToDelete, setSelectedToDelete] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [deleteStatus, setDeleteStatus] = useState('')

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
      loadDuplicates()
    }
  }, [user])

  const loadDuplicates = async () => {
    try {
      setLoading(true)
      const response = await fetchWithTokenRefresh('/api/players/find-duplicates')
      const result = await response.json()

      if (result.success) {
        setDuplicates(result.data)
      } else {
        throw new Error(result.error)
      }
    } catch (error: any) {
      console.error('Error loading duplicates:', error)
      alert(`Error: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const togglePlayerSelection = (playerId: string) => {
    setSelectedToDelete(prev => {
      const newSet = new Set(prev)
      if (newSet.has(playerId)) {
        newSet.delete(playerId)
      } else {
        newSet.add(playerId)
      }
      return newSet
    })
  }

  const selectAllInGroup = (players: any[]) => {
    setSelectedToDelete(prev => {
      const newSet = new Set(prev)
      players.forEach(p => newSet.add(p.id))
      return newSet
    })
  }

  const deselectAllInGroup = (players: any[]) => {
    setSelectedToDelete(prev => {
      const newSet = new Set(prev)
      players.forEach(p => newSet.delete(p.id))
      return newSet
    })
  }

  const keepOnlyOne = (players: any[], keepIndex: number) => {
    setSelectedToDelete(prev => {
      const newSet = new Set(prev)
      players.forEach((p, idx) => {
        if (idx !== keepIndex) {
          newSet.add(p.id)
        } else {
          newSet.delete(p.id)
        }
      })
      return newSet
    })
  }

  const handleDeleteSelected = async () => {
    if (selectedToDelete.size === 0) {
      alert('No players selected for deletion')
      return
    }

    if (!confirm(`This will permanently delete ${selectedToDelete.size} player(s). Continue?`)) {
      return
    }

    try {
      setDeleting(true)
      setDeleteStatus('Deleting selected players...')

      const response = await fetchWithTokenRefresh('/api/players/delete-duplicates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          playerIds: Array.from(selectedToDelete)
        })
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error)
      }

      setDeleteStatus(`Successfully deleted ${result.deleted} players!`)
      setSelectedToDelete(new Set())
      
      // Reload duplicates
      setTimeout(() => {
        loadDuplicates()
        setDeleteStatus('')
      }, 2000)
    } catch (error: any) {
      setDeleteStatus(`Error: ${error.message}`)
    } finally {
      setDeleting(false)
    }
  }

  if (authLoading || loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading duplicates...</p>
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
            href="/dashboard/committee/database"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Database
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <Sparkles className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">COMMITTEE CONSOLE</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Duplicate Players Management
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Find, review, and delete duplicate player entries to keep the registry clean.
              </p>
            </div>
          </div>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 font-mono text-xs">
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm">
            <div className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider">Duplicate Groups</div>
            <div className="text-2xl font-black text-amber-600 mt-2">{duplicates.length}</div>
          </div>
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm">
            <div className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider">Total Duplicates</div>
            <div className="text-2xl font-black text-blue-600 mt-2">
              {duplicates.reduce((sum, group) => sum + group.duplicate_count, 0)}
            </div>
          </div>
          <div className="console-card bg-white border border-rose-200/60 rounded-3xl p-5 shadow-sm bg-rose-50/10">
            <div className="text-[10px] text-rose-500 font-bold uppercase tracking-wider">Selected for Deletion</div>
            <div className="text-2xl font-black text-rose-600 mt-2">{selectedToDelete.size}</div>
          </div>
        </div>

        {/* Action Bar */}
        {selectedToDelete.size > 0 && (
          <div className="console-card bg-rose-50/20 border border-rose-200/60 p-5 rounded-3xl mb-6 font-mono text-xs">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <h3 className="font-extrabold text-rose-800 uppercase tracking-wide flex items-center gap-1.5">
                  <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                  {selectedToDelete.size} player(s) selected for deletion
                </h3>
                <p className="text-[11px] text-slate-500 mt-1">
                  These players will be permanently removed from the database registry
                </p>
              </div>
              <div className="flex gap-3 shrink-0">
                <button
                  onClick={() => setSelectedToDelete(new Set())}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-all font-bold text-xs uppercase tracking-wider shadow-sm cursor-pointer"
                >
                  Clear Selection
                </button>
                <button
                  onClick={handleDeleteSelected}
                  disabled={deleting}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed font-bold text-xs uppercase tracking-wider shadow-sm cursor-pointer"
                >
                  {deleting ? (
                    <>
                      <RefreshCw className="animate-spin h-3.5 w-3.5 text-white" />
                      Deleting...
                    </>
                  ) : (
                    'Delete Selected'
                  )}
                </button>
              </div>
            </div>
            {deleteStatus && (
              <div className="mt-3 p-3 bg-white border border-rose-100 rounded-xl text-[11px] text-slate-600 flex items-center gap-1.5 shadow-sm">
                <Info className="w-3.5 h-3.5 text-amber-600" />
                <span>{deleteStatus}</span>
              </div>
            )}
          </div>
        )}

        {/* Duplicate Groups */}
        {duplicates.length === 0 ? (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-12 text-center space-y-4">
            <div className="w-16 h-16 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-500/5 mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-lg font-bold text-slate-800 uppercase tracking-wide">No Duplicates Found!</h3>
            <p className="text-xs text-slate-405 font-mono max-w-md mx-auto">
              All players have unique combinations of name, position, and nationality.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {duplicates.map((group, groupIdx) => (
              <div key={groupIdx} className="console-card bg-white border border-amber-200 rounded-3xl p-6 shadow-sm space-y-4">
                {/* Group Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-slate-100">
                  <div className="space-y-1">
                    <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                      <Copy className="w-4 h-4 text-amber-500 shrink-0" />
                      {group.name}
                    </h3>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400 font-bold uppercase">
                      <span>📍 Position: <span className="text-slate-705">{group.position}</span></span>
                      <span>🌍 Nationality: <span className="text-slate-705">{group.nationality}</span></span>
                      <span className="text-orange-600 font-extrabold">
                        {group.duplicate_count} duplicates found
                      </span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => selectAllInGroup(group.players)}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => deselectAllInGroup(group.players)}
                      className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors cursor-pointer"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                {/* Players in Group */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 font-mono text-xs">
                  {group.players.map((player, playerIdx) => {
                    const isSelected = selectedToDelete.has(player.id)
                    
                    return (
                      <div
                        key={player.id}
                        className={`p-5 rounded-2xl border transition-all flex flex-col justify-between gap-4 ${
                          isSelected
                            ? 'border-rose-500 bg-rose-50/10 shadow-md shadow-rose-500/5'
                            : 'border-slate-200 bg-white hover:border-amber-400'
                        }`}
                      >
                        {/* Selection Checkbox */}
                        <div className="space-y-3">
                          <div className="flex items-start justify-between gap-2">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => togglePlayerSelection(player.id)}
                              className="w-5 h-5 rounded border-slate-300 text-rose-550 focus:ring-rose-500/20 cursor-pointer mt-0.5 shrink-0"
                            />
                            <div className="flex flex-wrap gap-1 justify-end items-center">
                              {playerIdx === 0 && (
                                <span className="text-[9px] px-2 py-0.5 bg-emerald-550/10 text-emerald-700 font-extrabold uppercase rounded-full border border-emerald-100 shrink-0">
                                  Highest Rating
                                </span>
                              )}
                              {isSelected && (
                                <span className="text-[9px] px-2 py-0.5 bg-rose-50 text-rose-700 font-extrabold uppercase rounded-full border border-rose-100 shrink-0">
                                  Will Delete
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Player Details */}
                          <div className="space-y-1.5 text-[11px] text-slate-600">
                            <div className="flex justify-between py-1 border-b border-slate-100/60">
                              <span className="text-slate-550 font-mono font-extrabold uppercase tracking-wider text-[9px]">ID:</span>
                              <span className="font-bold text-slate-800">{player.player_id}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-100/60">
                              <span className="text-slate-550 font-mono font-extrabold uppercase tracking-wider text-[9px]">Rating:</span>
                              <span className="font-extrabold text-blue-600">{player.overall_rating || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-100/60">
                              <span className="text-slate-550 font-mono font-extrabold uppercase tracking-wider text-[9px]">Status:</span>
                              <span className={`font-extrabold uppercase text-[9px] ${player.is_sold ? 'text-emerald-600' : 'text-slate-400'}`}>
                                {player.is_sold ? '<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Sold' : '⚪ Available'}
                              </span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-100/60">
                              <span className="text-slate-550 font-mono font-extrabold uppercase tracking-wider text-[9px]">Team:</span>
                              <span className="font-bold text-slate-800">{player.team_name || 'None'}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-100/60">
                              <span className="text-slate-550 font-mono font-extrabold uppercase tracking-wider text-[9px]">Club:</span>
                              <span className="text-slate-700 font-bold truncate max-w-[140px]" title={player.club || 'N/A'}>
                                {player.club || 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-100/60">
                              <span className="text-slate-550 font-mono font-extrabold uppercase tracking-wider text-[9px]">Age:</span>
                              <span className="font-bold text-slate-700">{player.age || 'N/A'}</span>
                            </div>
                            <div className="flex justify-between py-1 border-b border-slate-100/60">
                              <span className="text-slate-550 font-mono font-extrabold uppercase tracking-wider text-[9px]">Style:</span>
                              <span className="text-slate-700 font-bold truncate max-w-[140px]" title={player.playing_style || 'N/A'}>
                                {player.playing_style || 'N/A'}
                              </span>
                            </div>
                            {player.is_sold && player.acquisition_value && (
                              <div className="flex justify-between py-1">
                                <span className="text-slate-550 font-mono font-extrabold uppercase tracking-wider text-[9px]">Value:</span>
                                <span className="text-emerald-650 font-extrabold">
                                  {player.acquisition_value} eCoin
                                </span>
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Quick Actions */}
                        <div className="pt-3 border-t border-slate-100">
                          <button
                            onClick={() => keepOnlyOne(group.players, playerIdx)}
                            className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-800 font-mono font-bold text-[10px] uppercase tracking-wider rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1 shadow-sm"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Keep Only This One
                          </button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

