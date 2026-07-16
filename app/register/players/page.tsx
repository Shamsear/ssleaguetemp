'use client'

import { Suspense, useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { db } from '@/lib/firebase/config'
import { collection, doc, getDoc, getDocs, Timestamp, onSnapshot, query as firestoreQuery, where } from 'firebase/firestore'
import * as XLSX from 'xlsx'

interface Season {
  id: string
  name: string
  is_player_registration_open: boolean
}

interface RegisteredPlayer {
  id: string
  player_id: string
  player_name: string
  registration_date: Timestamp
  additional_info?: string
  used_smart_assist?: string | null
}

interface RegistrationStats {
  total_registrations: number;
  is_registration_open: boolean;
}

interface MasterPlayer {
  id: string
  player_id: string
  name: string
}

function PlayersRegistrationPageContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const seasonId = searchParams.get('season')

  const parseNeonTimestampUTC = (s: string): number => {
    try {
      const date = new Date(s)
      if (isNaN(date.getTime())) return Date.now()
      return date.getTime() + (4 * 60 * 60 * 1000)
    } catch {
      return Date.now()
    }
  }

  const formatDateIST = (timestamp: Timestamp) => {
    return timestamp.toDate().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  const [season, setSeason] = useState<Season | null>(null)
  const [registeredPlayers, setRegisteredPlayers] = useState<RegisteredPlayer[]>([])
  const [masterPlayers, setMasterPlayers] = useState<MasterPlayer[]>([])
  const [filteredPlayers, setFilteredPlayers] = useState<MasterPlayer[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedPlayers, setSelectedPlayers] = useState<MasterPlayer[]>([])
  const [showDropdown, setShowDropdown] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [stats, setStats] = useState<RegistrationStats | null>(null)
  const [playerSearchQuery, setPlayerSearchQuery] = useState<string>('')
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([])
  const [actioningPlayer, setActioningPlayer] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'manage' | 'register' | 'registration'>('manage')
  const [totalMasterPlayers, setTotalMasterPlayers] = useState<number>(0)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [isTogglingRegistration, setIsTogglingRegistration] = useState(false)

  const fetchData = async () => {
    if (!seasonId) {
      setError('No season specified')
      return
    }

    try {
      const [seasonDoc, statsResponse, masterPlayersSnapshot, playersResponse] = await Promise.all([
        getDoc(doc(db, 'seasons', seasonId)),
        fetch(`/api/admin/registration-phases?season_id=${seasonId}`, { cache: 'no-store' }),
        getDocs(collection(db, 'realplayers')),
        fetch(`/api/stats/players?seasonId=${seasonId}&limit=1000`, { cache: 'no-store' })
      ])

      if (!seasonDoc.exists()) {
        setError('Season not found')
        setLoading(false)
        return
      }

      const seasonData = { id: seasonDoc.id, ...seasonDoc.data() } as Season
      setSeason(seasonData)

      const statsResult = await statsResponse.json()
      if (statsResult.success) {
        setStats(statsResult.data)
      }

      const masterPlayersData = masterPlayersSnapshot.docs.map(doc => ({
        id: doc.id,
        player_id: doc.data().player_id,
        name: doc.data().name
      })) as MasterPlayer[]
      setMasterPlayers(masterPlayersData)
      setTotalMasterPlayers(masterPlayersData.length)

      const playersResult = await playersResponse.json()
      const playersData = playersResult.success ? playersResult.data : []
      
      const mappedPlayers = playersData
        .map((player: any) => ({
          id: player.id,
          player_id: player.player_id,
          player_name: player.player_name,
          registration_date: player.registration_date
            ? new Timestamp(Math.floor(parseNeonTimestampUTC(player.registration_date) / 1000), 0)
            : Timestamp.now(),
          additional_info: '',
          used_smart_assist: player.used_smart_assist || null,
        }))
        .sort((a: RegisteredPlayer, b: RegisteredPlayer) => 
          a.registration_date.toMillis() - b.registration_date.toMillis()
        )
      
      setRegisteredPlayers(mappedPlayers as RegisteredPlayer[])
      setLoading(false)
    } catch (err) {
      console.error('Error fetching data:', err)
      setError('Failed to load registration page')
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchData()
  }, [seasonId])

  // Set up real-time listener for stats updates
  useEffect(() => {
    if (!seasonId) return

    const unsubscribe = onSnapshot(
      doc(db, 'seasons', seasonId),
      (snapshot) => {
        if (snapshot.exists()) {
          const seasonData = { id: snapshot.id, ...snapshot.data() } as Season
          setSeason(seasonData)
        }
      },
      (error) => {
        console.error('Error listening to season updates:', error)
      }
    )

    return () => unsubscribe()
  }, [seasonId])

  // Set up real-time listener for registration stats
  useEffect(() => {
    if (!seasonId) return

    let intervalId: NodeJS.Timeout

    const fetchStats = async () => {
      try {
        const statsResponse = await fetch(`/api/admin/registration-phases?season_id=${seasonId}`, { cache: 'no-store' })
        const statsResult = await statsResponse.json()
        if (statsResult.success) {
          setStats(statsResult.data)
        }
      } catch (err) {
        console.error('Error fetching stats:', err)
      }
    }

    // Fetch immediately
    fetchStats()

    // Then fetch every 3 seconds for real-time updates
    intervalId = setInterval(fetchStats, 3000)

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [seasonId])

  // Set up real-time listener for registered players
  useEffect(() => {
    if (!seasonId) return

    let intervalId: NodeJS.Timeout

    const fetchPlayers = async () => {
      try {
        const playersResponse = await fetch(`/api/stats/players?seasonId=${seasonId}&limit=1000`, { cache: 'no-store' })
        const playersResult = await playersResponse.json()
        const playersData = playersResult.success ? playersResult.data : []
        
        const mappedPlayers = playersData
          .map((player: any) => {
            return {
              id: player.id,
              player_id: player.player_id,
              player_name: player.player_name,
              registration_date: player.registration_date
                ? new Timestamp(Math.floor(parseNeonTimestampUTC(player.registration_date) / 1000), 0)
                : Timestamp.now(),
              additional_info: '',
              used_smart_assist: player.used_smart_assist || null,
            };
          })
          .sort((a: RegisteredPlayer, b: RegisteredPlayer) => 
            a.registration_date.toMillis() - b.registration_date.toMillis()
          )
        
        setRegisteredPlayers(mappedPlayers as RegisteredPlayer[])
      } catch (err) {
        console.error('Error fetching players:', err)
      }
    }

    // Fetch immediately
    fetchPlayers()

    // Then fetch every 3 seconds for real-time updates
    intervalId = setInterval(fetchPlayers, 3000)

    return () => {
      if (intervalId) clearInterval(intervalId)
    }
  }, [seasonId])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchTerm(value)
    setShowDropdown(true)

    if (value.trim().length >= 2) {
      const searchLower = value.toLowerCase()
      const registeredPlayerIds = new Set(registeredPlayers.map(p => p.player_id))
      
      const filtered = masterPlayers.filter(p => {
        const matchesSearch = p.player_id?.toLowerCase().includes(searchLower) ||
          p.name?.toLowerCase().includes(searchLower)
        
        return matchesSearch && !registeredPlayerIds.has(p.player_id)
      })
      setFilteredPlayers(filtered)
    } else {
      setFilteredPlayers([])
    }
  }

  const handlePlayerSelect = (player: MasterPlayer) => {
    const isAlreadySelected = selectedPlayers.some(p => p.player_id === player.player_id)
    if (!isAlreadySelected) {
      setSelectedPlayers([...selectedPlayers, player])
    }
    setSearchTerm('')
    setShowDropdown(false)
    setFilteredPlayers([])
  }

  const handleRemovePlayer = (playerId: string) => {
    setSelectedPlayers(selectedPlayers.filter(p => p.player_id !== playerId))
  }

  const handleDeleteRegistration = async (playerId: string) => {
    if (!seasonId) return

    if (!confirm('Are you sure you want to remove this player registration? This will remove the player from this season.')) {
      return
    }

    setActioningPlayer(playerId)

    try {
      const currentRegistrationId = `${playerId}_${seasonId}`
      
      const response = await fetch('/api/register/player/delete', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          player_id: playerId,
          season_id: seasonId,
        }),
      })

      const result = await response.json()

      if (!response.ok) {
        setError(result.error || 'Failed to delete registration')
        setTimeout(() => setError(null), 5000)
        setActioningPlayer(null)
        return
      }

      setRegisteredPlayers(registeredPlayers.filter(p => p.id !== currentRegistrationId))
      
      if (stats) {
        setStats({
          ...stats,
          total_registrations: stats.total_registrations - 1,
        })
      }
      
      setSuccess('Player registration cancelled successfully!')
      setTimeout(() => setSuccess(null), 3000)
      setActioningPlayer(null)
    } catch (err) {
      console.error('Error removing registration:', err)
      setError('Failed to remove registration. Please try again.')
      setTimeout(() => setError(null), 3000)
      setActioningPlayer(null)
    }
  }

  const handleBulkDelete = async () => {
    if (selectedPlayerIds.length === 0) {
      setError('No players selected')
      return
    }

    if (!confirm(`Are you sure you want to delete ${selectedPlayerIds.length} selected players?`)) return
    
    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      const response = await fetch('/api/admin/players/bulk-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_ids: selectedPlayerIds,
          season_id: seasonId,
        }),
      })

      const result = await response.json()

      if (result.success) {
        setSuccess(result.message)
        setSelectedPlayerIds([])
        await fetchData()
      } else {
        setError(result.error)
      }
    } catch (error) {
      console.error('Error bulk deleting players:', error)
      setError('Failed to bulk delete players')
    } finally {
      setSubmitting(false)
    }
  }

  const togglePlayerSelection = (playerId: string) => {
    setSelectedPlayerIds(prev => 
      prev.includes(playerId) 
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    )
  }

  const toggleSelectAll = () => {
    if (selectedPlayerIds.length === filteredRegisteredPlayers.length) {
      setSelectedPlayerIds([])
    } else {
      setSelectedPlayerIds(filteredRegisteredPlayers.map(p => p.player_id))
    }
  }

  const filteredRegisteredPlayers = registeredPlayers.filter(player => 
    player.player_name?.toLowerCase().includes(playerSearchQuery.toLowerCase()) ||
    player.player_id?.toLowerCase().includes(playerSearchQuery.toLowerCase())
  )

  const handleExportToExcel = async () => {
    try {
      const playerIds = filteredRegisteredPlayers.map(p => p.player_id)
      const playerDetailsMap = new Map()
      
      for (let i = 0; i < playerIds.length; i += 30) {
        const batch = playerIds.slice(i, i + 30)
        const playersQuery = firestoreQuery(
          collection(db, 'realplayers'),
          where('player_id', 'in', batch)
        )
        const playersSnapshot = await getDocs(playersQuery)
        playersSnapshot.docs.forEach(doc => {
          const data = doc.data()
          playerDetailsMap.set(data.player_id, {
            email: data.email || '',
            phone: data.phone || ''
          })
        })
      }

      const exportData = filteredRegisteredPlayers.map((player, index) => {
        const details = playerDetailsMap.get(player.player_id) || { email: '', phone: '' }
        return {
          '#': index + 1,
          'Name': player.player_name || 'Unknown',
          'Player ID': player.player_id,
          'Registration Date': formatDateIST(player.registration_date),
          'Email': details.email,
          'Phone Number': details.phone,
          'Smart Assist': player.used_smart_assist 
            ? (player.used_smart_assist === 'yes' ? 'Yes' : 
               player.used_smart_assist === 'no' ? 'No' : 
               player.used_smart_assist === 'partially' ? 'Partially' : 
               player.used_smart_assist === 'didnt_play' ? "Didn't Play" : player.used_smart_assist) 
            : 'N/A (Admin/New)'
        }
      })

      const ws = XLSX.utils.json_to_sheet(exportData)
      
      ws['!cols'] = [
        { wch: 5 },  // #
        { wch: 25 }, // Name
        { wch: 15 }, // Player ID
        { wch: 20 }, // Registration Date
        { wch: 30 }, // Email
        { wch: 15 }, // Phone Number
        { wch: 18 }  // Smart Assist
      ]

      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, ws, 'Registered Players')

      const timestamp = new Date().toISOString().split('T')[0]
      const filename = `registered_players_${season?.name || seasonId}_${timestamp}.xlsx`

      XLSX.writeFile(wb, filename)
      
      setSuccess(`Exported ${exportData.length} players to Excel!`)
      setTimeout(() => setSuccess(null), 3000)
    } catch (error) {
      console.error('Error exporting to Excel:', error)
      setError('Failed to export to Excel')
      setTimeout(() => setError(null), 3000)
    }
  }

  const togglePlayerRegistration = async () => {
    if (!seasonId || isTogglingRegistration) return

    const confirmMessage = season?.is_player_registration_open
      ? `Close player registration for ${season?.name}?`
      : `Open player registration for ${season?.name}?`
    
    if (!confirm(confirmMessage)) return

    try {
      setIsTogglingRegistration(true)
      setError(null)
      setSuccess(null)
      
      const response = await fetch(`/api/admin/seasons/${seasonId}/toggle-player-registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })

      const result = await response.json()

      if (result.success && season) {
        setSeason({
          ...season,
          is_player_registration_open: result.season.is_player_registration_open
        })
        setSuccess(result.message)
      } else {
        setError(result.error || 'Failed to toggle registration')
      }
    } catch (error) {
      console.error('Error toggling player registration:', error)
      setError('Failed to toggle player registration')
    } finally {
      setIsTogglingRegistration(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 2000)
    }).catch(() => {
      setError('Failed to copy link')
      setTimeout(() => setError(null), 3000)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)
    setSuccess(null)

    try {
      if (selectedPlayers.length === 0) {
        setError('Please select at least one player to register')
        setSubmitting(false)
        return
      }

      let successCount = 0
      let skipCount = 0
      const errors: string[] = []

      for (const player of selectedPlayers) {
        try {
          const registrationResponse = await fetch('/api/register/player/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              player_id: player.player_id,
              season_id: seasonId,
              user_email: '',
              user_uid: '',
              is_admin_registration: true,
              player_data: {
                name: player.name
              }
            })
          })
          
          const registrationResult = await registrationResponse.json()
          
          if (!registrationResponse.ok) {
            if (registrationResult.error?.includes('already registered')) {
              skipCount++
              continue
            }
            throw new Error(registrationResult.error || 'Registration failed')
          }
          
          const registrationId = `${player.player_id}_${seasonId}`
          
          setRegisteredPlayers(prev => [
            {
              id: registrationId,
              player_id: player.player_id,
              player_name: player.name,
              registration_date: Timestamp.now(),
            },
            ...prev
          ])

          successCount++
        } catch (err) {
          console.error(`Error registering player ${player.player_id}:`, err)
          errors.push(`${player.name} (${player.player_id})`)
        }
      }

      setSelectedPlayers([])
      setSearchTerm('')

      if (successCount > 0 && stats) {
        setStats({
          ...stats,
          total_registrations: stats.total_registrations + successCount,
        })
      }

      if (successCount > 0) {
        setSuccess(`Successfully registered ${successCount} player${successCount > 1 ? 's' : ''}!${skipCount > 0 ? ` (${skipCount} already registered)` : ''}`)
      }
      if (errors.length > 0) {
        setError(`Failed to register: ${errors.join(', ')}`)
      }
      
      setTimeout(() => {
        setSuccess(null)
        setError(null)
      }, 5000)
      
      setSubmitting(false)
    } catch (err) {
      console.error('Error registering players:', err)
      setError('Failed to register players. Please try again.')
      setSubmitting(false)
    }
  }

  if (loading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading player registration...</p>
        </div>
      </div>
    )
  }

  if (error && !season) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative px-4">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-8 max-w-md w-full mx-auto text-center relative z-10 font-mono">
          <div className="text-rose-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider mb-2">Error</h2>
          <p className="text-xs text-slate-500 uppercase font-semibold mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl text-xs uppercase tracking-wider font-bold transition-all shadow-sm cursor-pointer"
          >
            Return Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-wider text-slate-800">Player Registration</h1>
            <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
              Season: <span className="font-extrabold text-amber-500">{season?.name || seasonId}</span>
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2 items-center">
            <div className="hidden md:flex items-center gap-2 mr-2">
              <div className="px-3 py-1.5 bg-blue-50/60 text-blue-700 border border-blue-200/30 rounded-xl font-bold text-[10px] uppercase tracking-wider shadow-sm">
                Total: {registeredPlayers.length}
              </div>
              <div className="px-3 py-1.5 bg-amber-50/60 text-amber-700 border border-amber-200/30 rounded-xl font-bold text-[10px] uppercase tracking-wider shadow-sm">
                Available: {totalMasterPlayers - registeredPlayers.length}
              </div>
            </div>

            <button
              onClick={() => router.push('/dashboard/committee')}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all text-xs uppercase tracking-wider font-bold cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to Dashboard</span>
            </button>
          </div>
        </div>

        {/* Messages */}
        {(error || success) && (
          <div className="animate-fade-in space-y-2">
            {error && (
              <div className="p-4 bg-red-50/50 border border-red-200/40 text-red-800 rounded-xl text-xs uppercase font-bold tracking-wider flex items-center gap-2">
                <svg className="w-4 h-4 text-red-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{error}</span>
              </div>
            )}
            {success && (
              <div className="p-4 bg-green-50/50 border border-green-200/40 text-green-800 rounded-xl text-xs uppercase font-bold tracking-wider flex items-center gap-2">
                <svg className="w-4 h-4 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{success}</span>
              </div>
            )}
          </div>
        )}

        {/* Tab Controls */}
        <div className="console-card bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
          <div className="flex border-b border-slate-100 p-2 bg-slate-50 gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setActiveTab('manage')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer hover:-translate-y-0.5 active:translate-y-0 ${
                activeTab === 'manage'
                  ? 'bg-slate-800 text-white shadow-sm border border-slate-900'
                  : 'bg-white hover:bg-slate-50/80 text-slate-700 border border-slate-200/60'
              }`}
            >
              Manage Players
            </button>
            <button
              onClick={() => setActiveTab('register')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer hover:-translate-y-0.5 active:translate-y-0 ${
                activeTab === 'register'
                  ? 'bg-slate-800 text-white shadow-sm border border-slate-900'
                  : 'bg-white hover:bg-slate-50/80 text-slate-700 border border-slate-200/60'
              }`}
            >
              Quick Register
            </button>
            <button
              onClick={() => setActiveTab('registration')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all whitespace-nowrap cursor-pointer hover:-translate-y-0.5 active:translate-y-0 ${
                activeTab === 'registration'
                  ? 'bg-slate-800 text-white shadow-sm border border-slate-900'
                  : 'bg-white hover:bg-slate-50/80 text-slate-700 border border-slate-200/60'
              }`}
            >
              Registration Control
            </button>
          </div>

          <div className="p-5">
            {/* Manage Players Tab */}
            {activeTab === 'manage' && (
              <div className="space-y-4">
                {/* Search / Filter header */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-50/80 p-4 border border-slate-200/60 rounded-2xl">
                  <div className="flex-1 relative">
                    <svg className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <input
                      type="text"
                      placeholder="Search registered players..."
                      value={playerSearchQuery}
                      onChange={(e) => setPlayerSearchQuery(e.target.value)}
                      className="w-full pl-10 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 text-xs font-bold uppercase tracking-wider"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={handleExportToExcel}
                      className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 hover:border-emerald-600 text-white border border-emerald-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm flex items-center gap-1.5 cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Export
                    </button>
                    
                    {selectedPlayerIds.length > 0 && (
                      <button
                        onClick={handleBulkDelete}
                        disabled={submitting}
                        className="px-4 py-2 bg-rose-600 hover:bg-rose-500 hover:border-rose-600 text-white border border-rose-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer disabled:opacity-50 hover:-translate-y-0.5 active:translate-y-0"
                      >
                        Delete Selected ({selectedPlayerIds.length})
                      </button>
                    )}
                  </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto border border-slate-200/60 rounded-2xl">
                  {filteredRegisteredPlayers.length === 0 ? (
                    <div className="p-12 text-center">
                      <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                      </svg>
                      <h3 className="text-base font-bold text-slate-800 uppercase tracking-wider mb-1">
                        {playerSearchQuery ? 'No players found' : 'No players registered'}
                      </h3>
                      <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">
                        {playerSearchQuery ? 'Try adjusting your search criteria' : 'Registered players will appear here'}
                      </p>
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200/60 text-[10px] uppercase font-black tracking-wider text-slate-500 font-mono">
                          <th className="p-4 w-12">
                            <input
                              type="checkbox"
                              checked={selectedPlayerIds.length === filteredRegisteredPlayers.length && filteredRegisteredPlayers.length > 0}
                              onChange={toggleSelectAll}
                              className="w-4 h-4 text-amber-500 border-slate-300 rounded focus:ring-2 focus:ring-amber-500/20 checked:bg-amber-500 cursor-pointer"
                            />
                          </th>
                          <th className="p-4 w-16">#</th>
                          <th className="p-4">Name</th>
                          <th className="p-4 hidden sm:table-cell">Player ID</th>
                          <th className="p-4 hidden md:table-cell">Registration Date</th>
                          <th className="p-4 hidden md:table-cell">Smart Assist</th>
                          <th className="p-4 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                        {filteredRegisteredPlayers.map((player, index) => {
                          const isActioning = actioningPlayer === player.player_id
                          
                          return (
                            <tr key={player.id} className="hover:bg-amber-500/[0.02] transition-colors">
                              <td className="p-4">
                                <input
                                  type="checkbox"
                                  checked={selectedPlayerIds.includes(player.player_id)}
                                  onChange={() => togglePlayerSelection(player.player_id)}
                                  className="w-4 h-4 text-amber-500 border-slate-300 rounded focus:ring-2 focus:ring-amber-500/20 checked:bg-amber-500 cursor-pointer"
                                />
                              </td>
                              <td className="p-4 font-mono">
                                <span className="px-2 py-0.5 bg-slate-100 text-slate-500 rounded border border-slate-200/30 text-[10px] font-bold">
                                  #{index + 1}
                                </span>
                              </td>
                              <td className="p-4 text-slate-900 uppercase tracking-wide">{player.player_name || 'Unknown'}</td>
                              <td className="p-4 font-mono hidden sm:table-cell text-slate-500">
                                <span className="px-2 py-0.5 bg-slate-50 text-slate-600 rounded border border-slate-200/40 text-[10px]">
                                  {player.player_id}
                                </span>
                              </td>
                              <td className="p-4 text-slate-500 hidden md:table-cell">
                                {formatDateIST(player.registration_date)}
                              </td>
                              <td className="p-4 hidden md:table-cell">
                                {player.used_smart_assist ? (
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                    player.used_smart_assist === 'yes'
                                      ? 'bg-green-50 text-green-700 border border-green-200/40'
                                      : player.used_smart_assist === 'no'
                                      ? 'bg-red-50 text-red-700 border border-red-200/40'
                                      : player.used_smart_assist === 'partially'
                                      ? 'bg-amber-50 text-amber-700 border border-amber-200/40'
                                      : 'bg-slate-50 text-slate-700 border border-slate-200/40'
                                  }`}>
                                    {player.used_smart_assist === 'yes' ? 'Yes' : 
                                     player.used_smart_assist === 'no' ? 'No' : 
                                     player.used_smart_assist === 'partially' ? 'Partially' : 
                                     player.used_smart_assist === 'didnt_play' ? "Didn't Play" : player.used_smart_assist}
                                  </span>
                                ) : (
                                  <span className="text-slate-400 italic text-[10px]">N/A (Admin/New)</span>
                                )}
                              </td>
                              <td className="p-4 text-right">
                                <button
                                  onClick={() => handleDeleteRegistration(player.player_id)}
                                  disabled={isActioning}
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-all border border-transparent hover:border-rose-200/40 cursor-pointer disabled:opacity-50"
                                  title="Delete registration"
                                >
                                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            )}

            {/* Quick Register Tab */}
            {activeTab === 'register' && (
              <div className="space-y-4">
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">Quick Player Registration</h2>
                
                <form onSubmit={handleSubmit} className="space-y-6">
                  <div className="relative">
                    <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">
                      Search Player <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={searchTerm}
                      onChange={handleSearchChange}
                      onFocus={() => setShowDropdown(true)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 text-xs font-bold uppercase tracking-wider"
                      placeholder="Type player ID or name..."
                    />
                    <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold mt-1.5">Type at least 2 characters to search</p>
                    
                    {showDropdown && filteredPlayers.length > 0 && (
                      <div className="absolute z-10 w-full mt-1 bg-white border border-slate-200/60 rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100/60">
                        {filteredPlayers.map(player => {
                          const isRegistered = registeredPlayers.some(p => p.player_id === player.player_id)
                          const isSelected = selectedPlayers.some(p => p.player_id === player.player_id)
                          const isDisabled = isRegistered || isSelected
                          return (
                            <button
                              key={player.id}
                              type="button"
                              onClick={() => !isDisabled && handlePlayerSelect(player)}
                              disabled={isDisabled}
                              className={`w-full px-4 py-3 text-left transition-colors cursor-pointer ${
                                isDisabled 
                                  ? 'bg-slate-50/50 cursor-not-allowed opacity-60' 
                                  : 'hover:bg-amber-500/[0.04]'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                                  <div>{player.name}</div>
                                  <div className="text-[10px] text-slate-400 font-mono mt-0.5">{player.player_id}</div>
                                </div>
                                {isRegistered && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider bg-blue-50/60 text-blue-700 border border-blue-200/30 px-2.5 py-0.5 rounded-full">
                                    Registered
                                  </span>
                                )}
                                {isSelected && !isRegistered && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider bg-purple-50/60 text-purple-700 border border-purple-200/30 px-2.5 py-0.5 rounded-full">
                                    Selected
                                  </span>
                                )}
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>

                  {selectedPlayers.length > 0 && (
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">
                        Selected Players ({selectedPlayers.length}):
                      </p>
                      <div className="space-y-2">
                        {selectedPlayers.map((player) => (
                          <div key={player.player_id} className="flex items-center justify-between p-3 bg-amber-500/[0.03] rounded-xl border border-amber-500/20 font-bold text-xs uppercase tracking-wider">
                            <div>
                              <div className="text-slate-800">{player.name}</div>
                              <div className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {player.player_id}</div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemovePlayer(player.player_id)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-rose-200/40"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                              </svg>
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={submitting || selectedPlayers.length === 0}
                    className="w-full py-3 px-4 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-slate-900 font-bold text-xs uppercase tracking-wider transition-all shadow-sm cursor-pointer disabled:opacity-50 hover:-translate-y-0.5 active:translate-y-0"
                  >
                    {submitting ? 'Registering...' : `Register ${selectedPlayers.length > 0 ? `${selectedPlayers.length} Selected Player${selectedPlayers.length > 1 ? 's' : ''}` : 'Players'}`}
                  </button>
                </form>
              </div>
            )}

            {/* Registration Control Tab */}
            {activeTab === 'registration' && (
              <div className="space-y-6">
                {/* Stats Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 font-mono">
                  <div className="console-card bg-gradient-to-br from-blue-50/60 to-white rounded-2xl p-5 border border-blue-100/80 hover:border-blue-400/40 transition-all hover:-translate-y-1">
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-md">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="text-[10px] uppercase font-bold text-blue-600/80 tracking-wider mb-1">Total Players</div>
                    <div className="text-2xl font-black text-blue-900">{totalMasterPlayers}</div>
                  </div>

                  <div className="console-card bg-gradient-to-br from-green-50/60 to-white rounded-2xl p-5 border border-green-100/80 hover:border-green-400/40 transition-all hover:-translate-y-1">
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-green-500 to-green-600 shadow-md">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="text-[10px] uppercase font-bold text-green-600/80 tracking-wider mb-1">Registered</div>
                    <div className="text-2xl font-black text-green-700">{registeredPlayers.length}</div>
                  </div>

                  <div className="console-card bg-gradient-to-br from-amber-50/60 to-white rounded-2xl p-5 border border-amber-100/80 hover:border-amber-400/40 transition-all hover:-translate-y-1">
                    <div className="flex items-center justify-between mb-3">
                      <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 shadow-md">
                        <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                      </div>
                    </div>
                    <div className="text-[10px] uppercase font-bold text-amber-600/80 tracking-wider mb-1">Available</div>
                    <div className="text-2xl font-black text-amber-700">{totalMasterPlayers - registeredPlayers.length}</div>
                  </div>
                </div>

                {/* Registration Control Panel */}
                <div className="console-card bg-white rounded-3xl p-6 border border-slate-200/60 font-mono">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                      <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">Registration Status:</span>
                      {season?.is_player_registration_open ? (
                        <span className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold bg-green-50 text-green-700 border border-green-200/40 uppercase tracking-wider">
                          <svg className="w-3.5 h-3.5 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                            <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"/>
                          </svg>
                          OPEN
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-3 py-1 rounded-lg text-xs font-bold bg-red-50 text-red-700 border border-red-200/40 uppercase tracking-wider">
                          <svg className="w-3.5 h-3.5 mr-1.5" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M4.3 4.3a1 1 0 011.4 0L10 8.6l4.3-4.3a1 1 0 111.4 1.4L11.4 10l4.3 4.3a1 1 0 01-1.4 1.4L10 11.4l-4.3 4.3a1 1 0 01-1.4-1.4L8.6 10 4.3 5.7a1 1 0 010-1.4z" clipRule="evenodd"/>
                          </svg>
                          CLOSED
                        </span>
                      )}
                    </div>
                    
                    <button
                      onClick={togglePlayerRegistration}
                      disabled={isTogglingRegistration}
                      className={`inline-flex items-center px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer hover:-translate-y-0.5 active:translate-y-0 ${
                        season?.is_player_registration_open
                          ? 'bg-red-600 hover:bg-red-500 text-white border border-red-700'
                          : 'bg-green-600 hover:bg-green-500 text-white border border-green-700'
                      }`}
                    >
                      {isTogglingRegistration ? (
                        <>
                          <svg className="animate-spin w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing...
                        </>
                      ) : season?.is_player_registration_open ? (
                        <>
                          <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                          Close Registration
                        </>
                      ) : (
                        <>
                          <svg className="w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                          </svg>
                          Open Registration
                        </>
                      )}
                    </button>
                  </div>

                  {season?.is_player_registration_open ? (
                    <div className="space-y-4">
                      <div className="p-4 bg-green-50/50 border border-green-200/50 rounded-xl">
                        <p className="text-[10px] uppercase font-bold text-green-800 flex items-start leading-relaxed tracking-wider">
                          <svg className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span><strong>Registration Active:</strong> Share the link below with players to register for {season?.name}.</span>
                        </p>
                      </div>
                      
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">Registration Link</label>
                        <div className="flex flex-col sm:flex-row gap-2">
                          <input
                            type="text"
                            value={`${typeof window !== 'undefined' ? window.location.origin : ''}/register/player?season=${seasonId}`}
                            readOnly
                            onClick={(e) => e.currentTarget.select()}
                            className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 text-xs font-mono text-slate-700 font-bold"
                          />
                          <button
                            onClick={() => copyToClipboard(`${typeof window !== 'undefined' ? window.location.origin : ''}/register/player?season=${seasonId}`)}
                            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-slate-900 font-bold text-xs uppercase tracking-wider transition-all shadow-sm flex items-center justify-center cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
                          >
                            <svg className="w-4 h-4 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                            <span>{copiedUrl ? 'Copied!' : 'Copy Link'}</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 bg-red-50/50 border border-red-200/50 rounded-xl">
                      <p className="text-[10px] uppercase font-bold text-red-800 flex items-start leading-relaxed tracking-wider">
                        <svg className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        <span><strong>Registration Closed:</strong> Players cannot register at this time. Click "Open Registration" to allow new player registrations.</span>
                      </p>
                    </div>
                  )}
                </div>

                {/* Info Panel */}
                <div className="console-card bg-white rounded-3xl p-6 border border-slate-200/60 font-mono">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center mb-4">
                    <svg className="w-4 h-4 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Registration Information
                  </h3>
                  <div className="space-y-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                    <p>
                      <span className="text-slate-700">1. Season-Specific Link:</span> The registration link is tied directly to {season?.name}. Players will automatically register for this season.
                    </p>
                    <p>
                      <span className="text-slate-700">2. Process:</span> Players will complete registration for {season?.name}.
                    </p>
                    <p>
                      <span className="text-slate-700">3. Control:</span> You can open or close registration at any time using the toggle above.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PlayersRegistrationPage() {
  return (
    <Suspense fallback={
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto mb-4"></div>
          <p className="text-xs text-slate-400 uppercase font-bold tracking-wider">Loading...</p>
        </div>
      </div>
    }>
      <PlayersRegistrationPageContent />
    </Suspense>
  );
}
