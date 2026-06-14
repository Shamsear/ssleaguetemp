'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { 
  Coins, 
  Award, 
  ArrowLeft, 
  Info, 
  HelpCircle, 
  Save, 
  Wallet, 
  TrendingUp, 
  Sparkles, 
  TrendingDown
} from 'lucide-react'

interface Team {
  teamId: string
  teamName: string
  currencySystem: string
  football_budget: number
  real_player_budget: number
}

export default function RefundsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [teams, setTeams] = useState<Team[]>([])
  const [seasonName, setSeasonName] = useState('')
  const [selectedTeam, setSelectedTeam] = useState('')
  const [refundType, setRefundType] = useState<'football' | 'real_player'>('football')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')

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
      const response = await fetch('/api/committee/refunds/teams')
      const data = await response.json()

      if (data.success) {
        setTeams(data.teams || [])
        setSeasonName(data.seasonName || '')
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

  useEffect(() => {
    if (user && user.role === 'committee_admin') {
      loadTeams()
    }
  }, [user])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedTeam || !amount || !reason) {
      alert('Please fill in all fields')
      return
    }

    const amountNum = parseFloat(amount)
    if (isNaN(amountNum) || amountNum <= 0) {
      alert('Please enter a valid positive amount')
      return
    }

    const team = teams.find(t => t.teamId === selectedTeam)
    if (!team) {
      alert('Team not found')
      return
    }

    if (!confirm(`Send £${amountNum.toFixed(2)} ${refundType === 'football' ? 'football' : 'real player'} refund to ${team.teamName}?\n\nReason: ${reason}`)) {
      return
    }

    setProcessing(true)
    try {
      const response = await fetch('/api/committee/refunds/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamId: selectedTeam,
          refundType,
          amount: amountNum,
          reason
        })
      })
      const data = await response.json()

      if (data.success) {
        alert(`✅ Refund sent successfully!\n\nTeam: ${team.teamName}\nAmount: £${amountNum.toFixed(2)}\nType: ${refundType === 'football' ? 'Football' : 'Real Player'}`)
        
        // Reset form
        setSelectedTeam('')
        setAmount('')
        setReason('')
        
        // Reload teams to show updated budgets
        await loadTeams()
      } else {
        alert(`Error: ${data.error}`)
      }
    } catch (error: any) {
      console.error('Error sending refund:', error)
      alert('Failed to send refund')
    } finally {
      setProcessing(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-500 uppercase tracking-wider font-extrabold">Loading teams...</p>
        </div>
      </div>
    )
  }

  if (!user || user.role !== 'committee_admin') {
    return null
  }

  const selectedTeamData = teams.find(t => t.teamId === selectedTeam)

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Ambient Gold Glow Overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10">
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
              <TrendingDown className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">Send Refunds</h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">Issue refunds to teams for {seasonName}</p>
            </div>
          </div>
        </div>

        {/* Info Box */}
        <div className="console-card bg-amber-50/50 border border-amber-250/60 p-5 rounded-2xl mb-6 relative z-10 text-slate-700">
          <div className="flex items-center gap-2 text-amber-800 mb-3 border-b border-amber-200/50 pb-2">
            <Info className="w-4 h-4" />
            <h4 className="font-extrabold text-xs uppercase tracking-wider">How Refunds Work</h4>
          </div>
          <ul className="text-xs font-medium text-slate-600 mt-1 space-y-1">
            <li>• Refunds increase team budgets (football_budget or real_player_budget)</li>
            <li>• Refunds decrease spent amounts (football_spent or real_player_spent)</li>
            <li>• Transaction records are created in both Firebase and Neon</li>
            <li>• All changes are logged for audit purposes</li>
          </ul>
        </div>

        {/* Refund Form */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-8 shadow-sm mb-6 relative z-10">
          <h2 className="font-extrabold text-slate-800 text-sm uppercase tracking-wider mb-6 pb-2 border-b border-slate-100">Issue Refund</h2>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Team Selection */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Select Team
              </label>
              <select
                value={selectedTeam}
                onChange={(e) => setSelectedTeam(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold cursor-pointer"
                required
              >
                <option value="">-- Choose a team --</option>
                {teams.map((team) => (
                  <option key={team.teamId} value={team.teamId}>
                    {team.teamName} ({team.currencySystem})
                  </option>
                ))}
              </select>
            </div>

            {/* Current Budgets Display */}
            {selectedTeamData && (
              <div className="console-card bg-slate-50/80 border border-slate-200/60 rounded-xl p-4 mb-4">
                <h4 className="font-extrabold text-[10px] text-slate-550 uppercase tracking-wider mb-3">Current Budgets</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase mb-1">Football Budget</div>
                    <div className="text-base font-black text-emerald-600">£{selectedTeamData.football_budget.toFixed(2)}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-400 font-bold uppercase mb-1">Real Player Budget</div>
                    <div className="text-base font-black text-purple-650">£{selectedTeamData.real_player_budget.toFixed(2)}</div>
                  </div>
                </div>
              </div>
            )}

            {/* Refund Type */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Refund Type
              </label>
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setRefundType('football')}
                  className={`px-4 py-3 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer ${
                    refundType === 'football'
                      ? 'bg-slate-800 text-amber-400 border border-slate-900'
                      : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-500'
                  }`}
                >
                  <Coins className="w-3.5 h-3.5" />
                  Football Player
                </button>
                <button
                  type="button"
                  onClick={() => setRefundType('real_player')}
                  className={`px-4 py-3 rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 shadow-md cursor-pointer ${
                    refundType === 'real_player'
                      ? 'bg-slate-800 text-amber-400 border border-slate-900'
                      : 'bg-white hover:bg-slate-50 border border-slate-200 text-slate-500'
                  }`}
                >
                  <Award className="w-3.5 h-3.5" />
                  Real Player
                </button>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Refund Amount (£)
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold"
                required
              />
            </div>

            {/* Reason */}
            <div>
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                Reason for Refund
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Enter the reason for this refund..."
                rows={3}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold"
                required
              />
            </div>

            {/* Preview */}
            {selectedTeamData && amount && parseFloat(amount) > 0 && (
              <div className="console-card bg-amber-50/50 border border-amber-200/60 rounded-xl p-4 mb-4 text-slate-700">
                <h4 className="font-extrabold text-[10px] text-amber-800 uppercase tracking-wider mb-2">Preview</h4>
                <div className="text-xs font-medium space-y-1 text-slate-650">
                  <div>Team: <strong className="text-slate-800 uppercase">{selectedTeamData.teamName}</strong></div>
                  <div>Type: <strong className="text-slate-800 uppercase">{refundType === 'football' ? 'Football Player' : 'Real Player'}</strong></div>
                  <div>Amount: <strong className="text-slate-800 uppercase">£{parseFloat(amount).toFixed(2)}</strong></div>
                  <div>
                    New Budget: <strong className="text-emerald-600">
                      £{(refundType === 'football' 
                        ? selectedTeamData.football_budget + parseFloat(amount)
                        : selectedTeamData.real_player_budget + parseFloat(amount)
                      ).toFixed(2)}
                    </strong>
                  </div>
                </div>
              </div>
            )}

            {/* Submit Button */}
            <button
              type="submit"
              disabled={processing || !selectedTeam || !amount || !reason}
              className="w-full px-6 py-3.5 bg-slate-800 hover:bg-slate-900 border border-slate-950 text-amber-400 font-extrabold text-sm uppercase tracking-wider rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-1.5 shadow-md cursor-pointer"
            >
              <Save className="w-4 h-4 text-emerald-400" />
              {processing ? 'Processing...' : 'Send Refund'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
