'use client'
import {
  XCircle,
  RefreshCw,
  CheckCircle,
  Lock,
  BarChart2,
  AlertTriangle,
  Plus,
  Search,
  Filter,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  LayoutGrid,
  Table,
  ShieldCheck
} from 'lucide-react';

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
  
  // Pagination states
  const [updatePage, setUpdatePage] = useState(1)
  const [createPage, setCreatePage] = useState(1)
  const [unchangedPage, setUnchangedPage] = useState(1)
  const [notFoundPage, setNotFoundPage] = useState(1)
  const itemsPerPage = 50

  // View mode for Update tab: 'cards' | 'diffs'
  const [updateViewMode, setUpdateViewMode] = useState<'cards' | 'diffs'>('cards')

  // Search & category filter for update tab
  const [updateSearch, setUpdateSearch] = useState('')
  const [updateFilter, setUpdateFilter] = useState<'all' | 'club' | 'stat' | 'info'>('all')

  // Create tab filters
  const [createSearch, setCreateSearch] = useState('')
  const [showOnlyDuplicates, setShowOnlyDuplicates] = useState(false)
  const [excludedPlayerIds, setExcludedPlayerIds] = useState<Set<string>>(new Set())

  // Search for unchanged and notfound tabs
  const [unchangedSearch, setUnchangedSearch] = useState('')
  const [notFoundSearch, setNotFoundSearch] = useState('')

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
    const confirmMessage = `This will update ${comparison?.summary.willUpdate} existing players' stats from the temporary database.

WHAT WILL BE UPDATED:
- Real Club, position, playing style, nationality, age
- Player stats (ratings, speed, shooting, passing, etc.)

WHAT WILL BE PRESERVED:
- SS League team assignments (team_id, team_name)
- Ownership status (is_sold)
- Contract and purchase details

NOTE: The ${comparison?.summary.willCreate} players in the "Not In Active DB" tab will NOT be created here. Use the separate "Add New Players" portal for that.

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
          createNew: false
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

  // Memoized counts for Update filter pills
  const clubCount = useMemo(() => comparison?.toUpdate?.filter((p: any) => p.changes?.some((c: any) => c.field === 'club')).length || 0, [comparison?.toUpdate]);
  const statCount = useMemo(() => comparison?.toUpdate?.filter((p: any) => p.changes?.some((c: any) => c.category === 'stat')).length || 0, [comparison?.toUpdate]);
  const infoCount = useMemo(() => comparison?.toUpdate?.filter((p: any) => p.changes?.some((c: any) => c.field === 'playing_style' || c.field === 'position' || c.field === 'age' || c.field === 'nationality')).length || 0, [comparison?.toUpdate]);

  // Filtered lists for each tab
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

  const filteredCreateList = useMemo(() => {
    if (!comparison?.toCreate) return [];
    return comparison.toCreate.filter((player: any) => {
      if (showOnlyDuplicates && !player.hasDuplicates) return false;
      if (createSearch.trim()) {
        const q = createSearch.trim().toLowerCase();
        const matchName = player.name?.toLowerCase().includes(q);
        const matchClub = player.team_name?.toLowerCase().includes(q);
        const matchPos = player.position?.toLowerCase().includes(q);
        if (!matchName && !matchClub && !matchPos) return false;
      }
      return true;
    });
  }, [comparison?.toCreate, showOnlyDuplicates, createSearch]);

  const totalCreatePages = Math.ceil(filteredCreateList.length / itemsPerPage) || 1;

  const filteredUnchangedList = useMemo(() => {
    if (!comparison?.unchanged) return [];
    if (!unchangedSearch.trim()) return comparison.unchanged;
    const q = unchangedSearch.trim().toLowerCase();
    return comparison.unchanged.filter((p: any) => 
      p.name?.toLowerCase().includes(q) ||
      p.club?.toLowerCase().includes(q) ||
      p.team_name?.toLowerCase().includes(q) ||
      p.position?.toLowerCase().includes(q)
    );
  }, [comparison?.unchanged, unchangedSearch]);

  const totalUnchangedPages = Math.ceil(filteredUnchangedList.length / itemsPerPage) || 1;

  const filteredNotFoundList = useMemo(() => {
    if (!comparison?.notFoundInNew) return [];
    if (!notFoundSearch.trim()) return comparison.notFoundInNew;
    const q = notFoundSearch.trim().toLowerCase();
    return comparison.notFoundInNew.filter((p: any) => 
      p.name?.toLowerCase().includes(q) ||
      p.club?.toLowerCase().includes(q) ||
      p.team_name?.toLowerCase().includes(q) ||
      p.position?.toLowerCase().includes(q)
    );
  }, [comparison?.notFoundInNew, notFoundSearch]);

  const totalNotFoundPages = Math.ceil(filteredNotFoundList.length / itemsPerPage) || 1;

  // Stat definitions for UI cards
  const coreStats = [
    { label: 'PAC', full: 'Pace', key: 'pace' },
    { label: 'SHO', full: 'Shooting', key: 'shooting' },
    { label: 'PAS', full: 'Passing', key: 'passing' },
    { label: 'DRI', full: 'Dribbling', key: 'dribbling' },
    { label: 'DEF', full: 'Defending', key: 'defending' },
    { label: 'PHY', full: 'Physical', key: 'physical' },
    { label: 'ACC', full: 'Acceleration', key: 'acceleration' },
    { label: 'BC', full: 'Ball Control', key: 'ball_control' },
    { label: 'TP', full: 'Tight Possession', key: 'tight_possession' },
    { label: 'LP', full: 'Lofted Pass', key: 'lofted_pass' },
    { label: 'HEA', full: 'Heading', key: 'heading' },
    { label: 'KP', full: 'Kicking Power', key: 'kicking_power' },
    { label: 'JUM', full: 'Jumping', key: 'jumping' },
    { label: 'STA', full: 'Stamina', key: 'stamina' },
    { label: 'TAC', full: 'Tackling', key: 'tackling' },
    { label: 'AGG', full: 'Aggression', key: 'aggression' },
    { label: 'BAL', full: 'Balance', key: 'balance' },
    { label: 'ENG', full: 'Engagement', key: 'defensive_engagement' },
  ];

  const gkStats = [
    { label: 'GK Awr', full: 'GK Awareness', key: 'gk_awareness' },
    { label: 'Catch', full: 'GK Catching', key: 'gk_catching' },
    { label: 'Parry', full: 'GK Parrying', key: 'gk_parrying' },
    { label: 'Reflex', full: 'GK Reflexes', key: 'gk_reflexes' },
    { label: 'Reach', full: 'GK Reach', key: 'gk_reach' },
  ];

  // Reusable responsive pagination component
  const renderPagination = (
    currentPage: number,
    totalPages: number,
    totalItems: number,
    setPage: (p: number | ((prev: number) => number)) => void
  ) => {
    if (totalItems <= itemsPerPage) return null;
    const start = (currentPage - 1) * itemsPerPage + 1;
    const end = Math.min(currentPage * itemsPerPage, totalItems);

    return (
      <div className="mt-6 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-gray-200/80 pt-4">
        <div className="text-xs sm:text-sm text-gray-500 font-medium text-center sm:text-left">
          Showing <span className="font-semibold text-gray-800">{start}</span> to{' '}
          <span className="font-semibold text-gray-800">{end}</span> of{' '}
          <span className="font-semibold text-gray-800">{totalItems}</span> players
        </div>
        <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap justify-center">
          <button
            onClick={() => setPage(1)}
            disabled={currentPage === 1}
            className="p-1.5 sm:px-2.5 sm:py-1 text-xs font-semibold rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
            title="First Page"
          >
            <ChevronsLeft className="w-4 h-4 inline" />
            <span className="hidden sm:inline ml-1">First</span>
          </button>
          <button
            onClick={() => setPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="p-1.5 sm:px-2.5 sm:py-1 text-xs font-semibold rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
            title="Previous Page"
          >
            <ChevronLeft className="w-4 h-4 inline" />
            <span className="hidden sm:inline ml-1">Prev</span>
          </button>
          <span className="px-3 py-1 bg-orange-50 text-orange-700 border border-orange-200 rounded-lg text-xs font-bold shadow-2xs">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
            disabled={currentPage >= totalPages}
            className="p-1.5 sm:px-2.5 sm:py-1 text-xs font-semibold rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
            title="Next Page"
          >
            <span className="hidden sm:inline mr-1">Next</span>
            <ChevronRight className="w-4 h-4 inline" />
          </button>
          <button
            onClick={() => setPage(totalPages)}
            disabled={currentPage >= totalPages}
            className="p-1.5 sm:px-2.5 sm:py-1 text-xs font-semibold rounded-lg bg-white border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all shadow-2xs"
            title="Last Page"
          >
            <span className="hidden sm:inline mr-1">Last</span>
            <ChevronsRight className="w-4 h-4 inline" />
          </button>
        </div>
      </div>
    );
  };

  if (authLoading || loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="glass rounded-2xl p-8 max-w-sm w-full text-center shadow-lg border border-gray-200/80">
          <div className="w-12 h-12 border-3 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <h3 className="mt-4 font-bold text-gray-900 text-lg">Comparing Database Stats...</h3>
          <p className="mt-1 text-xs text-gray-500">Checking active players against temporary scraped data</p>
        </div>
      </div>
    )
  }

  if (user.role !== 'committee_admin' || !comparison) {
    return null
  }

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="min-h-screen bg-gradient-to-b from-gray-50 via-slate-50 to-gray-100/80">
      <div className="container mx-auto px-3 sm:px-6 lg:px-8 pt-4 lg:pt-20 pb-12 max-w-7xl">
        
        {/* Header Card */}
        <div className="glass rounded-2xl sm:rounded-3xl p-4 sm:p-6 mb-5 sm:mb-8 shadow-xs border border-gray-200/80 bg-white/95">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start sm:items-center gap-3">
              <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-500 text-white flex items-center justify-center shadow-md shadow-orange-500/20 shrink-0">
                <BarChart2 className="w-5 h-5 sm:w-6 sm:h-6" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-gray-900 tracking-tight">
                    Stats Update Preview
                  </h1>
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1 shrink-0">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Sync Ready
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-gray-600 mt-0.5 line-clamp-2 sm:line-clamp-none">
                  Audit and review player stat updates and club transfers before committing changes to active database
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <button
                onClick={loadComparison}
                disabled={loading}
                className="px-3.5 py-2 text-xs sm:text-sm font-semibold rounded-xl border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer disabled:opacity-50"
                title="Reload comparison from database"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                <span className="hidden xs:inline">Reload</span>
              </button>
              <Link
                href="/dashboard/committee/database"
                className="px-4 py-2 text-xs sm:text-sm font-semibold rounded-xl bg-gray-900 hover:bg-gray-800 text-white transition-all flex items-center gap-1.5 shadow-xs"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </Link>
            </div>
          </div>
        </div>

        {/* Interactive Summary Metrics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3.5 mb-5 sm:mb-8">
          {/* Total Existing */}
          <div className="glass rounded-2xl p-3 sm:p-4 text-center border border-blue-100 bg-white/90 shadow-2xs">
            <div className="text-xl sm:text-2xl lg:text-3xl font-black text-blue-600 tracking-tight">
              {comparison.summary.totalExisting.toLocaleString()}
            </div>
            <div className="text-[11px] sm:text-xs text-gray-500 font-medium mt-0.5">Active DB Players</div>
          </div>

          {/* Total Scraped */}
          <div className="glass rounded-2xl p-3 sm:p-4 text-center border border-purple-100 bg-white/90 shadow-2xs">
            <div className="text-xl sm:text-2xl lg:text-3xl font-black text-purple-600 tracking-tight">
              {comparison.summary.totalNew.toLocaleString()}
            </div>
            <div className="text-[11px] sm:text-xs text-gray-500 font-medium mt-0.5">In Temp DB</div>
          </div>

          {/* Will Update (Clickable tab) */}
          <button
            onClick={() => setActiveTab('update')}
            className={`glass rounded-2xl p-3 sm:p-4 text-center transition-all cursor-pointer ${
              activeTab === 'update'
                ? 'ring-2 ring-orange-500 bg-orange-50/95 border-orange-300 shadow-md scale-[1.02]'
                : 'bg-white/90 hover:bg-orange-50/40 border-gray-200/80 hover:border-orange-200 shadow-2xs'
            }`}
          >
            <div className="text-xl sm:text-2xl lg:text-3xl font-black text-orange-600 tracking-tight">
              {comparison.summary.willUpdate.toLocaleString()}
            </div>
            <div className="text-[11px] sm:text-xs font-bold text-orange-800 mt-0.5 flex items-center justify-center gap-1">
              <RefreshCw className="w-3 h-3 shrink-0" />
              <span>Will Update ✓</span>
            </div>
          </button>

          {/* Not in Active DB (Clickable tab) */}
          <button
            onClick={() => setActiveTab('create')}
            className={`glass rounded-2xl p-3 sm:p-4 text-center transition-all cursor-pointer ${
              activeTab === 'create'
                ? 'ring-2 ring-slate-500 bg-slate-100 border-slate-300 shadow-md scale-[1.02]'
                : 'bg-white/90 hover:bg-slate-50 border-gray-200/80 hover:border-slate-300 shadow-2xs'
            }`}
          >
            <div className="text-xl sm:text-2xl lg:text-3xl font-black text-slate-500 tracking-tight">
              {comparison.summary.willCreate.toLocaleString()}
            </div>
            <div className="text-[11px] sm:text-xs font-bold text-slate-600 mt-0.5 flex items-center justify-center gap-1">
              <Lock className="w-3 h-3 shrink-0" />
              <span>Not In Active DB</span>
            </div>
          </button>

          {/* Unchanged (Clickable tab) */}
          <button
            onClick={() => setActiveTab('unchanged')}
            className={`glass rounded-2xl p-3 sm:p-4 text-center transition-all cursor-pointer ${
              activeTab === 'unchanged'
                ? 'ring-2 ring-emerald-500 bg-emerald-50/95 border-emerald-300 shadow-md scale-[1.02]'
                : 'bg-white/90 hover:bg-emerald-50/30 border-gray-200/80 hover:border-emerald-200 shadow-2xs'
            }`}
          >
            <div className="text-xl sm:text-2xl lg:text-3xl font-black text-emerald-600 tracking-tight">
              {comparison.summary.unchanged.toLocaleString()}
            </div>
            <div className="text-[11px] sm:text-xs font-bold text-emerald-800 mt-0.5 flex items-center justify-center gap-1">
              <CheckCircle className="w-3 h-3 shrink-0" />
              <span>Unchanged</span>
            </div>
          </button>

          {/* Not in Temp DB (Clickable tab) */}
          <button
            onClick={() => setActiveTab('notfound')}
            className={`glass rounded-2xl p-3 sm:p-4 text-center transition-all cursor-pointer ${
              activeTab === 'notfound'
                ? 'ring-2 ring-rose-500 bg-rose-50/95 border-rose-300 shadow-md scale-[1.02]'
                : 'bg-white/90 hover:bg-rose-50/30 border-gray-200/80 hover:border-rose-200 shadow-2xs'
            }`}
          >
            <div className="text-xl sm:text-2xl lg:text-3xl font-black text-rose-600 tracking-tight">
              {comparison.summary.notFound.toLocaleString()}
            </div>
            <div className="text-[11px] sm:text-xs font-bold text-rose-800 mt-0.5 flex items-center justify-center gap-1">
              <AlertTriangle className="w-3 h-3 shrink-0" />
              <span>Not in Upload</span>
            </div>
          </button>
        </div>

        {/* Main Content Card with Navigation Tabs */}
        <div className="glass rounded-2xl sm:rounded-3xl overflow-hidden shadow-sm border border-gray-200/80 mb-6 sm:mb-8 bg-white/95">
          {/* Scrollable Tabs Header Bar */}
          <div className="border-b border-gray-200/80 bg-gray-50/70 p-2 sm:p-3">
            <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-0.5">
              {/* Tab 1: Update */}
              <button
                onClick={() => setActiveTab('update')}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  activeTab === 'update'
                    ? 'bg-white text-orange-700 shadow-xs border border-orange-200 ring-1 ring-orange-500/20'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                }`}
              >
                <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-orange-600 shrink-0" />
                <span>Will Update</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  activeTab === 'update' ? 'bg-orange-100 text-orange-800' : 'bg-gray-200/70 text-gray-700'
                }`}>
                  {comparison.summary.willUpdate}
                </span>
              </button>

              {/* Tab 2: Create */}
              <button
                onClick={() => setActiveTab('create')}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  activeTab === 'create'
                    ? 'bg-white text-slate-800 shadow-xs border border-slate-300 ring-1 ring-slate-500/20'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                }`}
              >
                <Lock className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-500 shrink-0" />
                <span>Not In Active DB</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  activeTab === 'create' ? 'bg-slate-200 text-slate-800' : 'bg-gray-200/70 text-gray-700'
                }`}>
                  {comparison.summary.willCreate}
                </span>
              </button>

              {/* Tab 3: Unchanged */}
              <button
                onClick={() => setActiveTab('unchanged')}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  activeTab === 'unchanged'
                    ? 'bg-white text-emerald-800 shadow-xs border border-emerald-200 ring-1 ring-emerald-500/20'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600 shrink-0" />
                <span>Unchanged</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  activeTab === 'unchanged' ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-200/70 text-gray-700'
                }`}>
                  {comparison.summary.unchanged.toLocaleString()}
                </span>
              </button>

              {/* Tab 4: Not Found */}
              <button
                onClick={() => setActiveTab('notfound')}
                className={`flex items-center gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap transition-all cursor-pointer shrink-0 ${
                  activeTab === 'notfound'
                    ? 'bg-white text-rose-800 shadow-xs border border-rose-200 ring-1 ring-rose-500/20'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-rose-500 shrink-0" />
                <span>Not in Upload</span>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${
                  activeTab === 'notfound' ? 'bg-rose-100 text-rose-800' : 'bg-gray-200/70 text-gray-700'
                }`}>
                  {comparison.summary.notFound}
                </span>
              </button>
            </div>
          </div>

          <div className="p-3 sm:p-6">
            {/* TAB 1: WILL UPDATE */}
            {activeTab === 'update' && (
              <div>
                {/* Information banner */}
                <div className="mb-4 p-3.5 sm:p-4 bg-orange-50/80 rounded-xl border border-orange-200/80">
                  <p className="text-xs sm:text-sm text-orange-900 leading-relaxed">
                    <strong>These players will be UPDATED:</strong> Real Club, position, playing style, age, nationality, and stats will be updated from the temporary scraped database.
                    <span className="block mt-1 text-xs text-orange-800/90 font-medium">
                      🛡️ SS League team ownership, contract details, and sold status are <strong>strictly preserved</strong>.
                    </span>
                  </p>
                </div>

                {/* Search & Filter Toolbar */}
                <div className="mb-4 p-2.5 sm:p-3 bg-white rounded-xl border border-gray-200/80 shadow-2xs flex flex-col md:flex-row gap-2.5 sm:gap-3 items-stretch md:items-center justify-between">
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
                      placeholder="Search player name, club, or position..."
                      className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500"
                    />
                    {updateSearch && (
                      <button
                        onClick={() => { setUpdateSearch(''); setUpdatePage(1); }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-bold p-1 cursor-pointer"
                      >
                        &times;
                      </button>
                    )}
                  </div>

                  {/* Filter Pills & View Mode */}
                  <div className="flex items-center gap-2 flex-wrap justify-between md:justify-end">
                    {/* Category pills */}
                    <div className="flex items-center gap-1 sm:gap-1.5 flex-wrap">
                      <button
                        onClick={() => { setUpdateFilter('all'); setUpdatePage(1); }}
                        className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          updateFilter === 'all'
                            ? 'bg-orange-600 text-white shadow-2xs'
                            : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                        }`}
                      >
                        All ({comparison.toUpdate.length})
                      </button>
                      <button
                        onClick={() => { setUpdateFilter('club'); setUpdatePage(1); }}
                        className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          updateFilter === 'club'
                            ? 'bg-amber-600 text-white shadow-2xs'
                            : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                        }`}
                      >
                        Club Transfers ({clubCount})
                      </button>
                      <button
                        onClick={() => { setUpdateFilter('stat'); setUpdatePage(1); }}
                        className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          updateFilter === 'stat'
                            ? 'bg-emerald-600 text-white shadow-2xs'
                            : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100 border border-emerald-200'
                        }`}
                      >
                        Stats / OVR ({statCount})
                      </button>
                      <button
                        onClick={() => { setUpdateFilter('info'); setUpdatePage(1); }}
                        className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                          updateFilter === 'info'
                            ? 'bg-purple-600 text-white shadow-2xs'
                            : 'bg-purple-50 text-purple-800 hover:bg-purple-100 border border-purple-200'
                        }`}
                      >
                        Style / Age ({infoCount})
                      </button>
                    </div>

                    {/* View mode toggle */}
                    <div className="flex items-center bg-gray-100 p-0.5 rounded-lg border border-gray-200 shrink-0">
                      <button
                        onClick={() => setUpdateViewMode('cards')}
                        className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
                          updateViewMode === 'cards' ? 'bg-white text-gray-900 shadow-2xs font-bold' : 'text-gray-500 hover:text-gray-900'
                        }`}
                        title="Detailed Side-by-Side Cards View"
                      >
                        <LayoutGrid className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Cards</span>
                      </button>
                      <button
                        onClick={() => setUpdateViewMode('diffs')}
                        className={`p-1.5 rounded-md text-xs font-medium flex items-center gap-1 transition-all cursor-pointer ${
                          updateViewMode === 'diffs' ? 'bg-white text-gray-900 shadow-2xs font-bold' : 'text-gray-500 hover:text-gray-900'
                        }`}
                        title="Compact Changed Diffs Only"
                      >
                        <Table className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Compact</span>
                      </button>
                    </div>
                  </div>
                </div>

                {filteredUpdateList.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 bg-gray-50/50 rounded-2xl border border-dashed border-gray-300">
                    <p className="font-semibold text-sm text-gray-700">No players match the current search / filter</p>
                    <button
                      onClick={() => { setUpdateSearch(''); setUpdateFilter('all'); }}
                      className="mt-2 text-xs text-orange-600 hover:underline font-bold cursor-pointer"
                    >
                      Clear search and filter
                    </button>
                  </div>
                ) : (
                  <>
                    {/* VIEW MODE 1: COMPACT DIFFS LIST */}
                    {updateViewMode === 'diffs' ? (
                      <div className="space-y-2.5 max-h-[700px] overflow-y-auto pr-1">
                        {filteredUpdateList
                          .slice((updatePage - 1) * itemsPerPage, updatePage * itemsPerPage)
                          .map((player: any, idx: any) => (
                          <div
                            key={player.player_id || idx}
                            className="glass rounded-xl p-3 sm:p-4 border border-orange-200/90 bg-white hover:shadow-xs transition-all flex flex-col md:flex-row md:items-center justify-between gap-2.5"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-7 h-7 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center font-bold text-xs shrink-0">
                                {player.new.position || player.old.position}
                              </span>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-bold text-sm text-gray-900 truncate">{player.name}</span>
                                  <span className="text-[10px] text-gray-400 font-mono">ID: {player.player_id}</span>
                                  <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    OVR: {player.new.overall_rating}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-100 text-gray-600 border border-gray-200">
                                    SS Team: {player.old.team_name || 'Free Agent'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Diffs flow */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {player.changes && player.changes.length > 0 ? (
                                player.changes.map((ch: any, cIdx: number) => (
                                  <span
                                    key={cIdx}
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border bg-amber-50/80 text-amber-900 border-amber-200 shadow-2xs"
                                  >
                                    <span className="font-bold opacity-75">{ch.label}:</span>
                                    <span className="line-through text-red-600 font-normal">{String(ch.old)}</span>
                                    <span className="text-gray-400 font-bold">&rarr;</span>
                                    <span className="text-emerald-700 font-bold">{String(ch.new)}</span>
                                    {ch.diff !== undefined && (
                                      <span className={`text-[9px] px-1 rounded font-black ${
                                        ch.diff > 0 ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                                      }`}>
                                        {ch.diff > 0 ? `+${ch.diff}` : ch.diff}
                                      </span>
                                    )}
                                  </span>
                                ))
                              ) : (
                                <span className="text-xs text-gray-400">No attribute changes detected</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      /* VIEW MODE 2: DETAILED SIDE-BY-SIDE CARDS */
                      <div className="space-y-4 max-h-[700px] overflow-y-auto pr-1">
                        {filteredUpdateList
                          .slice((updatePage - 1) * itemsPerPage, updatePage * itemsPerPage)
                          .map((player: any, idx: any) => {
                            const isGk = player.old.position === 'GK' || player.new.position === 'GK' || (player.old.gk_reflexes && player.old.gk_reflexes > 40) || (player.new.gk_reflexes && player.new.gk_reflexes > 40);

                            return (
                              <div
                                key={player.player_id || idx}
                                className="glass rounded-2xl p-3.5 sm:p-5 border border-orange-200/90 bg-white shadow-2xs hover:shadow-md transition-all"
                              >
                                {/* Card Header */}
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 mb-3 pb-2.5 border-b border-gray-100">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-8 h-8 rounded-lg bg-orange-100 text-orange-600 flex items-center justify-center shrink-0">
                                      <RefreshCw className="w-4 h-4" />
                                    </div>
                                    <div className="min-w-0">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        <h3 className="font-bold text-base sm:text-lg text-gray-900 truncate">{player.name}</h3>
                                        <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">
                                          ID: {player.player_id}
                                        </span>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Badges row */}
                                  <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap text-xs">
                                    {/* Position Badge */}
                                    <span className="px-2.5 py-1 rounded-lg font-bold bg-blue-50 text-blue-800 border border-blue-200 flex items-center gap-1">
                                      <span>{player.old.position}</span>
                                      {player.old.position !== player.new.position && (
                                        <span className="text-emerald-700 font-extrabold flex items-center gap-0.5">
                                          <ArrowRight className="w-3 h-3" /> {player.new.position}
                                        </span>
                                      )}
                                    </span>

                                    {/* OVR Badge */}
                                    <span className={`px-2.5 py-1 rounded-lg font-bold flex items-center gap-1 ${
                                      player.old.overall_rating !== player.new.overall_rating
                                        ? 'bg-amber-50 text-amber-900 border border-amber-300'
                                        : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    }`}>
                                      <span>OVR: {player.old.overall_rating}</span>
                                      {player.old.overall_rating !== player.new.overall_rating && (
                                        <span className="text-emerald-700 font-black flex items-center gap-0.5">
                                          <ArrowRight className="w-3 h-3" /> {player.new.overall_rating}
                                          <span className="text-[10px] ml-0.5">
                                            ({player.new.overall_rating - player.old.overall_rating > 0 ? '+' : ''}{player.new.overall_rating - player.old.overall_rating})
                                          </span>
                                        </span>
                                      )}
                                    </span>

                                    {/* SS League Team Tag (Preserved) */}
                                    <span className="px-2.5 py-1 rounded-lg text-xs bg-gray-100 text-gray-700 border border-gray-200 flex items-center gap-1">
                                      <span className="text-gray-400">SS Team:</span>
                                      <strong className="text-gray-900 max-w-[120px] truncate">{player.old.team_name || 'Free Agent'}</strong>
                                      <span className="text-[10px] text-gray-400 font-normal shrink-0">(Preserved)</span>
                                    </span>

                                    {/* Changes Count Chip */}
                                    {player.changes && player.changes.length > 0 && (
                                      <span className="px-2.5 py-1 rounded-lg text-xs font-bold bg-orange-100 text-orange-800 border border-orange-200 shrink-0">
                                        ⚡ {player.changes.length} change{player.changes.length > 1 ? 's' : ''}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Changed Attributes Banner (Clear, Instant Visibility) */}
                                {player.changes && player.changes.length > 0 ? (
                                  <div className="mb-3.5 p-2.5 sm:p-3 bg-gradient-to-r from-orange-50/90 via-amber-50/70 to-orange-50/90 rounded-xl border border-orange-200/90 shadow-2xs">
                                    <div className="text-[11px] font-bold uppercase tracking-wider text-orange-900 mb-2 flex items-center gap-1.5">
                                      <Sparkles className="w-3.5 h-3.5 text-orange-600" />
                                      <span>Attributes Getting Updated:</span>
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
                                          <span
                                            key={cIdx}
                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border shadow-2xs ${badgeStyle}`}
                                          >
                                            <span className="font-bold opacity-75">{ch.label}:</span>
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
                                ) : null}

                                {/* Side-by-side comparison cards */}
                                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">
                                  {/* OLD VALUES CARD */}
                                  <div className="bg-red-50/50 rounded-xl p-3 sm:p-4 border border-red-200/80 shadow-2xs">
                                    <div className="text-xs font-bold text-red-800 mb-2.5 flex items-center justify-between pb-2 border-b border-red-200/70">
                                      <span className="flex items-center gap-1.5">
                                        <XCircle className="w-4 h-4 text-rose-500" />
                                        <span>Current Database</span>
                                      </span>
                                      <span className="text-[10px] font-semibold text-red-600 bg-red-100/80 px-2 py-0.5 rounded-full">
                                        Active
                                      </span>
                                    </div>

                                    {/* Meta Fields Grid */}
                                    <div className="grid grid-cols-2 gap-2 text-xs mb-3 pb-2.5 border-b border-red-200/60">
                                      <div className="flex justify-between items-center gap-1 min-w-0">
                                        <span className="text-gray-500 font-medium shrink-0">Club:</span>
                                        <span
                                          className={`truncate text-right ${player.old.club !== player.new.club ? "text-red-600 line-through font-semibold" : "text-gray-800 font-medium"}`}
                                          title={player.old.club}
                                        >
                                          {player.old.club || 'Free Agents'}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center gap-1 min-w-0">
                                        <span className="text-gray-500 font-medium shrink-0">Style:</span>
                                        <span
                                          className={`truncate text-right ${player.old.playing_style !== player.new.playing_style ? "text-red-600 line-through font-semibold" : "text-gray-800 font-medium"}`}
                                          title={player.old.playing_style}
                                        >
                                          {player.old.playing_style || 'None'}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center gap-1 min-w-0">
                                        <span className="text-gray-500 font-medium shrink-0">Age:</span>
                                        <span className={player.old.age !== player.new.age ? "text-red-600 line-through font-semibold" : "text-gray-800 font-medium"}>
                                          {player.old.age || '-'}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center gap-1 min-w-0">
                                        <span className="text-gray-500 font-medium shrink-0">Nationality:</span>
                                        <span
                                          className={`truncate text-right ${player.old.nationality !== player.new.nationality ? "text-red-600 line-through font-semibold" : "text-gray-800 font-medium"}`}
                                          title={player.old.nationality}
                                        >
                                          {player.old.nationality || '-'}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Core Stats Grid */}
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-4 xl:grid-cols-6 gap-1.5 text-xs">
                                      {coreStats.map(st => {
                                        const changed = player.old[st.key] !== player.new[st.key];
                                        const val = player.old[st.key];
                                        return (
                                          <div
                                            key={st.key}
                                            className={`flex items-center justify-between px-1.5 py-1 rounded-md transition-all ${
                                              changed
                                                ? 'bg-rose-100/90 text-rose-900 border border-rose-300'
                                                : 'bg-white/80 text-gray-700 border border-gray-100'
                                            }`}
                                            title={`${st.full}: ${val}`}
                                          >
                                            <span className="text-[10px] sm:text-[11px] font-semibold text-gray-500 uppercase">{st.label}</span>
                                            <span className={`text-xs ${changed ? 'line-through text-rose-700 font-bold' : 'font-bold text-gray-700'}`}>
                                              {val || '-'}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>

                                    {/* Goalkeeper Stats */}
                                    {isGk && (
                                      <div className="mt-2.5 pt-2 border-t border-red-200/60">
                                        <div className="text-[11px] font-bold text-gray-500 mb-1.5">Goalkeeper Attributes:</div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-3 xl:grid-cols-5 gap-1.5 text-xs">
                                          {gkStats.map(st => {
                                            const changed = player.old[st.key] !== player.new[st.key];
                                            const val = player.old[st.key];
                                            return (
                                              <div
                                                key={st.key}
                                                className={`flex items-center justify-between px-1.5 py-1 rounded-md transition-all ${
                                                  changed
                                                    ? 'bg-rose-100/90 text-rose-900 border border-rose-300'
                                                    : 'bg-white/80 text-gray-700 border border-gray-100'
                                                }`}
                                                title={`${st.full}: ${val}`}
                                              >
                                                <span className="text-[10px] sm:text-[11px] font-semibold text-gray-500 uppercase">{st.label}</span>
                                                <span className={`text-xs ${changed ? 'line-through text-rose-700 font-bold' : 'font-bold text-gray-700'}`}>
                                                  {val || '-'}
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>

                                  {/* NEW VALUES CARD */}
                                  <div className="bg-emerald-50/50 rounded-xl p-3 sm:p-4 border border-emerald-200/80 shadow-2xs">
                                    <div className="text-xs font-bold text-emerald-800 mb-2.5 flex items-center justify-between pb-2 border-b border-emerald-200/70">
                                      <span className="flex items-center gap-1.5">
                                        <CheckCircle className="w-4 h-4 text-emerald-600" />
                                        <span>Scraped Update</span>
                                      </span>
                                      <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                                        New Version
                                      </span>
                                    </div>

                                    {/* Meta Fields Grid */}
                                    <div className="grid grid-cols-2 gap-2 text-xs mb-3 pb-2.5 border-b border-emerald-200/60">
                                      <div className="flex justify-between items-center gap-1 min-w-0">
                                        <span className="text-gray-500 font-medium shrink-0">Club:</span>
                                        <span
                                          className={`truncate text-right ${player.old.club !== player.new.club ? "text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300" : "text-gray-800 font-medium"}`}
                                          title={player.new.club}
                                        >
                                          {player.new.club || 'Free Agents'}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center gap-1 min-w-0">
                                        <span className="text-gray-500 font-medium shrink-0">Style:</span>
                                        <span
                                          className={`truncate text-right ${player.old.playing_style !== player.new.playing_style ? "text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300" : "text-gray-800 font-medium"}`}
                                          title={player.new.playing_style}
                                        >
                                          {player.new.playing_style || 'None'}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center gap-1 min-w-0">
                                        <span className="text-gray-500 font-medium shrink-0">Age:</span>
                                        <span className={player.old.age !== player.new.age ? "text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300" : "text-gray-800 font-medium"}>
                                          {player.new.age || '-'}
                                        </span>
                                      </div>
                                      <div className="flex justify-between items-center gap-1 min-w-0">
                                        <span className="text-gray-500 font-medium shrink-0">Nationality:</span>
                                        <span
                                          className={`truncate text-right ${player.old.nationality !== player.new.nationality ? "text-emerald-800 font-bold bg-emerald-100 px-1.5 py-0.5 rounded border border-emerald-300" : "text-gray-800 font-medium"}`}
                                          title={player.new.nationality}
                                        >
                                          {player.new.nationality || '-'}
                                        </span>
                                      </div>
                                    </div>

                                    {/* Core Stats Grid */}
                                    <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-4 xl:grid-cols-6 gap-1.5 text-xs">
                                      {coreStats.map(st => {
                                        const changed = player.old[st.key] !== player.new[st.key];
                                        const oldVal = Number(player.old[st.key]) || 0;
                                        const newVal = Number(player.new[st.key]) || 0;
                                        const diff = newVal - oldVal;

                                        return (
                                          <div
                                            key={st.key}
                                            className={`flex items-center justify-between px-1.5 py-1 rounded-md transition-all ${
                                              changed
                                                ? 'bg-emerald-100/90 text-emerald-950 font-black border border-emerald-300 ring-1 ring-emerald-400/20'
                                                : 'bg-white/80 text-gray-700 border border-gray-100'
                                            }`}
                                            title={`${st.full}: ${newVal}`}
                                          >
                                            <span className="text-[10px] sm:text-[11px] font-semibold text-gray-500 uppercase">{st.label}</span>
                                            <span className="text-xs font-bold flex items-center gap-0.5">
                                              {newVal || '-'}
                                              {changed && diff !== 0 && (
                                                <span className={`text-[9px] font-black ${diff > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                  ({diff > 0 ? `+${diff}` : diff})
                                                </span>
                                              )}
                                            </span>
                                          </div>
                                        );
                                      })}
                                    </div>

                                    {/* Goalkeeper Stats */}
                                    {isGk && (
                                      <div className="mt-2.5 pt-2 border-t border-emerald-200/60">
                                        <div className="text-[11px] font-bold text-gray-500 mb-1.5">Goalkeeper Attributes:</div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 lg:grid-cols-3 xl:grid-cols-5 gap-1.5 text-xs">
                                          {gkStats.map(st => {
                                            const changed = player.old[st.key] !== player.new[st.key];
                                            const oldVal = Number(player.old[st.key]) || 0;
                                            const newVal = Number(player.new[st.key]) || 0;
                                            const diff = newVal - oldVal;

                                            return (
                                              <div
                                                key={st.key}
                                                className={`flex items-center justify-between px-1.5 py-1 rounded-md transition-all ${
                                                  changed
                                                    ? 'bg-emerald-100/90 text-emerald-950 font-black border border-emerald-300 ring-1 ring-emerald-400/20'
                                                    : 'bg-white/80 text-gray-700 border border-gray-100'
                                                }`}
                                                title={`${st.full}: ${newVal}`}
                                              >
                                                <span className="text-[10px] sm:text-[11px] font-semibold text-gray-500 uppercase">{st.label}</span>
                                                <span className="text-xs font-bold flex items-center gap-0.5">
                                                  {newVal || '-'}
                                                  {changed && diff !== 0 && (
                                                    <span className={`text-[9px] font-black ${diff > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                                                      ({diff > 0 ? `+${diff}` : diff})
                                                    </span>
                                                  )}
                                                </span>
                                              </div>
                                            );
                                          })}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    )}

                    {/* Pagination for Update */}
                    {renderPagination(updatePage, totalUpdatePages, filteredUpdateList.length, setUpdatePage)}
                  </>
                )}
              </div>
            )}

            {/* TAB 2: NOT IN ACTIVE DB (CREATE) */}
            {activeTab === 'create' && (
              <div>
                {/* Warning notice */}
                <div className="mb-4 p-3.5 sm:p-4 bg-emerald-50/80 rounded-xl border border-emerald-200">
                  <p className="text-xs sm:text-sm text-slate-800 leading-relaxed">
                    <strong>Notice:</strong> These new players were found during scraping but do not exist in the active registry.
                    <span className="block mt-2 font-bold text-rose-700 bg-rose-50/80 border border-rose-200 p-2.5 sm:p-3 rounded-xl text-xs sm:text-sm">
                      ⚠️ New player entries are <strong>not created from this screen</strong>. To import and add these new players, please use the separate{' '}
                      <Link href="/dashboard/committee/database/add-new" className="underline text-rose-800 hover:text-rose-900 font-extrabold">
                        Add New Players Page &rarr;
                      </Link>
                    </span>
                  </p>
                </div>
                
                {/* Toolbar for Create */}
                <div className="mb-4 p-2.5 sm:p-3 bg-white rounded-xl border border-gray-200/80 shadow-2xs flex flex-col md:flex-row gap-2.5 sm:gap-3 items-stretch md:items-center justify-between">
                  {/* Search input */}
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={createSearch}
                      onChange={(e) => {
                        setCreateSearch(e.target.value);
                        setCreatePage(1);
                      }}
                      placeholder="Search new players by name, club, or position..."
                      className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                    />
                    {createSearch && (
                      <button
                        onClick={() => { setCreateSearch(''); setCreatePage(1); }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-bold p-1 cursor-pointer"
                      >
                        &times;
                      </button>
                    )}
                  </div>

                  {/* Actions & Filters */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => { setShowOnlyDuplicates(false); setCreatePage(1); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        !showOnlyDuplicates
                          ? 'bg-green-600 text-white shadow-2xs'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Show All ({comparison.toCreate.length})
                    </button>
                    <button
                      onClick={() => { setShowOnlyDuplicates(true); setCreatePage(1); }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        showOnlyDuplicates
                          ? 'bg-orange-600 text-white shadow-2xs'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Only Duplicates ({comparison.toCreate.filter((p: any) => p.hasDuplicates).length})
                    </button>
                  </div>
                </div>

                {filteredCreateList.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 bg-gray-50/50 rounded-2xl border border-dashed border-gray-300">
                    <p className="font-semibold text-sm text-gray-700">No new players found matching criteria</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2.5 max-h-[650px] overflow-y-auto pr-1">
                      {filteredCreateList
                        .slice((createPage - 1) * itemsPerPage, createPage * itemsPerPage)
                        .map((player: any, idx: number) => {
                          const isExcluded = excludedPlayerIds.has(player.player_id);
                          const hasDuplicates = player.hasDuplicates;
                          
                          return (
                            <div 
                              key={player.player_id || idx} 
                              className={`glass rounded-xl p-3 sm:p-4 border transition-all ${
                                hasDuplicates 
                                  ? 'border-orange-300 bg-orange-50/20' 
                                  : 'border-green-200/80 bg-white'
                              } ${isExcluded ? 'opacity-50' : 'hover:shadow-xs'}`}
                            >
                              {/* Header */}
                              <div className="flex items-start gap-2.5 mb-2.5">
                                <input
                                  type="checkbox"
                                  checked={!isExcluded}
                                  onChange={() => togglePlayerExclusion(player.player_id)}
                                  className="mt-1 w-4 h-4 rounded border-gray-300 text-green-600 focus:ring-green-500 cursor-pointer"
                                  title={isExcluded ? "Click to include" : "Click to exclude"}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="font-bold text-sm sm:text-base text-gray-900 flex items-center gap-2 flex-wrap">
                                    <span className={hasDuplicates ? "text-orange-600" : "text-green-600"}>
                                      {hasDuplicates ? <AlertTriangle className="w-4 h-4 inline" /> : <Plus className="w-4 h-4 inline" />}
                                    </span>
                                    <span className="truncate">{player.name}</span>
                                    <span className="text-[11px] font-mono text-gray-400">ID: {player.player_id}</span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-800">
                                      {player.position}
                                    </span>
                                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">
                                      OVR: {player.overall_rating}
                                    </span>
                                    {hasDuplicates && (
                                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-100 text-orange-800 border border-orange-300">
                                        Duplicate Found
                                      </span>
                                    )}
                                  </div>
                                  
                                  {/* Duplicate warning box */}
                                  {hasDuplicates && player.duplicates && player.duplicates.length > 0 && (
                                    <div className="mt-2 p-2.5 bg-orange-100/80 rounded-lg border border-orange-200 text-xs text-orange-900">
                                      <div className="font-bold mb-1">
                                        Potential match in database ({player.duplicates.length}):
                                      </div>
                                      <div className="space-y-1">
                                        {player.duplicates.map((dup: any, dupIdx: number) => (
                                          <div key={dupIdx} className="flex flex-wrap items-center gap-1.5 font-medium">
                                            <span>ID: {dup.player_id}</span>
                                            <span>•</span>
                                            <span>{dup.name}</span>
                                            <span>•</span>
                                            <span>{dup.position}</span>
                                            <span>•</span>
                                            <span>OVR: {dup.overall_rating}</span>
                                            <span>•</span>
                                            <span>{dup.club || dup.team_name || 'No team'}</span>
                                            {dup.is_sold && <span className="text-emerald-700 font-bold">• Sold</span>}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </div>
                              
                              {/* Player stats grid */}
                              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 text-xs pt-2 border-t border-gray-100">
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Club:</span>
                                  <span className="font-semibold text-gray-800 truncate ml-1">{player.club || player.team_name || 'Free Agents'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Style:</span>
                                  <span className="font-semibold text-gray-800 truncate ml-1">{player.playing_style || 'None'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Pace:</span>
                                  <span className="font-semibold text-gray-800">{player.pace || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Shooting:</span>
                                  <span className="font-semibold text-gray-800">{player.shooting || '-'}</span>
                                </div>
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Passing:</span>
                                  <span className="font-semibold text-gray-800">{player.passing || '-'}</span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                    </div>

                    {/* Pagination for Create */}
                    {renderPagination(createPage, totalCreatePages, filteredCreateList.length, setCreatePage)}
                  </>
                )}
              </div>
            )}

            {/* TAB 3: UNCHANGED */}
            {activeTab === 'unchanged' && (
              <div>
                <div className="mb-4 p-3.5 sm:p-4 bg-emerald-50/80 rounded-xl border border-emerald-200">
                  <p className="text-xs sm:text-sm text-emerald-900 leading-relaxed font-medium">
                    <strong>These players are already up-to-date:</strong> All attributes in the active database match the scraped temporary database. No update needed.
                  </p>
                </div>

                {/* Search bar for unchanged */}
                <div className="mb-4 relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={unchangedSearch}
                    onChange={(e) => {
                      setUnchangedSearch(e.target.value);
                      setUnchangedPage(1);
                    }}
                    placeholder="Search up-to-date players by name, club, or position..."
                    className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                  {unchangedSearch && (
                    <button
                      onClick={() => { setUnchangedSearch(''); setUnchangedPage(1); }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-bold p-1 cursor-pointer"
                    >
                      &times;
                    </button>
                  )}
                </div>

                {filteredUnchangedList.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 bg-gray-50/50 rounded-2xl border border-dashed border-gray-300">
                    <p className="font-semibold text-sm text-gray-700">No unchanged players match search</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
                      {filteredUnchangedList
                        .slice((unchangedPage - 1) * itemsPerPage, unchangedPage * itemsPerPage)
                        .map((player: any, idx: any) => (
                        <div
                          key={player.player_id || idx}
                          className="glass rounded-xl p-3 sm:p-3.5 border border-gray-200/80 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:shadow-2xs transition-all"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-sm sm:text-base text-gray-900 flex items-center gap-2 flex-wrap">
                              <span className="truncate">{player.name}</span>
                              <span className="text-[10px] font-mono text-gray-400">ID: {player.player_id}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-800">
                                {player.position}
                              </span>
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800">
                                OVR: {player.overall_rating}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                              <span>Club: <strong className="text-gray-700">{player.club || 'Free Agents'}</strong></span>
                              <span>•</span>
                              <span>SS Team: <strong className="text-gray-700">{player.team_name || 'Free Agent'}</strong></span>
                            </div>
                          </div>
                          <div className="self-end sm:self-center shrink-0">
                            <span className="text-xs text-emerald-700 font-bold bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full flex items-center gap-1">
                              <CheckCircle className="w-3.5 h-3.5" />
                              <span>Up to date</span>
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pagination for Unchanged */}
                    {renderPagination(unchangedPage, totalUnchangedPages, filteredUnchangedList.length, setUnchangedPage)}
                  </>
                )}
              </div>
            )}

            {/* TAB 4: NOT IN UPLOAD */}
            {activeTab === 'notfound' && (
              <div>
                <div className="mb-4 p-3.5 sm:p-4 bg-rose-50/80 rounded-xl border border-rose-200">
                  <p className="text-xs sm:text-sm text-rose-900 leading-relaxed font-medium">
                    <strong>These active players are NOT in the temporary upload:</strong> They exist in the active database and will remain safely untouched.
                  </p>
                </div>

                {/* Search bar for not found */}
                <div className="mb-4 relative">
                  <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={notFoundSearch}
                    onChange={(e) => {
                      setNotFoundSearch(e.target.value);
                      setNotFoundPage(1);
                    }}
                    placeholder="Search missing players by name, club, or position..."
                    className="w-full pl-9 pr-8 py-2 text-xs sm:text-sm bg-gray-50 border border-gray-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  />
                  {notFoundSearch && (
                    <button
                      onClick={() => { setNotFoundSearch(''); setNotFoundPage(1); }}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-gray-400 hover:text-gray-600 font-bold p-1 cursor-pointer"
                    >
                      &times;
                    </button>
                  )}
                </div>

                {filteredNotFoundList.length === 0 ? (
                  <div className="text-center py-12 text-gray-500 bg-gray-50/50 rounded-2xl border border-dashed border-gray-300">
                    <p className="font-semibold text-sm text-gray-700">All existing players are accounted for in the upload</p>
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 max-h-[650px] overflow-y-auto pr-1">
                      {filteredNotFoundList
                        .slice((notFoundPage - 1) * itemsPerPage, notFoundPage * itemsPerPage)
                        .map((player: any, idx: any) => (
                        <div
                          key={player.player_id || idx}
                          className="glass rounded-xl p-3 sm:p-3.5 border border-rose-200/80 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:shadow-2xs transition-all"
                        >
                          <div className="min-w-0">
                            <div className="font-bold text-sm sm:text-base text-gray-900 flex items-center gap-2 flex-wrap">
                              <span className="truncate">{player.name}</span>
                              <span className="text-[10px] font-mono text-gray-400">ID: {player.player_id}</span>
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-blue-100 text-blue-800">
                                {player.position}
                              </span>
                              <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-rose-100 text-rose-800">
                                OVR: {player.overall_rating}
                              </span>
                              {player.is_sold && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-green-100 text-green-800">
                                  Sold
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-500 mt-1 flex items-center gap-2 flex-wrap">
                              <span>Club: <strong className="text-gray-700">{player.club || 'Free Agents'}</strong></span>
                              <span>•</span>
                              <span>SS Team: <strong className="text-gray-700">{player.team_name || 'Free Agent'}</strong></span>
                            </div>
                          </div>
                          <div className="self-end sm:self-center shrink-0">
                            <span className="text-xs text-rose-700 font-bold bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full">
                              Untouched
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Pagination for Not Found */}
                    {renderPagination(notFoundPage, totalNotFoundPages, filteredNotFoundList.length, setNotFoundPage)}
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Action Footer Card */}
        <div className="glass rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-md border border-orange-200/80 bg-white/95">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-5 h-5 text-emerald-600 shrink-0" />
                <h3 className="text-base sm:text-lg font-bold text-gray-900">Ready to Apply Updates?</h3>
              </div>
              <p className="text-xs sm:text-sm text-gray-600 max-w-2xl leading-relaxed">
                This will sync <strong>{comparison.summary.willUpdate}</strong> existing players' real clubs, styles, ages, and stats into the active database.
                <span className="block text-[11px] sm:text-xs text-gray-500 mt-1">
                  🛡️ SS League team ownership, contract details, and sold status are <strong>strictly preserved</strong>.
                  The {comparison.summary.willCreate} new players in "Not In Active DB" are not created here — import them via the Add New Players portal.
                </span>
              </p>
            </div>
            <button
              onClick={handleConfirmUpdate}
              disabled={importing || comparison.summary.willUpdate === 0}
              className="px-6 py-3.5 bg-gradient-to-r from-orange-500 via-orange-600 to-amber-600 hover:from-orange-600 hover:to-amber-700 text-white font-bold text-sm sm:text-base rounded-xl transition-all shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0 cursor-pointer"
            >
              {importing ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Updating Database...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Confirm & Update ({comparison.summary.willUpdate})</span>
                </>
              )}
            </button>
          </div>
          {importStatus && (
            <div className={`mt-4 p-3.5 rounded-xl border text-sm font-medium ${
              importStatus.startsWith('Error')
                ? 'bg-rose-50 text-rose-800 border-rose-200'
                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
            }`}>
              {importStatus}
            </div>
          )}
        </div>

      </div>
    </div>
    </AuthGuard>
  )
}
