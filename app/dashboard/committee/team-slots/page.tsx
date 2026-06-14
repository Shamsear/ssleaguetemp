'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { fetchWithTokenRefresh } from '@/lib/token-refresh'
import {
  ArrowLeft,
  Settings,
  Search,
  Plus,
  Minus,
  ChevronDown,
  ChevronRight,
  History,
  Info,
  Sparkles,
  Layers,
  Calendar,
  AlertCircle,
  CheckCircle,
  DollarSign
} from 'lucide-react'


interface Team {
  id: string
  name: string
  current_players: number
  base_slots: number
  purchased_slots: number
  total_slots: number
  available_slots: number
  purchase_history?: SlotPurchase[]
}

interface SlotPurchase {
  id: number
  slots_purchased: number
  price_per_slot: number
  total_cost: number
  purchased_by: string
  notes: string
  purchased_at: string
}

export default function TeamSlotsManagementPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [teams, setTeams] = useState<Team[]>([])
  const [currentSeasonId, setCurrentSeasonId] = useState<string | null>(null)
  const [seasonName, setSeasonName] = useState<string>('')
  const [slotSettings, setSlotSettings] = useState({
    base_slots: 25,
    max_purchasable: 3,
    slot_price: 10
  })
  const [searchTerm, setSearchTerm] = useState('')
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set())
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
    if (!authLoading && user && user.role !== 'committee_admin') {
      router.push('/dashboard')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    const fetchData = async () => {
      if (!user || user.role !== 'committee_admin') return

      try {
        setLoading(true)
        
        // Get current season
        const seasonsQuery = query(
          collection(db, 'seasons'),
          where('isActive', '==', true)
        )
        const seasonsSnapshot = await getDocs(seasonsQuery)

        if (seasonsSnapshot.empty) {
          setMessage({ type: 'error', text: 'No active season found' })
          setLoading(false)
          return
        }

        const seasonDoc = seasonsSnapshot.docs[0]
        const seasonId = seasonDoc.id
        const seasonData = seasonDoc.data()
        
        setCurrentSeasonId(seasonId)
        setSeasonName(seasonData.name || `Season ${seasonData.season_number || ''}`)
        
        // Get slot settings
        setSlotSettings({
          base_slots: seasonData.football_base_slots || seasonData.max_football_players || 25,
          max_purchasable: seasonData.football_max_purchasable_slots || 3,
          slot_price: seasonData.football_slot_price || 10
        })

        // Get all team_seasons for this season
        const teamSeasonsQuery = query(
          collection(db, 'team_seasons'),
          where('season_id', '==', seasonId)
        )
        const teamSeasonsSnapshot = await getDocs(teamSeasonsQuery)

        // Fetch current player counts from Neon database
        const response = await fetchWithTokenRefresh('/api/committee/team-slots', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ season_id: seasonId })
        })
        
        const neonData = response.ok ? await response.json() : { teams: [] }
        const neonTeamsMap = new Map<string, number>(neonData.teams?.map((t: any) => [t.id, t.football_players_count]) || [])

        // Fetch slot purchase history
        const historyResponse = await fetchWithTokenRefresh('/api/committee/slot-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ season_id: seasonId })
        })
        
        const historyData = historyResponse.ok ? await historyResponse.json() : { history: [] }
        const historyMap = new Map<string, SlotPurchase[]>()
        
        if (historyData.history) {
          historyData.history.forEach((record: any) => {
            if (!historyMap.has(record.team_id)) {
              historyMap.set(record.team_id, [])
            }
            historyMap.get(record.team_id)!.push(record)
          })
        }

        const teamsData: Team[] = []
        
        for (const tsDoc of teamSeasonsSnapshot.docs) {
          const tsData = tsDoc.data()
          const teamId = tsData.team_id
          
          // Get team name
          const teamDoc = await getDoc(doc(db, 'teams', teamId))
          const teamData = teamDoc.data()
          
          const baseSlots = tsData.football_base_slots || slotSettings.base_slots
          const purchasedSlots = tsData.football_purchased_slots || 0
          const totalSlots = tsData.football_total_slots || baseSlots
          // Get current player count from Neon (source of truth)
          const currentPlayers = neonTeamsMap.get(teamId) || 0
          
          teamsData.push({
            id: teamId,
            name: teamData?.name || 'Unknown Team',
            current_players: currentPlayers,
            base_slots: baseSlots,
            purchased_slots: purchasedSlots,
            total_slots: totalSlots,
            available_slots: totalSlots - currentPlayers,
            purchase_history: historyMap.get(teamId) || []
          })
        }

        teamsData.sort((a, b) => a.name.localeCompare(b.name))
        setTeams(teamsData)
      } catch (error: any) {
        console.error('Error fetching data:', error)
        setMessage({ type: 'error', text: 'Failed to load teams' })
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [user])

  const toggleTeamExpansion = (teamId: string) => {
    const newExpanded = new Set(expandedTeams)
    if (newExpanded.has(teamId)) {
      newExpanded.delete(teamId)
    } else {
      newExpanded.add(teamId)
    }
    setExpandedTeams(newExpanded)
  }

  const handleAddSlots = async (teamId: string, slotsToAdd: number) => {
    if (!currentSeasonId) return
    
    const team = teams.find(t => t.id === teamId)
    if (!team) return

    if (team.purchased_slots + slotsToAdd > slotSettings.max_purchasable) {
      setMessage({ 
        type: 'error', 
        text: `Cannot add ${slotsToAdd} slots. Maximum is ${slotSettings.max_purchasable}, team already has ${team.purchased_slots}.` 
      })
      return
    }

    try {
      const response = await fetchWithTokenRefresh('/api/committee/manage-team-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: teamId,
          season_id: currentSeasonId,
          slots_change: slotsToAdd,
          deduct_payment: true, // Deduct payment when adding slots
          notes: `Committee added ${slotsToAdd} slot(s) to ${team.name}`
        })
      })

      const result = await response.json()

      if (result.success) {
        // Update local state
        setTeams(teams.map(t => t.id === teamId ? {
          ...t,
          purchased_slots: result.data.new_purchased_slots,
          total_slots: result.data.new_total_slots,
          available_slots: result.data.new_total_slots - t.current_players
        } : t))

        setMessage({ type: 'success', text: result.message })
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to add slots' })
      }
    } catch (error: any) {
      console.error('Error adding slots:', error)
      setMessage({ type: 'error', text: 'Failed to add slots' })
    }
  }

  const handleRemoveSlots = async (teamId: string, slotsToRemove: number) => {
    if (!currentSeasonId) return
    
    const team = teams.find(t => t.id === teamId)
    if (!team) return

    if (team.purchased_slots < slotsToRemove) {
      setMessage({ type: 'error', text: `Cannot remove ${slotsToRemove} slots. Team only has ${team.purchased_slots} purchased slots.` })
      return
    }

    const newTotal = team.total_slots - slotsToRemove
    if (newTotal < team.current_players) {
      setMessage({ 
        type: 'error', 
        text: `Cannot remove slots. Team has ${team.current_players} players, would result in ${newTotal} total slots.` 
      })
      return
    }

    try {
      const response = await fetchWithTokenRefresh('/api/committee/manage-team-slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team_id: teamId,
          season_id: currentSeasonId,
          slots_change: -slotsToRemove, // Negative for removal
          deduct_payment: true, // Refund when removing slots
          notes: `Committee removed ${slotsToRemove} slot(s) from ${team.name}`
        })
      })

      const result = await response.json()

      if (result.success) {
        // Update local state
        setTeams(teams.map(t => t.id === teamId ? {
          ...t,
          purchased_slots: result.data.new_purchased_slots,
          total_slots: result.data.new_total_slots,
          available_slots: result.data.new_total_slots - t.current_players
        } : t))

        setMessage({ type: 'success', text: result.message })
      } else {
        setMessage({ type: 'error', text: result.error || 'Failed to remove slots' })
      }
    } catch (error: any) {
      console.error('Error removing slots:', error)
      setMessage({ type: 'error', text: 'Failed to remove slots' })
    }
  }

  const filteredTeams = teams.filter(team =>
    team.name.toLowerCase().includes(searchTerm.toLowerCase())
  )

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono font-mono">Loading teams...</p>
        </div>
      </div>
    )
  }

  if (!user || user.role !== 'committee_admin') {
    return null
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Decorative glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Link
            href="/dashboard/committee"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>

          <Link
            href="/dashboard/committee/football-slot-settings"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer border border-blue-500/20"
          >
            <Settings className="w-3.5 h-3.5 text-blue-100" /> Settings
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <Layers className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">COMMITTEE PANEL</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Team Slot Management
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Manage football player registration slots for teams in {seasonName}.
              </p>
            </div>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div className={`console-card p-4 rounded-2xl border font-mono flex items-center gap-3 ${
            message.type === 'success' 
              ? 'bg-emerald-50/30 border-emerald-250 text-emerald-800' 
              : 'bg-rose-50 border-rose-250 text-rose-805'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
            )}
            <p className="text-xs uppercase font-bold tracking-wide">{message.text}</p>
          </div>
        )}

        {/* Current Settings Banner */}
        <div className="console-card bg-indigo-50/40 border border-indigo-200 rounded-3xl p-6 shadow-sm">
          <h3 className="text-sm font-extrabold text-indigo-900 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Info className="w-4 h-4 text-indigo-500" /> Current Settings
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-white border border-indigo-100 rounded-2xl p-4 flex justify-between items-center shadow-sm">
              <div>
                <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider font-mono">CONFIG</span>
                <h3 className="text-xs sm:text-sm font-extrabold text-slate-800 mt-0.5">Base Slots</h3>
              </div>
              <span className="bg-indigo-50 border border-indigo-150 text-indigo-750 text-base font-extrabold px-3 py-0.5 rounded-xl font-mono">
                {slotSettings.base_slots}
              </span>
            </div>

            <div className="bg-white border border-indigo-100 rounded-2xl p-4 flex justify-between items-center shadow-sm">
              <div>
                <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider font-mono">LIMIT</span>
                <h3 className="text-xs sm:text-sm font-extrabold text-slate-800 mt-0.5">Max Purchasable</h3>
              </div>
              <span className="bg-indigo-50 border border-indigo-150 text-indigo-750 text-base font-extrabold px-3 py-0.5 rounded-xl font-mono">
                {slotSettings.max_purchasable}
              </span>
            </div>

            <div className="bg-white border border-indigo-100 rounded-2xl p-4 flex justify-between items-center shadow-sm">
              <div>
                <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-wider font-mono">PRICE</span>
                <h3 className="text-xs sm:text-sm font-extrabold text-slate-800 mt-0.5">Slot Price</h3>
              </div>
              <span className="bg-indigo-50 border border-indigo-150 text-indigo-750 text-base font-extrabold px-3 py-0.5 rounded-xl font-mono">
                ₡{slotSettings.slot_price}
              </span>
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-4 shadow-sm flex items-center relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-8 pointer-events-none" />
          <input
            type="text"
            placeholder="Search teams..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold"
          />
        </div>

        {/* Teams Table */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-4 sm:p-6 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-100">
              <thead>
                <tr className="bg-slate-50/40 font-mono">
                  <th className="px-6 py-4 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Team</th>
                  <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Players</th>
                  <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Base</th>
                  <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Purchased</th>
                  <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Total</th>
                  <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Available</th>
                  <th className="px-6 py-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTeams.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-12 text-center text-slate-400 uppercase tracking-wider font-extrabold text-xs">
                      No teams found
                    </td>
                  </tr>
                ) : (
                  filteredTeams.map((team) => {
                    const hasHistory = team.purchase_history && team.purchase_history.length > 0;
                    const isExpanded = expandedTeams.has(team.id);
                    
                    return (
                      <React.Fragment key={team.id}>
                        <tr className="hover:bg-slate-50/40 transition-colors font-mono text-slate-700">
                          <td className="px-6 py-4">
                            <div className="flex items-center gap-3">
                              <div className="flex items-center gap-1.5">
                                {hasHistory ? (
                                  <button
                                    onClick={() => toggleTeamExpansion(team.id)}
                                    className="text-slate-400 hover:text-amber-600 transition-colors cursor-pointer"
                                  >
                                    {isExpanded ? (
                                      <ChevronDown className="w-4 h-4 text-amber-500" />
                                    ) : (
                                      <ChevronRight className="w-4 h-4" />
                                    )}
                                  </button>
                                ) : (
                                  <div className="w-4" />
                                )}
                              </div>
                              <div className="w-8 h-8 rounded-xl flex items-center justify-center border border-slate-200 bg-slate-50 text-slate-650 font-extrabold text-sm uppercase">
                                {team.name.charAt(0)}
                              </div>
                              <div className="text-sm font-extrabold text-slate-800 uppercase tracking-wide">{team.name}</div>
                            </div>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-sm font-bold text-slate-800">{team.current_players}</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-xs text-slate-505">{team.base_slots}</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-bold border uppercase ${
                              team.purchased_slots > 0 
                                ? 'bg-blue-50 border-blue-250 text-blue-700' 
                                : 'bg-slate-50 border-slate-200 text-slate-500'
                            }`}>
                              +{team.purchased_slots}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-sm font-black text-slate-800">{team.total_slots}</span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-lg text-[10px] font-bold border uppercase ${
                              team.available_slots > 0 
                                ? 'bg-emerald-50 border-emerald-250 text-emerald-700' 
                                : 'bg-rose-50 border-rose-200 text-rose-700'
                            }`}>
                              {team.available_slots}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button
                                onClick={() => handleAddSlots(team.id, 1)}
                                disabled={team.purchased_slots >= slotSettings.max_purchasable}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-250 hover:border-emerald-400 hover:text-emerald-600 rounded-xl text-[10px] uppercase font-bold shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                title="Add 1 slot"
                              >
                                <Plus className="w-3 h-3" /> 1 Slot
                              </button>
                              <button
                                onClick={() => handleRemoveSlots(team.id, 1)}
                                disabled={team.purchased_slots === 0 || team.total_slots - 1 < team.current_players}
                                className="inline-flex items-center gap-1 px-2.5 py-1 bg-white border border-slate-250 hover:border-rose-400 hover:text-rose-600 rounded-xl text-[10px] uppercase font-bold shadow-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                                title="Remove 1 slot"
                              >
                                <Minus className="w-3 h-3" /> 1 Slot
                              </button>
                            </div>
                          </td>
                        </tr>
                        
                        {/* Expanded History Row */}
                        {isExpanded && team.purchase_history && team.purchase_history.length > 0 && (
                          <tr className="bg-slate-50/30">
                            <td colSpan={7} className="px-6 py-4 border-t border-slate-100">
                              <div className="ml-8 font-mono">
                                <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                                  <History className="w-3.5 h-3.5 text-slate-400" /> Transaction History
                                </h4>
                                <div className="space-y-2 max-w-4xl">
                                  {team.purchase_history.map((purchase) => {
                                    const isPurchase = purchase.slots_purchased > 0;
                                    return (
                                      <div key={purchase.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3.5 bg-white rounded-xl border border-slate-200 shadow-sm gap-2">
                                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-650">
                                          <div className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[9px] font-black border uppercase ${
                                            isPurchase 
                                              ? 'bg-emerald-50 border-emerald-250 text-emerald-700' 
                                              : 'bg-rose-50 border-rose-200 text-rose-700'
                                          }`}>
                                            {isPurchase ? '+' : ''}{purchase.slots_purchased} slot{Math.abs(purchase.slots_purchased) !== 1 ? 's' : ''}
                                          </div>
                                          <div>
                                            <span className="font-bold text-slate-400 uppercase text-[9px] mr-1">ADMIN:</span>
                                            <span className="font-semibold text-slate-800">{purchase.purchased_by}</span>
                                          </div>
                                          <div className="flex items-center gap-1">
                                            <DollarSign className="w-3.5 h-3.5 text-slate-400" />
                                            <span className="font-bold text-slate-850">₡{Math.abs(purchase.total_cost)}</span>
                                          </div>
                                          <div className="flex items-center gap-1 text-[10px] text-slate-400">
                                            <Calendar className="w-3.5 h-3.5" />
                                            <span>{new Date(purchase.purchased_at).toLocaleDateString()}</span>
                                          </div>
                                        </div>
                                        {purchase.notes && (
                                          <div className="text-[10px] text-slate-500 italic bg-slate-50 px-2 py-1 rounded-lg border border-slate-100 max-w-md">
                                            {purchase.notes}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
