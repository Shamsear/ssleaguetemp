'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { 
  Coins, 
  RefreshCw, 
  RotateCcw, 
  Save, 
  ArrowLeft, 
  Info, 
  Pencil, 
  HelpCircle
} from 'lucide-react'

interface TeamBudget {
  teamId: string
  teamName: string
  currencySystem: string
  firebase: {
    football_budget: number
    football_spent: number
    real_player_budget: number
    real_player_spent: number
  }
  neon: {
    football_budget: number
    football_spent: number
  }
}

export default function BudgetSyncPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [teams, setTeams] = useState<TeamBudget[]>([])
  const [editedTeams, setEditedTeams] = useState<Map<string, Record<string, number>>>(new Map())
  const [seasonName, setSeasonName] = useState('')
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
    if (!authLoading && user && user.role !== 'committee_admin') {
      router.push('/dashboard')
    }
  }, [user, authLoading, router])

  const loadTeams = async () => {
    setLoading(true)
    try {
      const response = await fetch('/api/committee/budget-sync/teams')
      const data = await response.json()

      if (data.success) {
        setTeams(data.teams || [])
        setSeasonName(data.seasonName || '')
        setLastChecked(new Date())
        setEditedTeams(new Map())
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error: any) {
      console.error('Error loading teams:', error)
      alert('Failed to load teams')
    } finally {
      setLoading(false)
    }
  }

  const handleFieldChange = (teamId: string, field: string, value: string) => {
    const numValue = parseFloat(value) || 0
    const currentEdits = editedTeams.get(teamId) || {}
    const newEdits = new Map(editedTeams)
    newEdits.set(teamId, { ...currentEdits, [field]: numValue })
    setEditedTeams(newEdits)
  }

  const getDisplayValue = (teamId: string, field: string, originalValue: number): number => {
    const edits = editedTeams.get(teamId)
    return edits && field in edits ? (edits as any)[field] : originalValue
  }

  const hasChanges = (teamId: string): boolean => {
    return editedTeams.has(teamId)
  }

  const saveChanges = async () => {
    const changedTeams = Array.from(editedTeams.entries()).map(([teamId, changes]) => ({
      teamId,
      changes
    }))

    if (changedTeams.length === 0) {
      alert('No changes to save')
      return
    }

    if (!confirm(`Save changes for ${changedTeams.length} team(s)?`)) {
      return
    }

    setSaving(true)
    try {
      const response = await fetch('/api/committee/budget-sync/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ updates: changedTeams })
      })
      const data = await response.json()

      if (data.success) {
        alert(`✅ Successfully updated ${data.updated} team(s)!`)
        await loadTeams()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error: any) {
      console.error('Error saving changes:', error)
      alert('Failed to save changes')
    } finally {
      setSaving(false)
    }
  }

  const resetChanges = () => {
    if (editedTeams.size === 0) return
    if (confirm('Discard all unsaved changes?')) {
      setEditedTeams(new Map())
    }
  }

  useEffect(() => {
    if (user && user.role === 'committee_admin') {
      loadTeams()
    }
  }, [user])

  if (authLoading || loading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-500 uppercase tracking-wider font-extrabold">Loading budgets...</p>
        </div>
      </div>
    )
  }

  if (!user || user.role !== 'committee_admin') {
    return null
  }

  const hasAnyChanges = editedTeams.size > 0

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Ambient Gold Glow Overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-[1800px] mx-auto relative z-10">
        {/* Navigation Back Link */}
        <Link
          href="/dashboard/committee"
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200/60 text-slate-500 hover:text-slate-800 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all shadow-sm cursor-pointer mb-4"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Dashboard
        </Link>

        {/* Header Title Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <Coins className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Budget Management</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">View and edit all team budgets for {seasonName}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={loadTeams}
              disabled={loading}
              className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-500 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            {hasAnyChanges && (
              <>
                <button
                  onClick={resetChanges}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-rose-500" />
                  Reset
                </button>
                <button
                  onClick={saveChanges}
                  disabled={saving}
                  className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 border border-slate-950 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5 text-emerald-400" />
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </>
            )}
          </div>
        </div>

        {lastChecked && (
          <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-4 text-right">
            Last loaded: {lastChecked.toLocaleTimeString()}
          </div>
        )}

        {/* Info Box */}
        <div className="console-card bg-amber-50/50 border border-amber-250/60 p-5 rounded-2xl mb-6 relative z-10 text-slate-700">
          <div className="flex items-center gap-2 text-amber-800 mb-3 border-b border-amber-200/50 pb-2">
            <Info className="w-4 h-4" />
            <h4 className="font-extrabold text-xs uppercase tracking-wider">Budget Fields Guide</h4>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <strong className="text-amber-800 text-[10px] uppercase tracking-wider block mb-1">Firebase Fields (team_seasons)</strong>
              <ul className="text-xs font-medium text-slate-600 mt-1 space-y-1">
                <li>• <strong>football_budget</strong> - Football player budget (eCoins)</li>
                <li>• <strong>football_spent</strong> - Football player spending (eCoins)</li>
                <li>• <strong>real_player_budget</strong> - Real player budget (SSCoins)</li>
                <li>• <strong>real_player_spent</strong> - Real player spending (SSCoins)</li>
              </ul>
            </div>
            <div>
              <strong className="text-amber-800 text-[10px] uppercase tracking-wider block mb-1">Neon Fields (teams table)</strong>
              <ul className="text-xs font-medium text-slate-600 mt-1 space-y-1">
                <li>• <strong>football_budget</strong> - Available budget</li>
                <li>• <strong>football_spent</strong> - Total spent</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Teams Table */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden mb-6 relative z-10">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-800 border-b border-slate-900 text-white font-extrabold uppercase tracking-wider">
                <tr className="border-b border-slate-900 text-[10px]">
                  <th className="px-4 py-3 text-left sticky left-0 bg-slate-800 z-10">Team</th>
                  <th className="px-4 py-3 text-center">Currency</th>
                  <th colSpan={4} className="px-4 py-3 text-center bg-slate-850">Firebase (team_seasons)</th>
                  <th colSpan={2} className="px-4 py-3 text-center bg-slate-750">Neon (teams)</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
                <tr className="text-[9px] bg-slate-900/40">
                  <th className="px-4 py-2.5 text-left sticky left-0 bg-slate-800/95 z-10 border-r border-slate-900/60">Name</th>
                  <th className="px-4 py-2.5 text-center border-r border-slate-900/60">System</th>
                  <th className="px-4 py-2.5 text-right bg-slate-850/90 border-r border-slate-900/60">FB Budget</th>
                  <th className="px-4 py-2.5 text-right bg-slate-850/90 border-r border-slate-900/60">FB Spent</th>
                  <th className="px-4 py-2.5 text-right bg-slate-850/90 border-r border-slate-900/60">Real Budget</th>
                  <th className="px-4 py-2.5 text-right bg-slate-850/90 border-r border-slate-900/60">Real Spent</th>
                  <th className="px-4 py-2.5 text-right bg-slate-750/90 border-r border-slate-900/60">Budget</th>
                  <th className="px-4 py-2.5 text-right bg-slate-750/90 border-r border-slate-900/60">Spent</th>
                  <th className="px-4 py-2.5 text-center">Changed</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {teams.map((team) => (
                  <tr key={team.teamId} className={`hover:bg-slate-50/50 transition-colors ${hasChanges(team.teamId) ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-4 py-3 sticky left-0 bg-white z-10 hover:bg-slate-50 border-r border-slate-100">
                      <div className="font-extrabold text-slate-850 text-xs uppercase tracking-wider">{team.teamName}</div>
                      <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{team.teamId}</div>
                    </td>
                    <td className="px-4 py-3 text-center border-r border-slate-100">
                      <span className="px-2 py-0.5 bg-slate-50 border border-slate-200 text-slate-600 rounded text-[9px] font-extrabold uppercase">
                        {team.currencySystem}
                      </span>
                    </td>
                    
                    {/* Firebase Fields */}
                    <td className="px-4 py-3 text-right bg-emerald-50/5 border-r border-slate-100">
                      <input
                        type="number"
                        step="0.01"
                        value={getDisplayValue(team.teamId, 'football_budget', team.firebase.football_budget)}
                        onChange={(e) => handleFieldChange(team.teamId, 'football_budget', e.target.value)}
                        className="w-28 px-2 py-1 text-xs text-right bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono font-bold"
                      />
                    </td>
                    <td className="px-4 py-3 text-right bg-emerald-50/5 border-r border-slate-100">
                      <input
                        type="number"
                        step="0.01"
                        value={getDisplayValue(team.teamId, 'football_spent', team.firebase.football_spent)}
                        onChange={(e) => handleFieldChange(team.teamId, 'football_spent', e.target.value)}
                        className="w-28 px-2 py-1 text-xs text-right bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono font-bold"
                      />
                    </td>
                    <td className="px-4 py-3 text-right bg-emerald-50/5 border-r border-slate-100">
                      <input
                        type="number"
                        step="0.01"
                        value={getDisplayValue(team.teamId, 'real_player_budget', team.firebase.real_player_budget)}
                        onChange={(e) => handleFieldChange(team.teamId, 'real_player_budget', e.target.value)}
                        className="w-28 px-2 py-1 text-xs text-right bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono font-bold"
                      />
                    </td>
                    <td className="px-4 py-3 text-right bg-emerald-50/5 border-r border-slate-100">
                      <input
                        type="number"
                        step="0.01"
                        value={getDisplayValue(team.teamId, 'real_player_spent', team.firebase.real_player_spent)}
                        onChange={(e) => handleFieldChange(team.teamId, 'real_player_spent', e.target.value)}
                        className="w-28 px-2 py-1 text-xs text-right bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono font-bold"
                      />
                    </td>

                    {/* Neon Fields */}
                    <td className="px-4 py-3 text-right bg-blue-50/5 border-r border-slate-100">
                      <input
                        type="number"
                        step="0.01"
                        value={getDisplayValue(team.teamId, 'neon_football_budget', team.neon.football_budget)}
                        onChange={(e) => handleFieldChange(team.teamId, 'neon_football_budget', e.target.value)}
                        className="w-28 px-2 py-1 text-xs text-right bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono font-bold"
                      />
                    </td>
                    <td className="px-4 py-3 text-right bg-blue-50/5 border-r border-slate-100">
                      <input
                        type="number"
                        step="0.01"
                        value={getDisplayValue(team.teamId, 'neon_football_spent', team.neon.football_spent)}
                        onChange={(e) => handleFieldChange(team.teamId, 'neon_football_spent', e.target.value)}
                        className="w-28 px-2 py-1 text-xs text-right bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono font-bold"
                      />
                    </td>

                    <td className="px-4 py-3 text-center">
                      {hasChanges(team.teamId) ? (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded text-[9px] font-extrabold uppercase">
                          <Pencil className="w-2.5 h-2.5" /> Edited
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-300 font-bold">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {teams.length === 0 && !loading && (
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-8 text-center shadow-sm font-mono">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-800 border border-slate-900 shadow-md mb-4">
              <HelpCircle className="w-8 h-8 text-amber-400" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-1">No Teams Found</h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase">No teams registered for this season</p>
          </div>
        )}
      </div>
    </div>
  )
}
