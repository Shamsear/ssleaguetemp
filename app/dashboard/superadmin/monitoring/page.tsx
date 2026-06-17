'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { getReadStats, logReadStats, resetReadCount } from '@/utils/readCounter'
import { getCacheStatistics, invalidateAllCaches, invalidatePlayerCaches, invalidateTeamCaches } from '@/utils/smartCache'
import { getCacheInfo } from '@/utils/cache'
import { 
  ArrowLeft, 
  Activity, 
  Database, 
  Trash2, 
  RefreshCw, 
  Lightbulb,
  CheckCircle,
  AlertTriangle
} from 'lucide-react'

export default function MonitoringPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [readStats, setReadStats] = useState(getReadStats())
  const [cacheStats, setCacheStats] = useState(getCacheStatistics())
  const [cacheInfo, setCacheInfo] = useState(getCacheInfo())
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login')
    }
    if (!authLoading && user && user.role !== 'super_admin') {
      router.push('/dashboard')
    }
  }, [user, authLoading, router])

  useEffect(() => {
    // Refresh stats every 5 seconds
    const interval = setInterval(() => {
      setReadStats(getReadStats())
      setCacheStats(getCacheStatistics())
      setCacheInfo(getCacheInfo())
    }, 5000)

    setRefreshInterval(interval)

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [])

  const handleResetReads = () => {
    if (confirm('Reset read counter? This is for testing only.')) {
      resetReadCount()
      setReadStats(getReadStats())
    }
  }

  const handleClearAllCaches = () => {
    if (confirm('Clear all caches? Users will need to refetch data.')) {
      invalidateAllCaches()
      setCacheStats(getCacheStatistics())
      setCacheInfo(getCacheInfo())
    }
  }

  const handleClearPlayerCaches = () => {
    invalidatePlayerCaches()
    setCacheStats(getCacheStatistics())
    setCacheInfo(getCacheInfo())
  }

  const handleClearTeamCaches = () => {
    invalidateTeamCaches()
    setCacheStats(getCacheStatistics())
    setCacheInfo(getCacheInfo())
  }

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  const formatAge = (ms: number) => {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) return `${hours}h ${minutes % 60}m ago`
    if (minutes > 0) return `${minutes}m ${seconds % 60}s ago`
    return `${seconds}s ago`
  }

  const getStatusColor = (percentage: number) => {
    if (percentage >= 100) return 'bg-rose-500'
    if (percentage >= 80) return 'bg-orange-500'
    if (percentage >= 60) return 'bg-amber-500'
    return 'bg-emerald-500'
  }

  const getStatusText = (percentage: number) => {
    if (percentage >= 100) return 'Over Limit'
    if (percentage >= 80) return 'Critical'
    if (percentage >= 60) return 'Warning'
    return 'Good'
  }

  if (authLoading || !user || user.role !== 'super_admin') {
    return (
      <div className="flex items-center justify-center pt-32">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-500 font-mono text-xs tracking-widest uppercase animate-pulse">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in font-mono">
      {/* Header */}
      <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            <Link
              href="/dashboard/superadmin"
              className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-600 hover:text-slate-955 transition-all shadow-sm flex-shrink-0"
              title="Back to Dashboard"
            >
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl">
                <Activity className="w-6 h-6" />
              </div>
              <div>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                  System Monitoring
                </h1>
                <p className="text-xs text-slate-500 mt-1">Firestore reads, cache performance, and optimization insights</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Read Statistics */}
      <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl space-y-6">
        <div className="flex justify-between items-center pb-4 border-b border-slate-200/60">
          <h2 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <Database className="w-4 h-4 text-amber-500" />
            Firestore Reads
          </h2>
          <button
            onClick={handleResetReads}
            className="inline-flex items-center px-4 py-2 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 text-xs font-mono font-bold rounded-xl transition-all shadow-sm"
          >
            Reset Counter
          </button>
        </div>

        {/* Progress Bar */}
        <div>
          <div className="flex justify-between items-center mb-2 font-mono text-xs text-slate-500">
            <span>Daily Usage</span>
            <span className="font-bold text-slate-800">
              {readStats.current.toLocaleString()} / {readStats.limit.toLocaleString()}
            </span>
          </div>
          <div className="w-full bg-slate-100 border border-slate-200/60 rounded-full h-4 overflow-hidden shadow-inner">
            <div
              className={`h-full ${getStatusColor(readStats.percentage)} transition-all duration-500`}
              style={{ width: `${Math.min(100, readStats.percentage)}%` }}
            ></div>
          </div>
          <div className="flex justify-between items-center mt-2 font-mono text-[11px]">
            <span className={`font-bold uppercase ${
              readStats.isOverLimit ? 'text-rose-600' : 
              readStats.isNearLimit ? 'text-amber-600' : 
              'text-emerald-600'
            }`}>
              {getStatusText(readStats.percentage)}
            </span>
            <span className="text-slate-500">
              {readStats.remaining.toLocaleString()} reads remaining
            </span>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-50/50 border border-slate-200/60 p-4 rounded-xl text-center">
            <div className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider mb-1">Current Reads</div>
            <div className="text-xl font-bold text-slate-800 font-mono">{readStats.current.toLocaleString()}</div>
          </div>
          <div className="bg-slate-50/50 border border-slate-200/60 p-4 rounded-xl text-center">
            <div className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider mb-1">Remaining</div>
            <div className="text-xl font-bold text-slate-800 font-mono">{readStats.remaining.toLocaleString()}</div>
          </div>
          <div className="bg-slate-50/50 border border-slate-200/60 p-4 rounded-xl text-center">
            <div className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider mb-1">Percentage</div>
            <div className="text-xl font-bold text-slate-800 font-mono">{readStats.percentage.toFixed(1)}%</div>
          </div>
          <div className="bg-slate-50/50 border border-slate-200/60 p-4 rounded-xl text-center">
            <div className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider mb-1">Daily Limit</div>
            <div className="text-xl font-bold text-slate-800 font-mono">{readStats.limit.toLocaleString()}</div>
          </div>
        </div>

        {/* Status Messages */}
        {readStats.isOverLimit && (
          <div className="rounded-2xl p-4 bg-rose-50 border border-rose-250 text-rose-700 text-xs flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0" />
            <div>
              <h3 className="font-bold uppercase tracking-wider text-rose-800 mb-0.5">Daily Limit Exceeded</h3>
              <p className="text-rose-600/90 leading-relaxed font-mono">
                You've exceeded your daily read quota. Consider upgrading to Blaze plan or optimize your queries.
              </p>
            </div>
          </div>
        )}
        {readStats.isNearLimit && !readStats.isOverLimit && (
          <div className="rounded-2xl p-4 bg-amber-50 border border-amber-250 text-amber-700 text-xs flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div>
              <h3 className="font-bold uppercase tracking-wider text-amber-800 mb-0.5">Approaching Limit</h3>
              <p className="text-amber-600/90 leading-relaxed font-mono">
                You're approaching your daily read quota. Monitor your usage carefully.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Cache Statistics */}
      <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl space-y-6">
        <div className="flex justify-between items-center pb-4 border-b border-slate-200/60">
          <h2 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-amber-500" />
            Cache Performance
          </h2>
          <button
            onClick={handleClearAllCaches}
            className="inline-flex items-center px-4 py-2 bg-rose-50 border border-rose-200 hover:bg-rose-100 text-rose-700 text-xs font-mono font-bold rounded-xl transition-all shadow-sm"
          >
            Clear All Caches
          </button>
        </div>

        {/* Cache Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-4">
          <div className="bg-slate-50/50 border border-slate-200/60 p-4 rounded-xl text-center">
            <div className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider mb-1">Total</div>
            <div className="text-xl font-bold text-slate-800 font-mono">{cacheStats.totalCaches}</div>
          </div>
          <div className="bg-slate-50/50 border border-slate-200/60 p-4 rounded-xl text-center">
            <div className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider mb-1">Players</div>
            <div className="text-xl font-bold text-slate-800 font-mono">{cacheStats.playerCaches}</div>
          </div>
          <div className="bg-slate-50/50 border border-slate-200/60 p-4 rounded-xl text-center">
            <div className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider mb-1">Teams</div>
            <div className="text-xl font-bold text-slate-800 font-mono">{cacheStats.teamCaches}</div>
          </div>
          <div className="bg-slate-50/50 border border-slate-200/60 p-4 rounded-xl text-center">
            <div className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider mb-1">Seasons</div>
            <div className="text-xl font-bold text-slate-800 font-mono">{cacheStats.seasonCaches}</div>
          </div>
          <div className="bg-slate-50/50 border border-slate-200/60 p-4 rounded-xl text-center">
            <div className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider mb-1">Invites</div>
            <div className="text-xl font-bold text-slate-800 font-mono">{cacheStats.inviteCaches}</div>
          </div>
          <div className="bg-slate-50/50 border border-slate-200/60 p-4 rounded-xl text-center">
            <div className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider mb-1">Users</div>
            <div className="text-xl font-bold text-slate-800 font-mono">{cacheStats.userCaches}</div>
          </div>
          <div className="bg-slate-50/50 border border-slate-200/60 p-4 rounded-xl text-center">
            <div className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider mb-1">Agg</div>
            <div className="text-xl font-bold text-slate-800 font-mono">{cacheStats.aggregationCaches}</div>
          </div>
        </div>

        {/* Cache Info */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white border border-slate-200/60 p-4 rounded-xl shadow-sm">
            <div className="text-xs text-slate-500 font-mono mb-1">Total Storage</div>
            <div className="text-lg font-bold text-slate-800 font-mono">{formatBytes(cacheStats.totalSize)}</div>
          </div>
          <div className="bg-white border border-slate-200/60 p-4 rounded-xl shadow-sm">
            <div className="text-xs text-slate-500 font-mono mb-1">Oldest Cache</div>
            <div className="text-lg font-bold text-slate-800 font-mono">
              {cacheStats.oldestCache ? formatAge(cacheStats.oldestCache.age) : 'N/A'}
            </div>
          </div>
          <div className="bg-white border border-slate-200/60 p-4 rounded-xl shadow-sm">
            <div className="text-xs text-slate-500 font-mono mb-1">Newest Cache</div>
            <div className="text-lg font-bold text-slate-800 font-mono">
              {cacheStats.newestCache ? formatAge(cacheStats.newestCache.age) : 'N/A'}
            </div>
          </div>
        </div>

        {/* Cache Actions */}
        <div className="flex flex-wrap gap-3 pt-2">
          <button
            onClick={handleClearPlayerCaches}
            className="px-5 py-2.5 bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-700 font-mono text-xs font-bold rounded-xl transition-all shadow-sm"
          >
            Clear Player Caches
          </button>
          <button
            onClick={handleClearTeamCaches}
            className="px-5 py-2.5 bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-700 font-mono text-xs font-bold rounded-xl transition-all shadow-sm"
          >
            Clear Team Caches
          </button>
        </div>
      </div>

      {/* Recommendations */}
      <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl space-y-6">
        <h2 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider pb-4 border-b border-slate-200/60 flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          Optimization Recommendations
        </h2>
        
        <div className="space-y-4">
          {readStats.percentage > 80 && (
            <div className="rounded-2xl p-4 bg-rose-50 border border-rose-250 text-rose-700 text-xs flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-rose-500 flex-shrink-0" />
              <div>
                <h3 className="font-bold uppercase tracking-wider text-rose-800 mb-1">⚠️ High Read Usage</h3>
                <p className="text-rose-600/90 leading-relaxed mb-2 font-mono">Your read usage is very high. Consider:</p>
                <ul className="text-rose-600/90 list-disc list-inside space-y-1 font-mono">
                  <li>Upgrading to Blaze plan for higher quota</li>
                  <li>Implementing pagination on all player lists</li>
                  <li>Increasing cache duration from 1 hour to 2 hours</li>
                  <li>Using aggregation documents for counts</li>
                </ul>
              </div>
            </div>
          )}

          {cacheStats.totalCaches === 0 && (
            <div className="rounded-2xl p-4 bg-amber-50 border border-amber-250 text-amber-700 text-xs flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <div>
                <h3 className="font-bold uppercase tracking-wider text-amber-800 mb-1">📦 No Active Caches</h3>
                <p className="text-amber-600/90 leading-relaxed font-mono">
                  Caching is not being utilized. Make sure pages are implementing the caching utilities.
                </p>
              </div>
            </div>
          )}

          {cacheStats.oldestCache && cacheStats.oldestCache.age > 2 * 60 * 60 * 1000 && (
            <div className="rounded-2xl p-4 bg-slate-50 border border-slate-200/60 text-slate-700 text-xs flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-slate-400 flex-shrink-0" />
              <div>
                <h3 className="font-bold uppercase tracking-wider text-slate-800 mb-1">🕐 Old Cache Detected</h3>
                <p className="text-slate-600 leading-relaxed font-mono">
                  Some caches are older than 2 hours. Consider clearing them to ensure users see fresh data.
                </p>
              </div>
            </div>
          )}

          {readStats.percentage < 50 && cacheStats.totalCaches > 0 && (
            <div className="rounded-2xl p-4 bg-emerald-50 border border-emerald-250 text-emerald-700 text-xs flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              <div>
                <h3 className="font-bold uppercase tracking-wider text-emerald-850 mb-1">✅ System Running Well</h3>
                <p className="text-emerald-600/90 leading-relaxed font-mono">
                  Your read usage is low and caching is active. System is optimized!
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
