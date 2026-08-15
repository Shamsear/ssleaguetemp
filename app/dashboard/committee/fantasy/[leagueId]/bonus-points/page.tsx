'use client'
import { Star, ArrowLeft, AlertCircle, Trash2 } from 'lucide-react';

import { useState, useEffect } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { fetchWithTokenRefresh } from '@/lib/token-refresh'
import { useModal } from '@/hooks/useModal'
import AlertModal from '@/components/modals/AlertModal'
import ConfirmModal from '@/components/modals/ConfirmModal'
import Link from 'next/link'
import { normalizeStr } from '@/lib/utils/normalizeStr';

interface RealPlayer {
  real_player_id: string
  player_name: string
  position?: string
  real_team_name?: string
  star_rating?: number
}

interface PassiveTeam {
  team_id: string
  team_name: string
  fantasy_teams_count?: number // How many fantasy teams support this team
}

interface BonusPointRecord {
  id: number
  target_type: 'player' | 'team'
  target_id: string
  target_name: string
  points: number
  reason: string
  league_id: string
  awarded_by: string
  awarded_at: string
}

interface FantasyLeague {
  league_id: string
  league_name: string
  season_id: string
  is_active: boolean
}

export default function BonusPointsPage() {
  const router = useRouter()
  const params = useParams()
  const leagueId = params?.leagueId as string
  const { user, loading: authLoading } = useAuth()
  
  const [league, setLeague] = useState<FantasyLeague | null>(null)
  const [targetType, setTargetType] = useState<'player' | 'team'>('player')
  const [selectedTargets, setSelectedTargets] = useState<string[]>([])
  const [points, setPoints] = useState<number>(0)
  const [reason, setReason] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [players, setPlayers] = useState<RealPlayer[]>([])
  const [teams, setTeams] = useState<PassiveTeam[]>([])
  const [bonusHistory, setBonusHistory] = useState<BonusPointRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  const {
    alertState,
    showAlert,
    closeAlert,
    confirmState,
    showConfirm,
    closeConfirm,
  } = useModal()

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
    if (!authLoading && user && user.role !== 'committee_admin' && user.role !== 'super_admin') {
      router.push('/dashboard')
    }
  }, [user, authLoading, router])

  // Fetch league data to get season_id and tournament_id
  useEffect(() => {
    const loadLeagueData = async () => {
      if (!leagueId || !user) return

      try {
        const response = await fetchWithTokenRefresh(`/api/fantasy/leagues/${leagueId}`)
        if (!response.ok) throw new Error('Failed to load league')

        const data = await response.json()
        setLeague(data.league)
      } catch (error) {
        console.error('Error loading league:', error)
        showAlert({
          type: 'error',
          title: 'Error',
          message: 'Failed to load fantasy league data.'
        })
      }
    }

    if (user) {
      loadLeagueData()
    }
  }, [user, leagueId])

  useEffect(() => {
    if (user && league) {
      fetchData()
    }
  }, [user, league, targetType])

  const fetchData = async () => {
    if (!league) return
    
    setLoading(true)
    try {
      if (targetType === 'player') {
        // Fetch ALL real players (both drafted and available) in this fantasy league
        const response = await fetchWithTokenRefresh(`/api/fantasy/players/available?league_id=${leagueId}`)
        const { available_players, success } = await response.json()
        if (success && available_players) {
          setPlayers(available_players)
        }
      } else {
        // Fetch passive teams (real football teams) that fantasy teams support
        const response = await fetchWithTokenRefresh(`/api/fantasy/passive-teams?league_id=${leagueId}`)
        const { teams: passiveTeams, success } = await response.json()
        if (success && passiveTeams) {
          setTeams(passiveTeams)
        }
      }

      // Fetch bonus history for this league
      const historyResponse = await fetchWithTokenRefresh(
        `/api/admin/bonus-points?league_id=${leagueId}&target_type=${targetType}`
      )
      const { data: historyData, success: historySuccess } = await historyResponse.json()
      if (historySuccess) {
        setBonusHistory(historyData)
      }
    } catch (error) {
      console.error('Error fetching data:', error)
      showAlert({
        type: 'error',
        title: 'Load Failed',
        message: 'Failed to load data. Please try again.'
      })
    } finally {
      setLoading(false)
    }
  }

  const handleToggleTarget = (id: string) => {
    setSelectedTargets(prev =>
      prev.includes(id)
        ? prev.filter(t => t !== id)
        : [...prev, id]
    )
  }

  const handleSelectAll = () => {
    const filteredItems = getFilteredItems()
    const allIds = filteredItems.map(item =>
      targetType === 'player' ? item.real_player_id : item.team_id
    )
    setSelectedTargets(allIds)
  }

  const handleDeselectAll = () => {
    setSelectedTargets([])
  }

  const getFilteredItems = () => {
    const items = targetType === 'player' ? players : teams
    if (!searchTerm.trim()) return items

    const search = searchTerm.toLowerCase()
    return items.filter((item: any) => {
      if (targetType === 'player') {
        return (
          normalizeStr(item.player_name).includes(normalizeStr(search)) ||
          normalizeStr(item.real_player_id).includes(normalizeStr(search)) ||
          normalizeStr(item.position).includes(normalizeStr(search)) ||
          normalizeStr(item.real_team_name).includes(normalizeStr(search))
        )
      } else {
        return (
          normalizeStr(item.team_name).includes(normalizeStr(search)) ||
          normalizeStr(item.team_id).includes(normalizeStr(search))
        )
      }
    })
  }

  const handleSubmit = async () => {
    if (!league) return

    if (selectedTargets.length === 0) {
      showAlert({
        type: 'warning',
        title: 'No Selection',
        message: `Please select at least one ${targetType}`
      })
      return
    }

    if (!points || points === 0) {
      showAlert({
        type: 'warning',
        title: 'Invalid Points',
        message: 'Please enter a valid points value'
      })
      return
    }

    if (!reason.trim()) {
      showAlert({
        type: 'warning',
        title: 'Missing Reason',
        message: 'Please provide a reason for awarding these points'
      })
      return
    }

    const confirmed = await showConfirm({
      type: points > 0 ? 'info' : 'warning',
      title: 'Confirm Bonus Points',
      message: `Award ${points > 0 ? '+' : ''}${points} points to ${selectedTargets.length} ${targetType}(s) for "${reason}"?`,
      confirmText: 'Award Points',
      cancelText: 'Cancel'
    })

    if (!confirmed) return

    setSubmitting(true)
    try {
      const response = await fetchWithTokenRefresh('/api/admin/bonus-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targets: selectedTargets,
          points,
          reason,
          league_id: leagueId,
          target_type: targetType
        })
      })

      const { success, message } = await response.json()
      if (!success) throw new Error(message)

      showAlert({
        type: 'success',
        title: 'Success',
        message: `Bonus points awarded successfully to ${selectedTargets.length} ${targetType}(s)!`
      })

      // Reset form
      setSelectedTargets([])
      setPoints(0)
      setReason('')
      fetchData()
    } catch (error: any) {
      console.error('Error awarding bonus points:', error)
      showAlert({
        type: 'error',
        title: 'Award Failed',
        message: error.message || 'Failed to award bonus points'
      })
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteRecord = async (id: number) => {
    const confirmed = await showConfirm({
      type: 'danger',
      title: 'Delete Record',
      message: 'Are you sure you want to delete this bonus point record?',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    })

    if (!confirmed) return

    try {
      const response = await fetchWithTokenRefresh(`/api/admin/bonus-points?id=${id}`, {
        method: 'DELETE'
      })

      const { success } = await response.json()
      if (!success) throw new Error('Failed to delete')

      showAlert({
        type: 'success',
        title: 'Deleted',
        message: 'Bonus point record deleted successfully'
      })
      fetchData()
    } catch (error) {
      console.error('Error deleting record:', error)
      showAlert({
        type: 'error',
        title: 'Delete Failed',
        message: 'Failed to delete bonus point record'
      })
    }
  }

  if (authLoading || !user || !league) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading bonus points console...</p>
        </div>
      </div>
    )
  }

  const filteredItems = getFilteredItems()

  return (
    <>
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Navigation */}
        <div>
          <Link
            href={`/dashboard/committee/fantasy/${leagueId}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">FANTASY CONSOLE</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 uppercase">
              Award Bonus Points
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              {league.league_name} • {league.season_id.replace('SSPSLS', 'Season ')}
            </p>
          </div>
          <div className="w-16 h-16 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center text-amber-400 shadow-sm shrink-0">
            <Star className="w-8 h-8" />
          </div>
        </div>

        {/* Main Awarding Panel */}
        <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-6">
          {/* Target Type Selector */}
          <div>
            <label className="block text-[10px] text-slate-450 font-bold uppercase tracking-wider mb-2">
              Award Points To
            </label>
            <div className="flex gap-4">
              <button
                onClick={() => {
                  setTargetType('player')
                  setSelectedTargets([])
                }}
                className={`flex-1 py-3 px-4 rounded-xl border font-bold font-mono text-xs uppercase tracking-wider transition-all cursor-pointer ${
                  targetType === 'player'
                    ? 'bg-slate-800 border-slate-905 text-amber-400 shadow-sm'
                    : 'bg-slate-50 border-slate-100 hover:border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Real Players
              </button>
              <button
                onClick={() => {
                  setTargetType('team')
                  setSelectedTargets([])
                }}
                className={`flex-1 py-3 px-4 rounded-xl border font-bold font-mono text-xs uppercase tracking-wider transition-all cursor-pointer ${
                  targetType === 'team'
                    ? 'bg-slate-800 border-slate-905 text-amber-400 shadow-sm'
                    : 'bg-slate-50 border-slate-100 hover:border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                Passive Teams
              </button>
            </div>
          </div>

          {/* Points and Reason */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] text-slate-450 font-bold uppercase tracking-wider mb-2">
                Points *
              </label>
              <input
                type="number"
                value={points || ''}
                onChange={(e) => setPoints(parseInt(e.target.value) || 0)}
                placeholder="Enter points (can be negative)"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none text-xs font-bold uppercase"
              />
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">
                Use positive for bonus, negative for penalty
              </p>
            </div>
            <div>
              <label className="block text-[10px] text-slate-450 font-bold uppercase tracking-wider mb-2">
                Reason/Heading *
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g., Fair Play Award"
                maxLength={500}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none text-xs font-bold uppercase"
              />
            </div>
          </div>

          {/* Search */}
          <div>
            <label className="block text-[10px] text-slate-450 font-bold uppercase tracking-wider mb-2">
              Filter List
            </label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-400">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={`Search ${targetType}s...`}
                className="pl-10 w-full py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none text-xs font-bold uppercase"
              />
            </div>
          </div>

          {/* Selection Controls */}
          <div className="flex justify-between items-center pt-2">
            <div className="text-[10px] text-slate-500 font-bold uppercase">
              <strong>{selectedTargets.length}</strong> of <strong>{filteredItems.length}</strong> selected
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSelectAll}
                className="px-2.5 py-1.5 text-[9px] bg-slate-800 text-white font-mono font-bold uppercase tracking-wider rounded-lg hover:bg-slate-700 transition-all cursor-pointer"
              >
                Select All
              </button>
              <button
                onClick={handleDeselectAll}
                className="px-2.5 py-1.5 text-[9px] bg-slate-100 border border-slate-250 text-slate-700 font-mono font-bold uppercase tracking-wider rounded-lg hover:bg-slate-200 transition-all cursor-pointer"
              >
                Deselect All
              </button>
            </div>
          </div>

          {/* Selection List */}
          <div className="bg-slate-50 border border-slate-100 rounded-2xl p-4 max-h-96 overflow-y-auto space-y-2">
            {loading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500 mx-auto"></div>
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs font-bold uppercase">
                No {targetType}s found
              </div>
            ) : (
              <div className="grid gap-2">
                {filteredItems.map((item: any) => {
                  const id = targetType === 'player' ? item.real_player_id : item.team_id
                  const name = targetType === 'player' ? item.player_name : item.team_name
                  const isSelected = selectedTargets.includes(id)

                  return (
                    <div
                      key={id}
                      onClick={() => handleToggleTarget(id)}
                      className={`p-3 rounded-xl cursor-pointer border-2 transition-all flex items-center justify-between ${
                        isSelected
                          ? 'bg-amber-500/10 border-amber-500 text-slate-800'
                          : 'bg-white border-slate-200/60 hover:border-slate-300 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-4 h-4 rounded border flex items-center justify-center ${
                          isSelected ? 'bg-amber-500 border-amber-600 text-slate-900' : 'border-slate-300 bg-slate-50'
                        }`}>
                          {isSelected && (
                            <svg className="w-2.5 h-2.5 text-slate-900" fill="currentColor" viewBox="0 0 20 20">
                              <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-xs uppercase">{name}</div>
                          {targetType === 'player' && (
                            <div className="text-[9px] text-slate-400 font-semibold uppercase mt-0.5 flex items-center gap-1.5">
                              <span>{item.position}</span>
                              <span>•</span>
                              <span>{item.team || item.real_team_name}</span>
                              {item.star_rating && (
                                <>
                                  <span>•</span>
                                  <span className="flex items-center text-amber-605">
                                    {item.star_rating}★
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                          {targetType === 'team' && item.fantasy_teams_count !== undefined && (
                            <div className="text-[9px] text-slate-400 font-semibold uppercase mt-0.5">
                              {item.fantasy_teams_count} fantasy team{item.fantasy_teams_count !== 1 ? 's' : ''} supporting
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Submit Button */}
          <button
            onClick={handleSubmit}
            disabled={submitting || selectedTargets.length === 0}
            className="w-full py-3 px-6 bg-slate-800 border border-slate-900 hover:bg-slate-700 text-amber-400 font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {submitting ? (
              <span className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-amber-400 mr-2"></div>
                Awarding Points...
              </span>
            ) : (
              `Award ${points > 0 ? '+' : ''}${points} Points to ${selectedTargets.length} ${targetType}(s)`
            )}
          </button>
        </div>

        {/* Bonus History */}
        <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
          <h2 className="text-xs font-black text-slate-805 uppercase tracking-wider">Bonus Points History</h2>
          {bonusHistory.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-xs font-bold uppercase">
              No bonus points awarded yet
            </div>
          ) : (
            <div className="space-y-2">
              {bonusHistory.map((record, index) => (
                <div
                  key={`${record.id}-${index}`}
                  className="bg-slate-50 border border-slate-205/65 rounded-xl p-4 flex items-center justify-between"
                >
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-1">
                      <span className={`px-2 py-0.5 rounded-lg border text-[10px] font-black uppercase tracking-wider ${
                        record.points > 0
                          ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                          : 'bg-rose-50 border-rose-200 text-rose-805'
                      }`}>
                        {record.points > 0 ? '+' : ''}{record.points} PTS
                      </span>
                      <span className="font-bold text-xs uppercase text-slate-800">{record.target_name}</span>
                      <span className="text-[9px] text-slate-400 font-bold uppercase">
                        ({record.target_type})
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 font-semibold uppercase">{record.reason}</div>
                    <div className="text-[9px] text-slate-400 font-semibold mt-1 font-mono">
                      {new Date(record.awarded_at).toLocaleString()}
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeleteRecord(record.id)}
                    className="ml-4 p-2 text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-100 rounded-lg transition-all cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div></div>

      <AlertModal
        isOpen={alertState.isOpen}
        type={alertState.type}
        title={alertState.title}
        message={alertState.message}
        onClose={closeAlert}
      />

      <ConfirmModal
        isOpen={confirmState.isOpen}
        type={confirmState.type}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        onConfirm={confirmState.onConfirm}
        onCancel={closeConfirm}
      />
    </>
  )
}
