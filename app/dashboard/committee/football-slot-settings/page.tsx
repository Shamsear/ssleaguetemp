'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { collection, query, where, getDocs, limit } from 'firebase/firestore'
import { db } from '@/lib/firebase/config'
import { fetchWithTokenRefresh } from '@/lib/token-refresh'
import { ArrowLeft, Settings, Info, Layers, DollarSign, CheckCircle, AlertCircle, Sparkles, HelpCircle, BarChart2 } from 'lucide-react'


export default function FootballSlotSettingsPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [currentSeasonId, setCurrentSeasonId] = useState<string | null>(null)
  const [seasonName, setSeasonName] = useState<string>('')
  
  const [settings, setSettings] = useState({
    football_base_slots: 25,
    football_max_purchasable_slots: 3,
    football_slot_price: 10,
    football_slot_purchase_enabled: true
  })

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
          where('isActive', '==', true),
          limit(1)
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

        // Fetch slot settings
        const response = await fetchWithTokenRefresh(`/api/football-slot-settings?season_id=${seasonId}`)
        const data = await response.json()

        if (data.success) {
          setSettings(data.data)
        }
      } catch (error: any) {
        console.error('Error fetching data:', error)
        setMessage({ type: 'error', text: 'Failed to load settings' })
      } finally {
        setLoading(false)
      }
    }

    fetchData()
  }, [user])

  const handleSave = async () => {
    if (!currentSeasonId) return

    setSaving(true)
    setMessage(null)

    try {
      const response = await fetchWithTokenRefresh('/api/football-slot-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          season_id: currentSeasonId,
          ...settings
        })
      })

      const data = await response.json()

      if (data.success) {
        setMessage({ type: 'success', text: 'Settings saved successfully!' })
      } else {
        setMessage({ type: 'error', text: data.error || 'Failed to save settings' })
      }
    } catch (error: any) {
      console.error('Error saving settings:', error)
      setMessage({ type: 'error', text: 'Failed to save settings' })
    } finally {
      setSaving(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono font-mono">Loading settings...</p>
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

      <div className="max-w-4xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/committee/team-slots"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Slots
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <Settings className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">SYSTEM CONFIG</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Football Slot Settings
              </h1>
              <p className="text-xs text-slate-404 font-mono mt-1">
                Configure player slot limits and pricing for {seasonName}.
              </p>
            </div>
          </div>
        </div>

        {/* Message Banner */}
        {message && (
          <div className={`console-card p-4 rounded-2xl border font-mono flex items-center gap-3 ${
            message.type === 'success' 
              ? 'bg-emerald-50/30 border-emerald-250 text-emerald-800' 
              : 'bg-rose-50 border-rose-250 text-rose-808'
          }`}>
            {message.type === 'success' ? (
              <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
            )}
            <p className="text-xs uppercase font-bold tracking-wide">{message.text}</p>
          </div>
        )}

        {/* Info/Guide Box */}
        <div className="console-card bg-blue-50/45 border border-blue-200 rounded-3xl p-6 shadow-sm">
          <h3 className="text-sm font-extrabold text-blue-900 uppercase tracking-wider mb-4 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-500" /> How Slot Management Works
          </h3>
          <ul className="space-y-3 text-xs text-blue-800 leading-relaxed">
            <li className="flex items-start">
              <span className="mr-2.5 font-bold">•</span>
              <span><strong>Base Slots:</strong> Every team gets this many slots by default (currently configured as {settings.football_base_slots}).</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2.5 font-bold">•</span>
              <span><strong>Purchasable Slots:</strong> Teams can buy additional slots up to the maximum limit.</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2.5 font-bold">•</span>
              <span><strong>Slot Price:</strong> Cost in eCoin (₡) per additional slot.</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2.5 font-bold">•</span>
              <span><strong>Total Slots:</strong> Base + Purchased = Total available slots for each team.</span>
            </li>
            <li className="flex items-start">
              <span className="mr-2.5 font-bold">•</span>
              <span><strong>Bulk Auction:</strong> Teams can only bid on players if they have available slots.</span>
            </li>
          </ul>
        </div>

        {/* Settings Form Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
          <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-6 flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-amber-500" /> Slot Configuration
          </h2>

          <div className="space-y-6">
            {/* Base Slots */}
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                Base Slots (Default for all teams)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={settings.football_base_slots}
                onChange={(e) => setSettings({ ...settings, football_base_slots: parseInt(e.target.value) || 25 })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold"
              />
              <p className="mt-1.5 text-[10px] font-bold text-slate-400 uppercase">
                Every team starts with this many player slots (recommended: 25)
              </p>
            </div>

            {/* Max Purchasable Slots */}
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                Maximum Purchasable Slots
              </label>
              <input
                type="number"
                min="0"
                max="50"
                value={settings.football_max_purchasable_slots}
                onChange={(e) => setSettings({ ...settings, football_max_purchasable_slots: parseInt(e.target.value) || 0 })}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold"
              />
              <p className="mt-1.5 text-[10px] font-bold text-slate-400 uppercase">
                Maximum additional slots a team can purchase (recommended: 3)
              </p>
            </div>

            {/* Slot Price */}
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                Price Per Slot (eCoin)
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-extrabold text-sm pointer-events-none">₡</span>
                <input
                  type="number"
                  min="0"
                  max="10000"
                  value={settings.football_slot_price}
                  onChange={(e) => setSettings({ ...settings, football_slot_price: parseInt(e.target.value) || 0 })}
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold"
                />
              </div>
              <p className="mt-1.5 text-[10px] font-bold text-slate-400 uppercase">
                Cost in eCoin for each additional slot (recommended: 10)
              </p>
            </div>

            {/* Enable/Disable Purchases */}
            <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-2xl">
              <div>
                <label className="block text-xs font-extrabold text-slate-800 uppercase tracking-wide mb-0.5">
                  Allow Slot Purchases
                </label>
                <p className="text-[10px] font-bold text-slate-400 uppercase">
                  Teams can purchase additional slots if enabled
                </p>
              </div>
              <button
                onClick={() => setSettings({ ...settings, football_slot_purchase_enabled: !settings.football_slot_purchase_enabled })}
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors cursor-pointer border ${
                  settings.football_slot_purchase_enabled 
                    ? 'bg-amber-500 border-amber-600' 
                    : 'bg-slate-200 border-slate-300'
                }`}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition-transform ${
                    settings.football_slot_purchase_enabled ? 'translate-x-8' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* Summary */}
            <div className="console-card bg-slate-50 border border-slate-200/60 rounded-2xl p-4">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-1">
                <BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Summary
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="flex items-center justify-between sm:justify-start gap-2 border-b border-slate-200/50 pb-2 sm:border-0 sm:pb-0">
                  <span className="font-bold text-slate-400 uppercase text-[10px]">Base Slots:</span>
                  <span className="font-black text-slate-800">{settings.football_base_slots}</span>
                </div>
                <div className="flex items-center justify-between sm:justify-start gap-2 border-b border-slate-200/50 pb-2 sm:border-0 sm:pb-0">
                  <span className="font-bold text-slate-400 uppercase text-[10px]">Max Total Slots:</span>
                  <span className="font-black text-slate-800">
                    {settings.football_base_slots + settings.football_max_purchasable_slots}
                  </span>
                </div>
                <div className="flex items-center justify-between sm:justify-start gap-2 border-b border-slate-200/50 pb-2 sm:border-0 sm:pb-0">
                  <span className="font-bold text-slate-400 uppercase text-[10px]">Price Per Slot:</span>
                  <span className="font-black text-slate-800">₡{settings.football_slot_price}</span>
                </div>
                <div className="flex items-center justify-between sm:justify-start gap-2 pb-2 sm:pb-0">
                  <span className="font-bold text-slate-400 uppercase text-[10px]">Max Purchase Cost:</span>
                  <span className="font-black text-slate-800">
                    ₡{settings.football_max_purchasable_slots * settings.football_slot_price}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end gap-3">
            <button
              onClick={() => router.push('/dashboard/committee/team-slots')}
              className="px-6 py-2.5 bg-white border border-slate-250 hover:border-slate-350 rounded-xl text-xs uppercase font-extrabold shadow-sm transition-all cursor-pointer text-slate-700"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-900 rounded-xl text-xs uppercase font-black text-white shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? 'Saving...' : 'Save Settings'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
