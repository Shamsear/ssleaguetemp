'use client'
import { XCircle, RefreshCw, CheckCircle, Lock, BarChart2, AlertTriangle, Plus, Search, Filter } from 'lucide-react';

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import Link from 'next/link'
import { fetchWithTokenRefresh } from '@/lib/token-refresh'
import AuthGuard from '@/components/auth/AuthGuard';

interface ComparisonData {
  toUpdate: any[]
  toCreate: any[]
  unchanged: any[]
  notFoundInNew: any[]
  summary: {
    totalExisting: number
    totalNew: number
    willUpdate: number
    willCreate: number
    unchanged: number
    notFound: number
  }
}

export default function UpdatePreviewPage() {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [comparison, setComparison] = useState<ComparisonData | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'update' | 'create' | 'unchanged' | 'notfound'>('update')
  const [importing, setImporting] = useState(false)
  const [importStatus, setImportStatus] = useState('')
  
  // Pagination states for each tab
  const [updatePage, setUpdatePage] = useState(1)
  const [createPage, setCreatePage] = useState(1)
  const [unchangedPage, setUnchangedPage] = useState(1)
  const [notFoundPage, setNotFoundPage] = useState(1)
  const itemsPerPage = 50

  // Track which players to exclude from creation (for duplicates)
  const [excludedPlayerIds, setExcludedPlayerIds] = useState<Set<string>>(new Set())
  
  // Filter for showing only duplicates in create tab
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false)

  // Search & category filter for update tab
  const [updateSearch, setUpdateSearch] = useState('')
  const [updateFilter, setUpdateFilter] = useState<'all' | 'club' | 'stat' | 'info'>('all')

  const clubCount = useMemo(() => comparison?.toUpdate?.filter((p: any) => p.changes?.some((c: any) => c.field === 'club')).length || 0, [comparison?.toUpdate]);
  const statCount = useMemo(() => comparison?.toUpdate?.filter((p: any) => p.changes?.some((c: any) => c.category === 'stat')).length || 0, [comparison?.toUpdate]);
  const infoCount = useMemo(() => comparison?.toUpdate?.filter((p: any) => p.changes?.some((c: any) => c.field === 'playing_style' || c.field === 'position' || c.field === 'age' || c.field === 'nationality')).length || 0, [comparison?.toUpdate]);

  const filteredUpdateList = useMemo(() => {
    if (!comparison?.toUpdate) return [];
    return comparison.toUpdate.filter((player: any) => {
      if (updateSearch.trim()) {
        const q = updateSearch.trim().toLowerCase();
        const matchName = player.name?.toLowerCase().includes(q);
        const matchOldClub = player.old?.club?.toLowerCase().includes(q);
        const matchNewClub = player.new?.club?.toLowerCase().includes(q);
        const matchPos = player.new?.position?.toLowerCase().includes(q) || player.old?.position?.toLowerCase().includes(q);
        if (!matchName && !matchOldClub && !matchNewClub && !matchPos) {
          return false;
        }
      }
      if (updateFilter === 'club') {
        return player.changes?.some((c: any) => c.field === 'club');
      }
      if (updateFilter === 'stat') {
        return player.changes?.some((c: any) => c.category === 'stat');
      }
      if (updateFilter === 'info') {
        return player.changes?.some((c: any) => c.field === 'playing_style' || c.field === 'position' || c.field === 'age' || c.field === 'nationality');
      }
      return true;
    });
  }, [comparison?.toUpdate, updateSearch, updateFilter]);

  const totalUpdatePages = Math.ceil(filteredUpdateList.length / itemsPerPage) || 1;

  useEffect(() => {
    if (user?.role === 'committee_admin') {
      loadComparison()
    }
  }, [user])

  const loadComparison = async () => {
    try {
      setLoading(true)
      const response = await fetchWithTokenRefresh('/api/players/database/compare', {
        method: 'GET'
      })

      const result = await response.json()
      if (result.success) {
        console.log('🔍 DEBUG - Comparison data received:', {
          toUpdateCount: result.data.toUpdate.length,
          toCreateCount: result.data.toCreate.length,
          unchangedCount: result.data.unchanged.length,
          notFoundCount: result.data.notFoundInNew.length,
          firstUpdate: result.data.toUpdate[0],
          firstCreate: result.data.toCreate[0],
          firstUnchanged: result.data.unchanged[0]
        });
        setComparison(result.data)
      } else {
        throw new Error(result.error)
      }
    } catch (error: any) {
      console.error('Error loading comparison:', error)
      alert(`Error: ${error.message}`)
      router.push('/dashboard/committee/database')
    } finally {
      setLoading(false)
    }
  }

  const handleConfirmUpdate = async () => {
    const confirmMessage = `This will update ${comparison.summary.willUpdate} existing players' stats from the temporary database.

WHAT WILL BE UPDATED:
- Player stats (ratings, speed, shooting, passing, etc.)
- Position, playing style, nationality, age

WHAT WILL BE PRESERVED:
- Team assignments (team_id, team_name)
- Ownership status (is_sold)
- Contract and purchase details

NOTE: The ${comparison.summary.willCreate} players in the "Not In Active DB" tab will NOT be created here. Use the separate "Add New Players" portal for that.

Continue?`;
    
    if (!confirm(confirmMessage)) {
      return
    }

    try {
      setImporting(true)
      setImportStatus('Applying updates to active database...')

      const response = await fetchWithTokenRefresh('/api/players/database/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          createNew: false // Do NOT import/create new players here
        })
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to apply updates')
      }
      
      setImportStatus(result.message || 'Successfully updated database!')
      
      setTimeout(() => {
        router.push('/dashboard/committee/database')
      }, 2000)
    } catch (error: any) {
      setImportStatus(`Error: ${error.message}`)
    } finally {
      setImporting(false)
    }
  }

  const togglePlayerExclusion = (playerId: string) => {
    setExcludedPlayerIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(playerId)) {
        newSet.delete(playerId);
      } else {
        newSet.add(playerId);
      }
      return newSet;
    });
  };

  if (authLoading || loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0066FF] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading comparison...</p>
        </div>
      </div>
    )
  }

  if (user.role !== 'committee_admin' || !comparison) {
    return null
  }

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="container mx-auto px-4 pt-5 lg:pt-24 pb-8 max-w-screen-2xl">
      {/* Header */}
      <div className="glass rounded-3xl p-6 mb-8 shadow-lg">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold gradient-text mb-2"><BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Update Stats Preview</h1>
            <p className="text-gray-600">Review changes before updating the database</p>
          </div>
          <Link
            href="/dashboard/committee/database"
            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg transition-colors"
          >
            &larr; Back
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-8">
        <div className="glass rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-blue-600">{comparison.summary.totalExisting}</div>
          <div className="text-sm text-gray-600 mt-1">Active DB Players</div>
        </div>
        <div className="glass rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-purple-600">{comparison.summary.totalNew}</div>
          <div className="text-sm text-gray-600 mt-1">In Temp DB</div>
        </div>
        <div className="glass rounded-xl p-4 text-center bg-orange-50/50">
          <div className="text-3xl font-bold text-orange-600">{comparison.summary.willUpdate}</div>
          <div className="text-sm text-gray-600 mt-1">Will Update ✓</div>
        </div>
        <div className="glass rounded-xl p-4 text-center bg-slate-50/80 border border-slate-200">
          <div className="text-3xl font-bold text-slate-400">{comparison.summary.willCreate}</div>
          <div className="text-sm text-slate-500 mt-1 flex items-center justify-center gap-1">
            <Lock className="w-3.5 h-3.5" />
            Not In Active DB
          </div>
        </div>
        <div className="glass rounded-xl p-4 text-center bg-gray-50/50">
          <div className="text-3xl font-bold text-gray-600">{comparison.summary.unchanged}</div>
          <div className="text-sm text-gray-600 mt-1">Unchanged</div>
        </div>
        <div className="glass rounded-xl p-4 text-center bg-red-50/50">
          <div className="text-3xl font-bold text-red-600">{comparison.summary.notFound}</div>
          <div className="text-sm text-gray-600 mt-1">Not in Temp DB</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="glass rounded-3xl overflow-hidden shadow-lg mb-8">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('update')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'update'
                ? 'bg-orange-50 text-orange-700 border-b-2 border-orange-500'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <RefreshCw className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Will Update ({comparison.summary.willUpdate})
          </button>
          <button
            onClick={() => setActiveTab('create')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'create'
                ? 'bg-slate-100 text-slate-700 border-b-2 border-slate-500'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <Lock className="w-3.5 h-3.5 inline-block text-slate-400 mr-1 align-text-bottom" /> Not In Active DB ({comparison.summary.willCreate})
          </button>
          <button
            onClick={() => setActiveTab('unchanged')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'unchanged'
                ? 'bg-gray-50 text-gray-700 border-b-2 border-gray-500'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            Yes Unchanged ({comparison.summary.unchanged})
          </button>
          <button
            onClick={() => setActiveTab('notfound')}
            className={`flex-1 px-6 py-4 text-sm font-medium transition-colors ${
              activeTab === 'notfound'
                ? 'bg-red-50 text-red-700 border-b-2 border-red-500'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <AlertTriangle className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Not in Upload ({comparison.summary.notFound})
          </button>
        </div>

        <div className="p-6">
          {/* Players to Update */}
          {activeTab === 'update' && (
            <div>
              <div className="mb-4 p-4 bg-orange-50 rounded-xl border border-orange-200">
                <p className="text-sm text-orange-900 leading-relaxed">
                  <strong>These players will be UPDATED:</strong> Real Club, position, playing style, age, nationality, and stats will be updated from the temporary scraped database.
                  <span className="block mt-1 text-xs text-orange-800">
                    🛡️ Fantasy team ownership, contract details, and sold status are <strong>strictly preserved</strong>.
                  </span>
                </p>
              </div>

              {/* Search & Filter Toolbar */}
              <div className="mb-4 p-3 bg-white rounded-xl border border-gray-200 shadow-2xs flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
                {/* Search input */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={updateSearch}
                    onChange={(e) => {
                      setUpdateSearch(e.target.value);
                      setUpdatePage(1);
                    }}
                    placeholder="Search by player name, club, or position..."
                    className="w-full pl-9 pr-3 py-2 text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                  />
                  {updateSearch && (
                    <button
                      onClick={() => { setUpdateSearch(''); setUpdatePage(1); }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-bold"
                    >
                      &times;
                    </button>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-xs text-gray-500 font-medium mr-1 flex items-center gap-1">
                    <Filter className="w-3.5 h-3.5" /> Filter:
                  </span>
                  <button
                    onClick={() => { setUpdateFilter('all'); setUpdatePage(1); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      updateFilter === 'all'
                        ? 'bg-orange-600 text-white shadow-xs'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    All ({comparison.toUpdate.length})
                  </button>
                  <button
                    onClick={() => { setUpdateFilter('club'); setUpdatePage(1); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      updateFilter === 'club'
                        ? 'bg-amber-600 text-white shadow-xs'
                        : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                    }`}
                  >
                    Club Transfers ({clubCount})
                  </button>
                  <button
                    onClick={() => { setUpdateFilter('stat'); setUpdatePage(1); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      updateFilter === 'stat'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                    }`}
                  >
                    Stats / OVR ({statCount})
                  </button>
                  <button
                    onClick={() => { setUpdateFilter('info'); setUpdatePage(1); }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      updateFilter === 'info'
                        ? 'bg-purple-600 text-white shadow-xs'
                        : 'bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200'
                    }`}
                  >
                    Pos / Style / Age ({infoCount})
                  </button>
                </div>
              </div>

              {filteredUpdateList.length === 0 ? (
                <div className="text-center py-12 text-gray-500 bg-white rounded-xl border border-dashed border-gray-300">
                  <p className="font-medium">No players match the current search / filter</p>
                  <button
                    onClick={() => { setUpdateSearch(''); setUpdateFilter('all'); }}
                    className="mt-2 text-xs text-orange-600 hover:underline font-semibold"
                  >
                    Clear search and filter
                  </button>
                </div>
              ) : (
                <>
                  <div className="space-y-4 max-h-[700px] overflow-y-auto pr-1">
                    {filteredUpdateList
                      .slice((updatePage - 1) * itemsPerPage, updatePage * itemsPerPage)
                      .map((player: any, idx: any) => (
                      <div key={player.player_id || idx} className="glass rounded-xl p-4 border border-orange-200/90 bg-white shadow-2xs hover:shadow-md transition-all">
                        {/* Header */}
                        <div className="flex flex-wrap items-center justify-between gap-2 mb-3 pb-2.5 border-b border-gray-100">
                          <div className="flex items-center gap-2">
                            <span className="p-1.5 rounded-lg bg-orange-100 text-orange-700">
                              <RefreshCw className="w-4 h-4" />
                            </span>
                            <div>
                              <span className="font-bold text-base md:text-lg text-gray-900">{player.name}</span>
                              <span className="text-xs text-gray-400 ml-2">ID: {player.player_id}</span>
                            </div>
                          </div>

                          <div className="flex flex-wrap items-center gap-1.5 text-xs">
                            {/* Position Badge */}
                            <span className="px-2 py-0.5 rounded font-bold bg-blue-100 text-blue-800 border border-blue-200">
                              {player.old.position}
                              {player.old.position !== player.new.position && (
                                <span className="ml-1 text-emerald-700 font-extrabold">&rarr; {player.new.position}</span>
                              )}
                            </span>

                            {/* OVR Badge */}
                            <span className={`px-2 py-0.5 rounded font-bold ${
                              player.old.overall_rating !== player.new.overall_rating
                                ? 'bg-amber-100 text-amber-900 border border-amber-300'
                                : 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            }`}>
                              OVR: {player.old.overall_rating}
                              {player.old.overall_rating !== player.new.overall_rating && (
                                <span className="ml-1 text-emerald-700 font-extrabold">
                                  &rarr; {player.new.overall_rating} ({player.new.overall_rating - player.old.overall_rating > 0 ? '+' : ''}{player.new.overall_rating - player.old.overall_rating})
                                </span>
                              )}
                            </span>

                            {/* League Fantasy Team Badge (Preserved) */}
                            <span className="px-2 py-0.5 rounded text-gray-600 bg-gray-100 border border-gray-200 flex items-center gap-1">
                              <span>SS Team:</span>
                              <strong className="text-gray-800">{player.old.team_name || 'Free Agent'}</strong>
                              <span className="text-[10px] text-gray-400 font-normal">(Preserved)</span>
                            </span>

                            {/* Changes Count Pill */}
                            {player.changes && player.changes.length > 0 && (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-100 text-orange-800 border border-orange-300">
                                ⚡ {player.changes.length} change{player.changes.length > 1 ? 's' : ''}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Changed Attributes Callout Banner (PROMINENT & HIGHLIGHTED) */}
                        {player.changes && player.changes.length > 0 ? (
                          <div className="mb-3 p-2.5 bg-gradient-to-r from-orange-50 via-amber-50 to-orange-50 rounded-lg border border-orange-200">
                            <div className="text-[11px] font-bold uppercase tracking-wider text-orange-800 mb-1.5 flex items-center gap-1">
                              <span>✨ Updating Attributes:</span>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {player.changes.map((ch: any, cIdx: number) => {
                                let badgeStyle = "bg-white text-gray-800 border-gray-300";
                                if (ch.field === 'club') badgeStyle = "bg-amber-100/90 text-amber-950 border-amber-300";
                                else if (ch.field === 'age') badgeStyle = "bg-blue-100/90 text-blue-950 border-blue-300";
                                else if (ch.field === 'playing_style') badgeStyle = "bg-purple-100/90 text-purple-950 border-purple-300";
                                else if (ch.field === 'position') badgeStyle = "bg-indigo-100/90 text-indigo-950 border-indigo-300";
                                else if (ch.category === 'stat') badgeStyle = "bg-emerald-100/90 text-emerald-950 border-emerald-300";

                                return (
                                  <span key={cIdx} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border shadow-2xs ${badgeStyle}`}>
                                    <span className="font-bold opacity-80">{ch.label}:</span>
                                    <span className="line-through text-red-600 font-normal">{String(ch.old)}</span>
                                    <span className="text-gray-400 font-bold">&rarr;</span>
                                    <span className="text-emerald-700 font-extrabold">{String(ch.new)}</span>
                                    {ch.diff !== undefined && (
                                      <span className={`text-[10px] px-1 py-0.2 rounded font-black ${
                                        ch.diff > 0 ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                                      }`}>
                                        {ch.diff > 0 ? `+${ch.diff}` : ch.diff}
                                      </span>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        ) : (
                          <div className="mb-3 p-2 bg-gray-50 rounded-lg border border-gray-200 text-xs text-gray-500">
                            No attribute changes detected
                          </div>
                        )}

                        {/* Compact Side-by-side comparison */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                          {/* OLD VALUES */}
                          <div className="bg-red-50/70 rounded-lg p-3 border border-red-200">
                            <div className="text-xs font-bold text-red-800 mb-2 flex items-center justify-between pb-1 border-b border-red-200">
                              <span className="flex items-center gap-1">
                                <XCircle className="w-3.5 h-3.5 text-rose-500" />
                                <span>Current Database</span>
                              </span>
                              <span className="text-[11px] font-normal text-red-600">Active</span>
                            </div>

                            {/* Meta Fields */}
                            <div className="grid grid-cols-2 gap-2 text-xs mb-2.5 pb-2 border-b border-red-200/60">
                              <div className="flex justify-between">
                                <span className="text-gray-500 font-medium">Club:</span>
                                <span className={player.old.club !== player.new.club ? "text-red-600 line-through font-semibold" : "text-gray-800 font-medium"}>
                                  {player.old.club || 'None'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 font-medium">Style:</span>
                                <span className={player.old.playing_style !== player.new.playing_style ? "text-red-600 line-through font-semibold" : "text-gray-800 font-medium"}>
                                  {player.old.playing_style || 'None'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 font-medium">Age:</span>
                                <span className={player.old.age !== player.new.age ? "text-red-600 line-through font-semibold" : "text-gray-800 font-medium"}>
                                  {player.old.age || '-'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 font-medium">Nationality:</span>
                                <span className={player.old.nationality !== player.new.nationality ? "text-red-600 line-through font-semibold" : "text-gray-800 font-medium"}>
                                  {player.old.nationality || '-'}
                                </span>
                              </div>
                            </div>

                            {/* 19 Core Stats Grid */}
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-x-2 gap-y-1 text-xs">
                              {[
                                { label: 'Pos', val: player.old.position, changed: player.old.position !== player.new.position },
                                { label: 'OVR', val: player.old.overall_rating, changed: player.old.overall_rating !== player.new.overall_rating },
                                { label: 'PAC', val: player.old.pace, changed: player.old.pace !== player.new.pace },
                                { label: 'SHO', val: player.old.shooting, changed: player.old.shooting !== player.new.shooting },
                                { label: 'PAS', val: player.old.passing, changed: player.old.passing !== player.new.passing },
                                { label: 'DRI', val: player.old.dribbling, changed: player.old.dribbling !== player.new.dribbling },
                                { label: 'DEF', val: player.old.defending, changed: player.old.defending !== player.new.defending },
                                { label: 'PHY', val: player.old.physical, changed: player.old.physical !== player.new.physical },
                                { label: 'ACC', val: player.old.acceleration, changed: player.old.acceleration !== player.new.acceleration },
                                { label: 'BC', val: player.old.ball_control, changed: player.old.ball_control !== player.new.ball_control },
                                { label: 'TP', val: player.old.tight_possession, changed: player.old.tight_possession !== player.new.tight_possession },
                                { label: 'LP', val: player.old.lofted_pass, changed: player.old.lofted_pass !== player.new.lofted_pass },
                                { label: 'HEA', val: player.old.heading, changed: player.old.heading !== player.new.heading },
                                { label: 'KP', val: player.old.kicking_power, changed: player.old.kicking_power !== player.new.kicking_power },
                                { label: 'JUM', val: player.old.jumping, changed: player.old.jumping !== player.new.jumping },
                                { label: 'STA', val: player.old.stamina, changed: player.old.stamina !== player.new.stamina },
                                { label: 'TAC', val: player.old.tackling, changed: player.old.tackling !== player.new.tackling },
                                { label: 'AGG', val: player.old.aggression, changed: player.old.aggression !== player.new.aggression },
                              ].map((item, i) => (
                                <div key={i} className={`flex justify-between px-1 py-0.5 rounded ${item.changed ? 'bg-red-100/90' : ''}`}>
                                  <span className="text-gray-500 font-medium">{item.label}:</span>
                                  <span className={item.changed ? "text-red-700 line-through font-bold" : "text-gray-700 font-medium"}>
                                    {item.val || '-'}
                                  </span>
                                </div>
                              ))}
                            </div>

                            {/* GK Stats if applicable */}
                            {(player.old.position === 'GK' || player.new.position === 'GK' || (player.old.gk_reflexes && player.old.gk_reflexes > 40) || (player.new.gk_reflexes && player.new.gk_reflexes > 40)) && (
                              <div className="mt-2 pt-1.5 border-t border-red-200/60">
                                <div className="text-[11px] font-bold text-gray-500 mb-1">Goalkeeper Attributes:</div>
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 text-xs">
                                  {[
                                    { label: 'GK Awr', val: player.old.gk_awareness, changed: player.old.gk_awareness !== player.new.gk_awareness },
                                    { label: 'Catch', val: player.old.gk_catching, changed: player.old.gk_catching !== player.new.gk_catching },
                                    { label: 'Parry', val: player.old.gk_parrying, changed: player.old.gk_parrying !== player.new.gk_parrying },
                                    { label: 'Reflex', val: player.old.gk_reflexes, changed: player.old.gk_reflexes !== player.new.gk_reflexes },
                                    { label: 'Reach', val: player.old.gk_reach, changed: player.old.gk_reach !== player.new.gk_reach },
                                  ].map((gk, gi) => (
                                    <div key={gi} className={`flex justify-between px-1 py-0.5 rounded ${gk.changed ? 'bg-red-100/90' : ''}`}>
                                      <span className="text-gray-500">{gk.label}:</span>
                                      <span className={gk.changed ? "text-red-700 line-through font-bold" : "text-gray-700 font-medium"}>{gk.val || '-'}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* NEW VALUES */}
                          <div className="bg-emerald-50/70 rounded-lg p-3 border border-emerald-200">
                            <div className="text-xs font-bold text-emerald-800 mb-2 flex items-center justify-between pb-1 border-b border-emerald-200">
                              <span className="flex items-center gap-1">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                                <span>Scraped Update</span>
                              </span>
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.5 rounded">New Version</span>
                            </div>

                            {/* Meta Fields */}
                            <div className="grid grid-cols-2 gap-2 text-xs mb-2.5 pb-2 border-b border-emerald-200/60">
                              <div className="flex justify-between">
                                <span className="text-gray-500 font-medium">Club:</span>
                                <span className={player.old.club !== player.new.club ? "text-emerald-800 font-bold bg-emerald-100 px-1 rounded border border-emerald-300" : "text-gray-800 font-medium"}>
                                  {player.new.club || 'None'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 font-medium">Style:</span>
                                <span className={player.old.playing_style !== player.new.playing_style ? "text-emerald-800 font-bold bg-emerald-100 px-1 rounded border border-emerald-300" : "text-gray-800 font-medium"}>
                                  {player.new.playing_style || 'None'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 font-medium">Age:</span>
                                <span className={player.old.age !== player.new.age ? "text-emerald-800 font-bold bg-emerald-100 px-1 rounded border border-emerald-300" : "text-gray-800 font-medium"}>
                                  {player.new.age || '-'}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-gray-500 font-medium">Nationality:</span>
                                <span className={player.old.nationality !== player.new.nationality ? "text-emerald-800 font-bold bg-emerald-100 px-1 rounded border border-emerald-300" : "text-gray-800 font-medium"}>
                                  {player.new.nationality || '-'}
                                </span>
                              </div>
                            </div>

                            {/* 19 Core Stats Grid */}
                            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-x-2 gap-y-1 text-xs">
                              {[
                                { label: 'Pos', val: player.new.position, changed: player.old.position !== player.new.position, diff: null },
                                { label: 'OVR', val: player.new.overall_rating, changed: player.old.overall_rating !== player.new.overall_rating, diff: player.new.overall_rating - player.old.overall_rating },
                                { label: 'PAC', val: player.new.pace, changed: player.old.pace !== player.new.pace, diff: player.new.pace - player.old.pace },
                                { label: 'SHO', val: player.new.shooting, changed: player.old.shooting !== player.new.shooting, diff: player.new.shooting - player.old.shooting },
                                { label: 'PAS', val: player.new.passing, changed: player.old.passing !== player.new.passing, diff: player.new.passing - player.old.passing },
                                { label: 'DRI', val: player.new.dribbling, changed: player.old.dribbling !== player.new.dribbling, diff: player.new.dribbling - player.old.dribbling },
                                { label: 'DEF', val: player.new.defending, changed: player.old.defending !== player.new.defending, diff: player.new.defending - player.old.defending },
                                { label: 'PHY', val: player.new.physical, changed: player.old.physical !== player.new.physical, diff: player.new.physical - player.old.physical },
                                { label: 'ACC', val: player.new.acceleration, changed: player.old.acceleration !== player.new.acceleration, diff: player.new.acceleration - player.old.acceleration },
                                { label: 'BC', val: player.new.ball_control, changed: player.old.ball_control !== player.new.ball_control, diff: player.new.ball_control - player.old.ball_control },
                                { label: 'TP', val: player.new.tight_possession, changed: player.old.tight_possession !== player.new.tight_possession, diff: player.new.tight_possession - player.old.tight_possession },
                                { label: 'LP', val: player.new.lofted_pass, changed: player.old.lofted_pass !== player.new.lofted_pass, diff: player.new.lofted_pass - player.old.lofted_pass },
                                { label: 'HEA', val: player.new.heading, changed: player.old.heading !== player.new.heading, diff: player.new.heading - player.old.heading },
                                { label: 'KP', val: player.new.kicking_power, changed: player.old.kicking_power !== player.new.kicking_power, diff: player.new.kicking_power - player.old.kicking_power },
                                { label: 'JUM', val: player.new.jumping, changed: player.old.jumping !== player.new.jumping, diff: player.new.jumping - player.old.jumping },
                                { label: 'STA', val: player.new.stamina, changed: player.old.stamina !== player.new.stamina, diff: player.new.stamina - player.old.stamina },
                                { label: 'TAC', val: player.new.tackling, changed: player.old.tackling !== player.new.tackling, diff: player.new.tackling - player.old.tackling },
                                { label: 'AGG', val: player.new.aggression, changed: player.old.aggression !== player.new.aggression, diff: player.new.aggression - player.old.aggression },
                              ].map((item, i) => (
                                <div key={i} className={`flex justify-between items-center px-1 py-0.5 rounded ${item.changed ? 'bg-emerald-100/90 border border-emerald-300' : ''}`}>
                                  <span className="text-gray-500 font-medium">{item.label}:</span>
                                  <span className={item.changed ? "text-emerald-900 font-extrabold flex items-center gap-0.5" : "text-gray-700 font-medium"}>
                                    {item.val || '-'}
                                    {item.changed && item.diff !== null && item.diff !== undefined && (
                                      <span className={`text-[10px] ${item.diff > 0 ? 'text-emerald-700 font-black' : 'text-rose-700 font-black'}`}>
                                        ({item.diff > 0 ? `+${item.diff}` : item.diff})
                                      </span>
                                    )}
                                  </span>
                                </div>
                              ))}
                            </div>

                            {/* GK Stats if applicable */}
                            {(player.old.position === 'GK' || player.new.position === 'GK' || (player.old.gk_reflexes && player.old.gk_reflexes > 40) || (player.new.gk_reflexes && player.new.gk_reflexes > 40)) && (
                              <div className="mt-2 pt-1.5 border-t border-emerald-200/60">
                                <div className="text-[11px] font-bold text-gray-500 mb-1">Goalkeeper Attributes:</div>
                                <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 text-xs">
                                  {[
                                    { label: 'GK Awr', val: player.new.gk_awareness, changed: player.old.gk_awareness !== player.new.gk_awareness, diff: player.new.gk_awareness - player.old.gk_awareness },
                                    { label: 'Catch', val: player.new.gk_catching, changed: player.old.gk_catching !== player.new.gk_catching, diff: player.new.gk_catching - player.old.gk_catching },
                                    { label: 'Parry', val: player.new.gk_parrying, changed: player.old.gk_parrying !== player.new.gk_parrying, diff: player.new.gk_parrying - player.old.gk_parrying },
                                    { label: 'Reflex', val: player.new.gk_reflexes, changed: player.old.gk_reflexes !== player.new.gk_reflexes, diff: player.new.gk_reflexes - player.old.gk_reflexes },
                                    { label: 'Reach', val: player.new.gk_reach, changed: player.old.gk_reach !== player.new.gk_reach, diff: player.new.gk_reach - player.old.gk_reach },
                                  ].map((gk, gi) => (
                                    <div key={gi} className={`flex justify-between items-center px-1 py-0.5 rounded ${gk.changed ? 'bg-emerald-100/90 border border-emerald-300' : ''}`}>
                                      <span className="text-gray-500">{gk.label}:</span>
                                      <span className={gk.changed ? "text-emerald-900 font-extrabold flex items-center gap-0.5" : "text-gray-700 font-medium"}>
                                        {gk.val || '-'}
                                        {gk.changed && (
                                          <span className={`text-[10px] ${gk.diff > 0 ? 'text-emerald-700 font-black' : 'text-rose-700 font-black'}`}>
                                            ({gk.diff > 0 ? `+${gk.diff}` : gk.diff})
                                          </span>
                                        )}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Pagination for Update */}
                  {filteredUpdateList.length > itemsPerPage && (
                    <div className="mt-6 flex items-center justify-between border-t pt-4">
                      <div className="text-sm text-gray-600">
                        Showing {((updatePage - 1) * itemsPerPage) + 1} to {Math.min(updatePage * itemsPerPage, filteredUpdateList.length)} of {filteredUpdateList.length}
                        {updateSearch && <span className="ml-2 text-orange-600 font-medium">(Filtered)</span>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setUpdatePage(1)}
                          disabled={updatePage === 1}
                          className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          First
                        </button>
                        <button
                          onClick={() => setUpdatePage(p => Math.max(1, p - 1))}
                          disabled={updatePage === 1}
                          className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          Previous
                        </button>
                        <span className="px-4 py-1 bg-orange-100 text-orange-700 rounded text-sm font-medium">
                          {updatePage} / {totalUpdatePages}
                        </span>
                        <button
                          onClick={() => setUpdatePage(p => Math.min(totalUpdatePages, p + 1))}
                          disabled={updatePage >= totalUpdatePages}
                          className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          Next
                        </button>
                        <button
                          onClick={() => setUpdatePage(totalUpdatePages)}
                          disabled={updatePage >= totalUpdatePages}
                          className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          Last
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* New Players to Create */}
          {activeTab === 'create' && (
            <div>
              <div className="mb-4 p-4 bg-emerald-50 rounded-lg border border-emerald-200">
                <p className="text-sm text-slate-800">
                  <strong>Notice:</strong> These new players were found during scraping but do not exist in the active registry.
                  <span className="block mt-2 font-bold text-rose-700 bg-rose-50/50 border border-rose-200 p-3 rounded-xl">
                    ⚠️ New player entries are NOT created from this screen. To import and add these new players, please use the separate <Link href="/dashboard/committee/database/add-new" className="underline text-rose-800 hover:text-rose-900 font-extrabold">Add New Players Page &rarr;</Link>
                  </span>
                </p>
              </div>
              
              {/* Filter Toggle */}
              {comparison.toCreate.some((p: any) => p.hasDuplicates) && (
                <div className="mb-4 space-y-3">
                  {/* Filter buttons */}
                  <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                    <span className="text-sm font-medium text-gray-700">Filter:</span>
                    <button
                      onClick={() => setShowOnlyDuplicates(false)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        !showOnlyDuplicates
                          ? 'bg-green-600 text-white shadow-md'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Show All ({comparison.toCreate.length})
                    </button>
                    <button
                      onClick={() => setShowOnlyDuplicates(true)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                        showOnlyDuplicates
                          ? 'bg-orange-600 text-white shadow-md'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Only Duplicates ({comparison.toCreate.filter((p: any) => p.hasDuplicates).length})
                    </button>
                  </div>
                  
                  {/* Bulk selection buttons */}
                  <div className="flex items-center gap-3 p-3 bg-white rounded-lg border border-gray-200">
                    <span className="text-sm font-medium text-gray-700">Bulk Actions:</span>
                    <button
                      onClick={() => {
                        const filteredPlayers = comparison.toCreate.filter((p: any) => !showOnlyDuplicates || p.hasDuplicates);
                        const newExcluded = new Set(excludedPlayerIds);
                        filteredPlayers.forEach((p: any) => newExcluded.delete(p.player_id));
                        setExcludedPlayerIds(newExcluded);
                      }}
                      className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
                    >
                      Yes Select All {showOnlyDuplicates ? 'Duplicates' : 'Visible'}
                    </button>
                    <button
                      onClick={() => {
                        const filteredPlayers = comparison.toCreate.filter((p: any) => !showOnlyDuplicates || p.hasDuplicates);
                        const newExcluded = new Set(excludedPlayerIds);
                        filteredPlayers.forEach((p: any) => newExcluded.add(p.player_id));
                        setExcludedPlayerIds(newExcluded);
                      }}
                      className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
                    >
                      No Deselect All {showOnlyDuplicates ? 'Duplicates' : 'Visible'}
                    </button>
                    {showOnlyDuplicates && (
                      <button
                        onClick={() => {
                          const duplicatePlayers = comparison.toCreate.filter((p: any) => p.hasDuplicates);
                          const newExcluded = new Set(excludedPlayerIds);
                          duplicatePlayers.forEach((p: any) => newExcluded.add(p.player_id));
                          setExcludedPlayerIds(newExcluded);
                        }}
                        className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
                      >
                        Skip All Duplicates
                      </button>
                    )}
                    {excludedPlayerIds.size > 0 && (
                      <button
                        onClick={() => setExcludedPlayerIds(new Set())}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-all shadow-sm"
                      >
                        Reset All ({excludedPlayerIds.size} excluded)
                      </button>
                    )}
                  </div>
                </div>
              )}
              
              {comparison.toCreate.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  No new players to create
                </div>
              ) : (
                <>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {comparison.toCreate
                    .filter((p: any) => !showOnlyDuplicates || p.hasDuplicates)
                    .slice((createPage - 1) * itemsPerPage, createPage * itemsPerPage)
                    .map((player: any, idx: number) => {
                      const isExcluded = excludedPlayerIds.has(player.player_id);
                      const hasDuplicates = player.hasDuplicates;
                      
                      return (

                    <div 
                      key={idx} 
                      className={`glass rounded-lg p-3 border transition-all ${
                        hasDuplicates 
                          ? 'border-orange-300 bg-orange-50/30' 
                          : 'border-green-200'
                      } ${isExcluded ? 'opacity-50' : 'hover:shadow-md'}`}
                    >
                      {/* Header with checkbox */}
                      <div className="flex items-start gap-2 mb-2">
                        <input
                          type="checkbox"
                          checked={!isExcluded}
                          onChange={() => togglePlayerExclusion(player.player_id)}
                          className="mt-0.5 w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
                          title={isExcluded ? "Click to include" : "Click to exclude"}
                        />
                        <div className="flex-1">
                          <div className="font-bold text-base text-gray-900 flex items-center gap-2 flex-wrap">
                            <span className={hasDuplicates ? "text-orange-600" : "text-green-600"}>
                              {hasDuplicates ? <AlertTriangle className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> : <Plus className="w-4 h-4 inline-block text-green-500 mr-1 align-text-bottom" />}
                            </span>
                            {player.name}
                            {hasDuplicates && (
                              <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full font-medium">
                                Duplicate
                              </span>
                            )}
                            {isExcluded && (
                              <span className="text-xs px-2 py-0.5 bg-gray-200 text-gray-600 rounded-full font-medium">
                                Skipped
                              </span>
                            )}
                          </div>
                          
                          {/* Duplicate warning */}
                          {hasDuplicates && player.duplicates && player.duplicates.length > 0 && (
                            <div className="mt-2 p-2 bg-orange-100 rounded border border-orange-200">
                              <div className="text-xs font-bold text-orange-800 mb-1">
                                Found {player.duplicates.length} existing player(s) with same name:
                              </div>
                              {player.duplicates.map((dup: any, dupIdx: number) => (
                                <div key={dupIdx} className="text-xs text-orange-700 flex flex-wrap items-center gap-1">
                                  <span className="font-medium">ID: {dup.player_id}</span>
                                  <span>•</span>
                                  <span>{dup.position}</span>
                                  <span>•</span>
                                  <span>OVR: {dup.overall_rating}</span>
                                  <span>•</span>
                                  <span>{dup.team_name || 'No team'}</span>
                                  {dup.is_sold && <span className="text-green-600">• Sold</span>}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {/* Player stats */}
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-x-3 gap-y-1.5 text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Club:</span>
                          <span className="font-medium text-gray-700">{(player.team_name || 'None').substring(0, 12)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Pos:</span>
                          <span className="font-medium text-gray-700">{player.position}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Style:</span>
                          <span className="font-medium text-gray-700">{(player.playing_style || 'None').substring(0, 10)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">OVR:</span>
                          <span className="font-medium text-green-600">{player.overall_rating}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">PAC:</span>
                          <span className="font-medium text-gray-700">{player.pace || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">SHO:</span>
                          <span className="font-medium text-gray-700">{player.shooting || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">PAS:</span>
                          <span className="font-medium text-gray-700">{player.passing || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">DRI:</span>
                          <span className="font-medium text-gray-700">{player.dribbling || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">DEF:</span>
                          <span className="font-medium text-gray-700">{player.defending || '-'}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">PHY:</span>
                          <span className="font-medium text-gray-700">{player.physical || '-'}</span>
                        </div>
                      </div>
                    </div>
                  )}

  )}
                </div>
                {/* Pagination for Create */}
                {(() => {
                  const filteredList = comparison.toCreate.filter((p: any) => !showOnlyDuplicates || p.hasDuplicates);
                  const totalPages = Math.ceil(filteredList.length / itemsPerPage);
                  
                  return filteredList.length > itemsPerPage && (
                  <div className="mt-6 flex items-center justify-between border-t pt-4">
                    <div className="text-sm text-gray-600">
                      Showing {((createPage - 1) * itemsPerPage) + 1} to {Math.min(createPage * itemsPerPage, filteredList.length)} of {filteredList.length}
                      {showOnlyDuplicates && <span className="ml-2 text-orange-600 font-medium">(Duplicates only)</span>}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setCreatePage(1)}
                        disabled={createPage === 1}
                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        First
                      </button>
                      <button
                        onClick={() => setCreatePage(p => Math.max(1, p - 1))}
                        disabled={createPage === 1}
                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        Previous
                      </button>
                      <span className="px-4 py-1 bg-green-100 text-green-700 rounded text-sm font-medium">
                        {createPage} / {totalPages}
                      </span>
                      <button
                        onClick={() => setCreatePage(p => Math.min(totalPages, p + 1))}
                        disabled={createPage >= totalPages}
                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        Next
                      </button>
                      <button
                        onClick={() => setCreatePage(totalPages)}
                        disabled={createPage >= totalPages}
                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        Last
                      </button>
                    </div>
                  </div>
                )})()}
              </>
              )}
            </div>
          )}

          {/* Unchanged Players */}
          {activeTab === 'unchanged' && (
            <div>
              <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-sm text-gray-800">
                  <strong>These players are already up-to-date:</strong> No changes needed - all values match the upload.
                </p>
              </div>
              {comparison.unchanged.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  No unchanged players
                </div>
              ) : (
                <>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {comparison.unchanged
                    .slice((unchangedPage - 1) * itemsPerPage, unchangedPage * itemsPerPage)
                    .map((player: any, idx: any) => (
                    <div key={idx} className="glass rounded-xl p-3 border border-gray-200 flex justify-between items-center">
                      <div>
                        <div className="font-bold text-lg text-gray-900">
                          {player.name}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {player.position} • Rating: {player.overall_rating} • Club: {player.club || 'None'} • SS Team: {player.team_name || 'Free Agent'}
                        </div>
                      </div>
                      <div className="text-xs text-green-600 font-medium">Yes Up to date</div>
                    </div>
                  ))}
                </div>
                {/* Pagination for Unchanged */}
                {comparison.unchanged.length > itemsPerPage && (
                  <div className="mt-6 flex items-center justify-between border-t pt-4">
                    <div className="text-sm text-gray-600">
                      Showing {((unchangedPage - 1) * itemsPerPage) + 1} to {Math.min(unchangedPage * itemsPerPage, comparison.unchanged.length)} of {comparison.unchanged.length}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setUnchangedPage(1)}
                        disabled={unchangedPage === 1}
                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        First
                      </button>
                      <button
                        onClick={() => setUnchangedPage(p => Math.max(1, p - 1))}
                        disabled={unchangedPage === 1}
                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        Previous
                      </button>
                      <span className="px-4 py-1 bg-gray-100 text-gray-700 rounded text-sm font-medium">
                        {unchangedPage} / {Math.ceil(comparison.unchanged.length / itemsPerPage)}
                      </span>
                      <button
                        onClick={() => setUnchangedPage(p => Math.min(Math.ceil(comparison.unchanged.length / itemsPerPage), p + 1))}
                        disabled={unchangedPage >= Math.ceil(comparison.unchanged.length / itemsPerPage)}
                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        Next
                      </button>
                      <button
                        onClick={() => setUnchangedPage(Math.ceil(comparison.unchanged.length / itemsPerPage))}
                        disabled={unchangedPage >= Math.ceil(comparison.unchanged.length / itemsPerPage)}
                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        Last
                      </button>
                    </div>
                  </div>
                )}
              </>
              )}
            </div>
          )}

          {/* Players Not Found in Upload */}
          {activeTab === 'notfound' && (
            <div>
              <div className="mb-4 p-4 bg-red-50 rounded-lg border border-red-200">
                <p className="text-sm text-red-800">
                  <strong>These players exist in the database but are NOT in your upload:</strong> They will remain unchanged in the database.
                </p>
              </div>
              {comparison.notFoundInNew.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  All existing players are in the upload
                </div>
              ) : (
                <>
                <div className="space-y-2 max-h-[600px] overflow-y-auto">
                  {comparison.notFoundInNew
                    .slice((notFoundPage - 1) * itemsPerPage, notFoundPage * itemsPerPage)
                    .map((player: any, idx: any) => (
                    <div key={idx} className="glass rounded-xl p-3 border border-red-200 flex justify-between items-center">
                      <div>
                        <div className="font-bold text-lg text-gray-900">
                          {player.name}
                        </div>
                        <div className="text-xs text-gray-600 mt-1">
                          {player.position} • Rating: {player.overall_rating} • Team: {player.team_name || 'None'} ({player.team_id || 'No team'})
                          {player.is_sold && <span className="ml-2 text-green-600">• Sold</span>}
                        </div>
                      </div>
                      <div className="text-xs text-gray-500">ID: {player.player_id}</div>
                    </div>
                  ))}
                </div>
                {/* Pagination for Not Found */}
                {comparison.notFoundInNew.length > itemsPerPage && (
                  <div className="mt-6 flex items-center justify-between border-t pt-4">
                    <div className="text-sm text-gray-600">
                      Showing {((notFoundPage - 1) * itemsPerPage) + 1} to {Math.min(notFoundPage * itemsPerPage, comparison.notFoundInNew.length)} of {comparison.notFoundInNew.length}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setNotFoundPage(1)}
                        disabled={notFoundPage === 1}
                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        First
                      </button>
                      <button
                        onClick={() => setNotFoundPage(p => Math.max(1, p - 1))}
                        disabled={notFoundPage === 1}
                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        Previous
                      </button>
                      <span className="px-4 py-1 bg-red-100 text-red-700 rounded text-sm font-medium">
                        {notFoundPage} / {Math.ceil(comparison.notFoundInNew.length / itemsPerPage)}
                      </span>
                      <button
                        onClick={() => setNotFoundPage(p => Math.min(Math.ceil(comparison.notFoundInNew.length / itemsPerPage), p + 1))}
                        disabled={notFoundPage >= Math.ceil(comparison.notFoundInNew.length / itemsPerPage)}
                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        Next
                      </button>
                      <button
                        onClick={() => setNotFoundPage(Math.ceil(comparison.notFoundInNew.length / itemsPerPage))}
                        disabled={notFoundPage >= Math.ceil(comparison.notFoundInNew.length / itemsPerPage)}
                        className="px-3 py-1 bg-white border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                      >
                        Last
                      </button>
                    </div>
                  </div>
                )}
              </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="glass rounded-3xl p-6 shadow-lg">
        <div className="flex justify-between items-center">
          <div>
            <h3 className="text-lg font-semibold mb-1">Ready to Update?</h3>
            <p className="text-sm text-gray-600">
              This will update <strong>{comparison.summary.willUpdate}</strong> existing players' stats only.
              <span className="block text-xs text-slate-400 mt-0.5">
                The {comparison.summary.willCreate} players in "Not In Active DB" will <strong>not</strong> be created — use the Add New Players portal for that.
              </span>
            </p>
          </div>
          <button
            onClick={handleConfirmUpdate}
            disabled={importing}
            className="px-6 py-3 bg-gradient-to-r from-orange-500 to-orange-600 hover:from-orange-600 hover:to-orange-700 text-white font-medium rounded-lg transition-all shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {importing ? 'Updating...' : 'Confirm & Update'}
          </button>
        </div>
        {importStatus && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-sm text-blue-800">{importStatus}</p>
          </div>
        )}
      </div>
    </div>
  
    </AuthGuard>
  )
}
