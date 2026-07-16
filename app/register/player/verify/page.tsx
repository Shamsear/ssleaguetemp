'use client'

import { Check, Crown, Lock, Medal, Star, TrendingUp, Trophy } from 'lucide-react';
import { Suspense, useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { db, auth } from '@/lib/firebase/config'
import { collection, addDoc, doc, getDoc, query, where, getDocs, Timestamp, updateDoc } from 'firebase/firestore'
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User } from 'firebase/auth'

interface Season {
  id: string
  name: string
  is_player_registration_open: boolean
}

interface Player {
  id?: string
  player_id: string
  name: string
  place?: string
  date_of_birth?: string
  email?: string
  phone?: string
  team?: string
  is_registered?: boolean
  previous_season_team?: string
  previous_season_category?: string
}

interface FormData {
  name: string
  place: string
  date_of_birth: string
  email: string
  phone: string
}

function PlayerVerifyContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const seasonId = searchParams.get('season')

  const [season, setSeason] = useState<Season | null>(null)
  const [player, setPlayer] = useState<Player | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchResults, setSearchResults] = useState<Player[]>([])
  const [showSearchStep, setShowSearchStep] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const [isNewPlayer, setIsNewPlayer] = useState(false)
  const playerId = searchParams.get('player')
  const [showDistrictDropdown, setShowDistrictDropdown] = useState(false)
  const [districtSearch, setDistrictSearch] = useState('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const [formData, setFormData] = useState<FormData>({
    name: '',
    place: '',
    date_of_birth: '',
    email: '',
    phone: ''
  })
  const [photoFile, setPhotoFile] = useState<File | null>(null)
  const [photoPreview, setPhotoPreview] = useState<string | null>(null)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [usedSmartAssist, setUsedSmartAssist] = useState<string>('')

  // Kerala districts list
  const keralaDistricts = [
    'Alappuzha',
    'Ernakulam',
    'Idukki',
    'Kannur',
    'Kasaragod',
    'Kollam',
    'Kottayam',
    'Kozhikode',
    'Malappuram',
    'Palakkad',
    'Pathanamthitta',
    'Thiruvananthapuram',
    'Thrissur',
    'Wayanad'
  ]

  // Filter districts based on search
  const filteredDistricts = keralaDistricts.filter(district =>
    district.toLowerCase().includes(districtSearch.toLowerCase())
  )

  // Check auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      if (!currentUser) {
        // Redirect back to main registration page if not signed in
        router.push(`/register/player?season=${seasonId}`)
        return
      }
      setAuthLoading(false)
    })
    return () => unsubscribe()
  }, [router, seasonId])

  // Fetch season and player data in parallel for faster load
  useEffect(() => {
    const fetchData = async () => {
      if (!seasonId) {
        setError('Missing season information')
        setLoading(false)
        return
      }

      if (!user) return

      try {
        // Fetch season, player data, and registration stats in parallel
        const seasonPromise = getDoc(doc(db, 'seasons', seasonId))
        const playerPromise = playerId 
          ? getDocs(query(collection(db, 'realplayers'), where('player_id', '==', playerId)))
          : Promise.resolve(null)
        const statsPromise = fetch(`/api/admin/registration-phases?season_id=${seasonId}`).catch(() => null)

        const [seasonDoc, playerSnapshot, statsResponse] = await Promise.all([seasonPromise, playerPromise, statsPromise])

        // Process season data
        if (!seasonDoc.exists()) {
          setError('Season not found')
          setLoading(false)
          return
        }

        const seasonData = { id: seasonDoc.id, ...seasonDoc.data() } as Season

        if (!seasonData.is_player_registration_open) {
          setError('Player registration is currently closed for this season')
          setLoading(false)
          return
        }

        // Add registration phase info to season data
        if (statsResponse) {
          const statsResult = await statsResponse.json()
          if (statsResult.success) {
            Object.assign(seasonData, statsResult.data)
          }
        }

        setSeason(seasonData)

        // Process player data
        if (!playerId) {
          // New player registration
          setIsNewPlayer(true)
          setShowForm(true)
          setFormData({
            name: '',
            place: '',
            date_of_birth: '',
            email: user.email || '',
            phone: ''
          })
        } else if (playerSnapshot && !playerSnapshot.empty) {
          const playerData = { id: playerSnapshot.docs[0].id, ...playerSnapshot.docs[0].data() } as Player
          setPlayer(playerData)

          // Check if player has complete details
          const hasCompleteDetails = playerData.place && playerData.date_of_birth && playerData.email && playerData.phone

          if (!hasCompleteDetails) {
            // Pre-fill existing data and show form
            setFormData({
              name: playerData.name || '',
              place: playerData.place || '',
              date_of_birth: playerData.date_of_birth || '',
              email: playerData.email || user.email || '',
              phone: playerData.phone || ''
            })
            setShowForm(true)
            setIsNewPlayer(false)
          }
        } else {
          // Player not found
          setError('Player not found')
          setTimeout(() => {
            router.push(`/register/player?season=${seasonId}`)
          }, 2000)
        }

        setLoading(false)
      } catch (err) {
        console.error('Error fetching data:', err)
        setError('Failed to load registration details')
        setLoading(false)
      }
    }

    fetchData()
  }, [seasonId, playerId, user, router])

  // Auto-refresh slot availability every 5 seconds
  useEffect(() => {
    if (!seasonId || !season) return

    const refreshSlots = async () => {
      try {
        const statsResponse = await fetch(`/api/admin/registration-phases?season_id=${seasonId}`)
        if (statsResponse.ok) {
          const statsResult = await statsResponse.json()
          if (statsResult.success) {
            setSeason(prev => prev ? { ...prev, ...statsResult.data } : null)
            setLastUpdated(new Date())
          }
        }
      } catch (err) {
        // Silently fail - don't disrupt user experience
        console.error('Error refreshing slots:', err)
      }
    }

    // Refresh every 5 seconds
    const interval = setInterval(refreshSlots, 5000)
    return () => clearInterval(interval)
  }, [seasonId, season])

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDistrictDropdown(false)
        setDistrictSearch('')
      }
    }

    if (showDistrictDropdown) {
      document.addEventListener('mousedown', handleClickOutside)
      return () => document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showDistrictDropdown])

  // REMOVED: Email validation checks moved to form submission for faster page load
  // These checks will be performed by the API when submitting the registration

  // Search players by ID or name
  const searchPlayers = async (term: string) => {
    if (term.trim().length < 2) {
      setSearchResults([])
      return
    }

    setSearching(true)
    try {
      const realPlayersRef = collection(db, 'realplayers')
      const playersSnapshot = await getDocs(realPlayersRef)
      const allPlayers = playersSnapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Player[]

      // Filter by player_id or name
      const searchLower = term.toLowerCase()
      const filteredPlayers = allPlayers.filter(p =>
        p.player_id?.toLowerCase().includes(searchLower) ||
        p.name?.toLowerCase().includes(searchLower)
      )

      setSearchResults(filteredPlayers)
    } catch (err) {
      console.error('Error searching players:', err)
    } finally {
      setSearching(false)
    }
  }

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setSearchTerm(value)
    const timer = setTimeout(() => {
      searchPlayers(value)
    }, 300)
    return () => clearTimeout(timer)
  }

  const handleSelectExistingPlayer = async (selectedPlayer: Player) => {
    // Fetch previous season team and category
    try {
      if (seasonId) {
        const currentSeasonDoc = await getDoc(doc(db, 'seasons', seasonId))
        if (currentSeasonDoc.exists()) {
          const currentSeasonNumber = parseInt(currentSeasonDoc.data().name.replace(/\D/g, ''))
          
          if (currentSeasonNumber > 1) {
            // Query team_seasons for previous season
            const previousSeasonQuery = query(
              collection(db, 'team_seasons'),
              where('season_number', '==', currentSeasonNumber - 1)
            )
            const teamSeasonsSnapshot = await getDocs(previousSeasonQuery)
            
            // Find team that has this player
            for (const teamDoc of teamSeasonsSnapshot.docs) {
              const teamData = teamDoc.data()
              const realPlayers = teamData.real_players || []
              
              const playerInTeam = realPlayers.find((p: any) => p.player_id === selectedPlayer.player_id)
              
              if (playerInTeam) {
                selectedPlayer.previous_season_team = teamData.team_name || 'Unknown'
                selectedPlayer.previous_season_category = playerInTeam.category || 'Unknown'
                break
              }
            }
          }
        }
      }
    } catch (err) {
      console.error('Error fetching previous season data:', err)
    }

    setPlayer(selectedPlayer)
    setShowSearchStep(false)

    // Check if player has missing details
    const hasCompleteDetails = selectedPlayer.place && selectedPlayer.date_of_birth && selectedPlayer.email && selectedPlayer.phone

    if (!hasCompleteDetails) {
      // Pre-fill existing data
      setFormData({
        name: selectedPlayer.name || '',
        place: selectedPlayer.place || '',
        date_of_birth: selectedPlayer.date_of_birth || '',
        email: selectedPlayer.email || user?.email || '',
        phone: selectedPlayer.phone || ''
      })
      setShowForm(true)
      setIsNewPlayer(false)
    }
  }

  const handleAddNewPlayer = () => {
    setShowSearchStep(false)
    setShowForm(true)
    setIsNewPlayer(true)
    setFormData({
      name: '',
      place: '',
      date_of_birth: '',
      email: user?.email || '',
      phone: ''
    })
  }

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData(prev => ({
      ...prev,
      [e.target.name]: e.target.value
    }))
  }

  const handleDistrictSelect = (district: string) => {
    setFormData(prev => ({
      ...prev,
      place: district
    }))
    setShowDistrictDropdown(false)
    setDistrictSearch('')
  }

  const handleDistrictSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDistrictSearch(e.target.value)
    setShowDistrictDropdown(true)
  }

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('Photo size must be less than 5MB')
      return
    }

    setPhotoFile(file)
    
    // Create preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setPhotoPreview(reader.result as string)
    }
    reader.readAsDataURL(file)
    setError(null)
  }

  const handleSignOut = async () => {
    try {
      await signOut(auth)
      router.push(`/register/player?season=${seasonId}`)
    } catch (err) {
      console.error('Sign out error:', err)
    }
  }

  const handleConfirm = async () => {
    if (!seasonId || !user?.email) return

    // Validate photo upload (required for all players)
    if (!photoFile) {
      setError('Please upload your photo. This is required for registration.')
      return
    }

    // Validate smart assist option for existing players
    if (!isNewPlayer && !usedSmartAssist) {
      setError('Please select whether you used smart assist last season.')
      return
    }

    // Validate form if shown
    if (showForm) {
      // For existing players, only validate missing fields
      if (isNewPlayer) {
        // New player: all fields required
        if (!formData.name || !formData.place || !formData.date_of_birth || !formData.email || !formData.phone) {
          setError('Please fill in all required fields')
          return
        }
      } else {
        // Existing player: only validate fields that are missing from database
        const missingFields = []
        if (!player?.name && !formData.name) missingFields.push('Name')
        if (!player?.place && !formData.place) missingFields.push('District')
        if (!player?.date_of_birth && !formData.date_of_birth) missingFields.push('Date of Birth')
        if (!player?.email && !formData.email) missingFields.push('Email')
        if (!player?.phone && !formData.phone) missingFields.push('Phone')
        
        if (missingFields.length > 0) {
          setError(`Please fill in the missing required fields: ${missingFields.join(', ')}`)
          return
        }
      }
    }

    setSubmitting(true)
    setError(null)

    try {
      // For new players, generate a player ID first
      let finalPlayerId = player?.player_id
      
      if (isNewPlayer && !finalPlayerId) {
        // Generate new player ID by finding the max ID
        const playersRef = collection(db, 'realplayers')
        const playersSnapshot = await getDocs(query(playersRef))
        const maxId = playersSnapshot.docs.reduce((max, doc) => {
          const id = (doc.data() as any).player_id as string
          if (id && id.startsWith('sspslpsl')) {
            const numStr = id.replace('sspslpsl', '')
            const num = parseInt(numStr, 10)
            if (!isNaN(num)) {
              return num > max ? num : max
            }
          }
          return max
        }, 0)
        const nextId = maxId + 1
        // Pad with leading zeros to 4 digits to match existing format (0001-9999)
        const paddedId = String(nextId).padStart(4, '0')
        finalPlayerId = `sspslpsl${paddedId}`
      }

      // Upload photo to ImageKit
      setUploadingPhoto(true)
      let photoUrl = ''
      let photoFileId = ''
      
      if (photoFile && finalPlayerId) {
        try {
          const { uploadPlayerPhoto } = await import('@/lib/imagekit/playerPhotos')
          const result = await uploadPlayerPhoto(finalPlayerId, photoFile)
          photoUrl = result.url
          photoFileId = result.fileId
        } catch (photoError) {
          console.error('Error uploading photo:', photoError)
          setError('Failed to upload photo. Please try again.')
          setSubmitting(false)
          setUploadingPhoto(false)
          return
        }
      }
      setUploadingPhoto(false)

      // Prepare player data to send to API
      const playerData: any = {}
      
      if (showForm) {
        // Include form data for fields that need updating
        if (formData.name) playerData.name = formData.name
        if (formData.place) playerData.place = formData.place
        if (formData.date_of_birth) playerData.date_of_birth = formData.date_of_birth
        if (formData.email) playerData.email = formData.email
        if (formData.phone) playerData.phone = formData.phone
      } else if (player) {
        // Use existing player data
        playerData.name = player.name
        if (player.place) playerData.place = player.place
        if (player.date_of_birth) playerData.date_of_birth = player.date_of_birth
        if (player.email) playerData.email = player.email
        if (player.phone) playerData.phone = player.phone
      }
      
      // Add photo URL and fileId
      if (photoUrl) {
        playerData.photo_url = photoUrl
        playerData.photo_file_id = photoFileId
      }

      // Call API to confirm registration
      const response = await fetch('/api/register/player/confirm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          player_id: finalPlayerId,
          season_id: seasonId,
          user_email: user.email,
          user_uid: user.uid,
          player_data: playerData,
          used_smart_assist: !isNewPlayer ? usedSmartAssist : null,
        }),
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'Failed to confirm registration')
      }

      // Redirect to success page
      router.push('/register/player/success')
    } catch (err) {
      console.error('Error confirming registration:', err)
      setError(err instanceof Error ? err.message : 'Failed to complete registration. Please try again.')
      setSubmitting(false)
    }
  }

  const handleBack = () => {
    router.push(`/register/player?season=${seasonId}`)
  }

  if (loading || authLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading registration details...</p>
        </div>
      </div>
    )
  }

  if (error && !user) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative px-4">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-8 max-w-md w-full mx-auto text-center relative z-10 font-mono">
          <div className="text-rose-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider mb-2">Registration Error</h2>
          <p className="text-xs text-slate-500 uppercase font-semibold mb-6">{error}</p>
          <button
            onClick={() => router.push('/')}
            className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl text-xs uppercase tracking-wider font-bold transition-all shadow-sm cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
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

      <div className="max-w-4xl mx-auto relative z-10 space-y-6 font-mono">
        <div className="console-card bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
          {/* Header */}
          <div className="border-b border-slate-100 p-6 bg-slate-50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                </svg>
                Player Registration
              </h1>
              {season && (
                <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                  Season: <span className="font-extrabold text-amber-500">{season.name}</span>
                </p>
              )}
            </div>
          </div>

          <div className="p-6">
            {user && (
              <>
                {/* Signed in indicator */}
                <div className="bg-gradient-to-r from-green-50/50 to-emerald-50/50 rounded-xl p-4 mb-6 border border-green-200/40 font-mono">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-500 rounded-full flex items-center justify-center shadow-md">
                        <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-bold text-green-900 text-xs uppercase tracking-wider">Signed In</p>
                        <p className="text-[10px] text-green-700 font-mono">{user.email}</p>
                      </div>
                    </div>
                    <button
                      onClick={handleSignOut}
                      className="px-3 py-1.5 text-xs bg-white hover:bg-slate-50 border border-green-200/40 text-green-700 font-bold rounded-lg transition-all cursor-pointer shadow-sm animate-pulse-slow"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>

                {/* Registration form */}
                {showForm && (
                  <div className="bg-amber-500/[0.02] rounded-xl p-6 border border-amber-500/10 font-mono space-y-6">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
                      {isNewPlayer ? 'New Player Registration' : 'Complete Your Profile'}
                    </h3>
                    
                    {!isNewPlayer && (
                      <div className="bg-blue-50/60 border border-blue-200/30 text-blue-700 p-4 rounded-xl mb-4 font-mono">
                        <p className="text-xs uppercase font-extrabold mb-1">
                          <span className="flex items-center gap-1.5"><Lock className="w-4 h-4 text-slate-500" /> Profile Update Rules</span>
                        </p>
                        <p className="text-[10px] uppercase font-bold leading-relaxed">
                          Fields with existing database values cannot be changed. You can only fill in missing information.
                        </p>
                      </div>
                    )}
                    
                    {player?.previous_season_team && (
                      <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 mb-4 font-mono">
                        <p className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Previous Season Info</p>
                        <p className="text-[10px] uppercase font-bold text-slate-505 tracking-wider">Team: <strong className="text-slate-800">{player.previous_season_team}</strong></p>
                        {player.previous_season_category && (
                          <p className="text-[10px] uppercase font-bold text-slate-505 tracking-wider mt-1">Category: <strong className="text-slate-800 capitalize">{player.previous_season_category}</strong></p>
                        )}
                      </div>
                    )}
                    
                    <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider leading-relaxed">Please fill in all required information.</p>
                    
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5">
                          Full Name *
                          {player?.name && <span className="text-[9px] text-green-600 font-bold ml-2">(From Database)</span>}
                        </label>
                        <input
                          type="text"
                          name="name"
                          value={formData.name}
                          onChange={handleFormChange}
                          readOnly={!isNewPlayer && !!player?.name}
                          className={`w-full px-4 py-2.5 border rounded-xl outline-none text-xs font-bold uppercase tracking-wider ${
                            !isNewPlayer && player?.name
                              ? 'border-slate-200/40 bg-slate-100/60 text-slate-400 cursor-not-allowed'
                              : 'bg-slate-50 border border-slate-200/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80'
                          }`}
                          placeholder="Enter your full name"
                        />
                        {!isNewPlayer && player?.name && (
                          <p className="text-[9px] text-slate-400 font-bold mt-1.5">This field cannot be changed as it exists in our database</p>
                        )}
                      </div>

                      <div className="relative">
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5">
                          District (Kerala) *
                          {player?.place && <span className="text-[9px] text-green-600 font-bold ml-2">(From Database)</span>}
                        </label>
                        
                        {/* Custom Dropdown */}
                        <div className="relative" ref={dropdownRef}>
                          <div
                            className={`w-full px-4 py-2.5 border rounded-xl outline-none cursor-pointer transition-all duration-200 flex items-center justify-between text-xs font-bold uppercase tracking-wider ${
                              !isNewPlayer && player?.place
                                ? 'border-slate-200/40 bg-slate-100/60 text-slate-400 cursor-not-allowed'
                                : 'bg-slate-50 border border-slate-200/60 hover:border-amber-400/40 focus-within:ring-2 focus-within:ring-amber-500/20 focus-within:border-amber-500/80 bg-white'
                            }`}
                            onClick={() => {
                              if (!(!isNewPlayer && player?.place)) {
                                setShowDistrictDropdown(!showDistrictDropdown)
                                setDistrictSearch('')
                              }
                            }}
                          >
                            <div className="flex-1">
                              {formData.place ? (
                                <div className="flex items-center gap-3">
                                  <div className="w-5 h-5 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0 border border-green-200/40">
                                    <svg className="w-3.5 h-3.5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                    </svg>
                                  </div>
                                  <span className="font-bold text-slate-800">{formData.place}</span>
                                  {!isNewPlayer && player?.place && (
                                    <span className="text-[9px] bg-green-50 text-green-700 px-2 py-0.5 rounded border border-green-200/40 font-bold uppercase tracking-wider">From Database</span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-slate-400 font-bold">Select your district</span>
                              )}
                            </div>
                            
                            {!(!isNewPlayer && player?.place) && (
                              <svg 
                                className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                                  showDistrictDropdown ? 'rotate-180' : 'rotate-0'
                                }`} 
                                fill="none" 
                                stroke="currentColor" 
                                viewBox="0 0 24 24"
                              >
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                              </svg>
                            )}
                          </div>
                          
                          {/* Dropdown Menu */}
                          {showDistrictDropdown && !(!isNewPlayer && player?.place) && (
                            <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200/60 rounded-xl shadow-md max-h-80 overflow-hidden font-mono">
                              {/* Search Input */}
                              <div className="p-3 border-b border-slate-100">
                                <div className="relative">
                                  <svg className="absolute left-3.5 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                  </svg>
                                  <input
                                    type="text"
                                    value={districtSearch}
                                    onChange={handleDistrictSearchChange}
                                    placeholder="Search districts..."
                                    className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200/60 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 outline-none text-xs font-bold uppercase tracking-wider"
                                    autoFocus
                                  />
                                </div>
                              </div>
                              
                              {/* Districts List */}
                              <div className="max-h-60 overflow-y-auto">
                                {filteredDistricts.length > 0 ? (
                                  filteredDistricts.map((district, index) => (
                                    <div
                                      key={district}
                                      onClick={() => handleDistrictSelect(district)}
                                      className={`px-4 py-3 cursor-pointer transition-colors flex items-center gap-3 text-xs uppercase font-bold text-slate-705 ${
                                        formData.place === district 
                                          ? 'bg-amber-500/[0.04] text-amber-700 border-l-4 border-amber-500 font-extrabold' 
                                          : 'hover:bg-slate-50 text-slate-700'
                                      } ${
                                        index !== filteredDistricts.length - 1 ? 'border-b border-slate-100' : ''
                                      }`}
                                    >
                                      <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 border ${
                                        formData.place === district 
                                          ? 'bg-amber-50 border-amber-200' 
                                          : 'bg-slate-50 border-slate-200'
                                      }`}>
                                        <svg className={`w-3.5 h-3.5 ${
                                          formData.place === district 
                                            ? 'text-amber-600' 
                                            : 'text-slate-500'
                                        }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                                        </svg>
                                      </div>
                                      <div className="flex-1">
                                        <span className="font-bold">{district}</span>
                                      </div>
                                      {formData.place === district && (
                                        <svg className="w-4 h-4 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                                        </svg>
                                      )}
                                    </div>
                                  ))
                                ) : (
                                  <div className="px-4 py-8 text-center text-slate-400 uppercase tracking-wider font-bold">
                                    <svg className="w-12 h-12 mx-auto mb-3 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                                    </svg>
                                    <p className="text-xs">No districts found</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                        
                        {!isNewPlayer && player?.place && (
                          <p className="text-[9px] text-slate-400 font-bold mt-1.5">This field cannot be changed as it exists in our database</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5">
                          Date of Birth *
                          {player?.date_of_birth && <span className="text-[9px] text-green-600 font-bold ml-2">(From Database)</span>}
                        </label>
                        <input
                          type="date"
                          name="date_of_birth"
                          value={formData.date_of_birth}
                          onChange={handleFormChange}
                          readOnly={!isNewPlayer && !!player?.date_of_birth}
                          className={`w-full px-4 py-2.5 border rounded-xl outline-none text-xs font-bold uppercase tracking-wider ${
                            !isNewPlayer && player?.date_of_birth
                              ? 'border-slate-200/40 bg-slate-100/60 text-slate-400 cursor-not-allowed'
                              : 'bg-slate-50 border border-slate-200/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80'
                          }`}
                        />
                        {!isNewPlayer && player?.date_of_birth && (
                          <p className="text-[9px] text-slate-450 mt-1">This field cannot be changed as it exists in our database</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5">
                          Email *
                          {player?.email && <span className="text-[9px] text-green-600 font-bold ml-2">(From Database)</span>}
                        </label>
                        <input
                          type="email"
                          name="email"
                          value={formData.email}
                          onChange={handleFormChange}
                          readOnly={!isNewPlayer && !!player?.email}
                          className={`w-full px-4 py-2.5 border rounded-xl outline-none text-xs font-bold uppercase tracking-wider ${
                            !isNewPlayer && player?.email
                              ? 'border-slate-200/40 bg-slate-100/60 text-slate-400 cursor-not-allowed'
                              : 'bg-slate-50 border border-slate-200/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80'
                          }`}
                          placeholder="Enter your email"
                        />
                        {!isNewPlayer && player?.email && (
                          <p className="text-[9px] text-slate-450 mt-1">This field cannot be changed as it exists in our database</p>
                        )}
                      </div>

                      <div>
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-1.5">
                          Phone Number *
                          {player?.phone && <span className="text-[9px] text-green-600 font-bold ml-2">(From Database)</span>}
                        </label>
                        <input
                          type="tel"
                          name="phone"
                          value={formData.phone}
                          onChange={handleFormChange}
                          readOnly={!isNewPlayer && !!player?.phone}
                          className={`w-full px-4 py-2.5 border rounded-xl outline-none text-xs font-bold uppercase tracking-wider ${
                            !isNewPlayer && player?.phone
                              ? 'border-slate-200/40 bg-slate-100/60 text-slate-400 cursor-not-allowed'
                              : 'bg-slate-50 border border-slate-200/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80'
                          }`}
                          placeholder="Enter your phone number"
                        />
                        {!isNewPlayer && player?.phone && (
                          <p className="text-[9px] text-slate-450 mt-1">This field cannot be changed as it exists in our database</p>
                        )}
                      </div>
                    </div>

                    {/* Smart Assist Option for Existing Players */}
                    {!isNewPlayer && (
                      <div className="bg-amber-500/[0.03] border border-amber-500/10 rounded-2xl p-5 mb-4">
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-2">
                          Did you use Smart Assist in the last season? *
                          <span className="text-rose-500 font-extrabold ml-1">Required</span>
                        </label>
                        <select
                          value={usedSmartAssist}
                          onChange={(e) => setUsedSmartAssist(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-705"
                        >
                          <option value="">Select option...</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                          <option value="partially">Partially (Used for some time last season)</option>
                          <option value="didnt_play">Didn't play last season</option>
                        </select>
                      </div>
                    )}

                    {/* Photo Upload - Required for all players */}
                    <div className="bg-amber-500/[0.02] border border-amber-500/10 rounded-2xl p-6 mt-4">
                      <label className="block text-[10px] uppercase font-bold text-slate-500 mb-3">
                        Player Photo *
                        <span className="text-rose-500 font-extrabold ml-1">Required</span>
                      </label>
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider leading-relaxed mb-4">
                        Please upload a clear photo of yourself. This will be used for your player profile.
                      </p>
                      
                      <div className="flex flex-col sm:flex-row gap-4 items-start">
                        {/* Photo Preview */}
                        {photoPreview ? (
                          <div className="relative">
                            <img
                              src={photoPreview}
                              alt="Photo preview"
                              className="w-32 h-32 rounded-2xl object-cover border border-slate-200 shadow-sm"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setPhotoFile(null)
                                setPhotoPreview(null)
                              }}
                              className="absolute -top-2 -right-2 w-6 h-6 bg-rose-505 text-white rounded-full flex items-center justify-center hover:bg-rose-600 transition-colors"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <div className="w-32 h-32 rounded-2xl border border-dashed border-slate-200 flex items-center justify-center bg-slate-50/50">
                            <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        
                        {/* Upload Button */}
                        <div className="flex-1">
                          <label className="cursor-pointer inline-flex items-center px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-900 text-white text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handlePhotoChange}
                              className="hidden"
                            />
                            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            {photoFile ? 'Change Photo' : 'Upload Photo'}
                          </label>
                          <p className="text-[9px] text-slate-400 font-bold mt-2 uppercase tracking-wider">
                            Max 5MB • JPG, PNG, GIF
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Season Registration Information */}
                    <div className="mt-4 bg-blue-50/60 border border-blue-200/30 text-blue-700 p-4 rounded-xl font-mono">
                      <div className="flex items-start space-x-3">
                        <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <div className="flex-1">
                          <h4 className="text-xs uppercase font-extrabold text-blue-900 mb-2">Season Registration</h4>
                          <p className="text-[10px] uppercase font-bold text-blue-700 leading-relaxed mb-2">
                            By registering, you are signing up for this season:
                          </p>
                          <ul className="text-[10px] uppercase font-bold text-blue-700 space-y-1 ml-4">
                            <li className="flex items-center">
                              <Check className="w-4 h-4 text-emerald-550 inline mr-2" />
                              <strong>{season?.name || 'Current Season'}</strong>
                            </li>
                          </ul>
                          <p className="text-[9px] uppercase font-bold text-blue-600 mt-2 italic">
                            You are registering for this season only
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={handleConfirm}
                      disabled={submitting || uploadingPhoto}
                      className="w-full mt-4 py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all shadow-sm hover:-translate-y-0.5 active:translate-y-0 text-xs uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {uploadingPhoto ? 'Uploading Photo...' : submitting ? 'Submitting...' : 'Complete Registration'}
                    </button>
                  </div>
                )}

                {/* Show confirm button for existing player with complete details */}
                {player && !showForm && (
                  <div className="bg-amber-500/[0.02] rounded-xl p-6 border border-amber-500/10 font-mono space-y-6">
                    <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Your Player Profile</h3>
                    <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 space-y-3">
                      <div className="flex justify-between text-xs uppercase font-bold">
                        <span className="text-slate-500">Player ID:</span>
                        <span className="text-slate-800">{player.player_id}</span>
                      </div>
                      <div className="flex justify-between text-xs uppercase font-bold">
                        <span className="text-slate-500">Name:</span>
                        <span className="text-slate-800">{player.name}</span>
                      </div>
                      {player.place && (
                        <div className="flex justify-between text-xs uppercase font-bold">
                          <span className="text-slate-500">District:</span>
                          <span className="text-slate-800">{player.place}</span>
                        </div>
                      )}
                      {player.previous_season_team && (
                        <>
                          <div className="flex justify-between border-t border-slate-200/60 pt-3 mt-3 text-xs uppercase font-bold">
                            <span className="text-slate-500">Previous Team:</span>
                            <span className="text-slate-800">{player.previous_season_team}</span>
                          </div>
                          {player.previous_season_category && (
                            <div className="flex justify-between text-xs uppercase font-bold">
                              <span className="text-slate-500">Previous Category:</span>
                              <span className="text-slate-800 capitalize">{player.previous_season_category}</span>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                    
                    {/* Smart Assist Option for Existing Players */}
                    {!isNewPlayer && (
                      <div className="bg-amber-500/[0.03] border border-amber-500/10 rounded-2xl p-5 mb-4">
                        <label className="block text-[10px] uppercase font-bold text-slate-500 mb-2">
                          Did you use Smart Assist in the last season? *
                          <span className="text-rose-500 font-extrabold ml-1">Required</span>
                        </label>
                        <select
                          value={usedSmartAssist}
                          onChange={(e) => setUsedSmartAssist(e.target.value)}
                          className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 rounded-xl text-xs font-bold uppercase tracking-wider text-slate-705"
                        >
                          <option value="">Select option...</option>
                          <option value="yes">Yes</option>
                          <option value="no">No</option>
                          <option value="partially">Partially (Used for some time last season)</option>
                          <option value="didnt_play">Didn't play last season</option>
                        </select>
                      </div>
                    )}

                    {/* Photo Upload - Required for all players */}
                    <div className="bg-amber-500/[0.02] border border-amber-500/10 rounded-2xl p-6 mt-4">
                      <label className="block text-[10px] uppercase font-bold text-slate-500 mb-3">
                        Player Photo *
                        <span className="text-rose-500 font-extrabold ml-1">Required</span>
                      </label>
                      <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider leading-relaxed mb-4">
                        Please upload a clear photo of yourself. This will be used for your player profile.
                      </p>
                      
                      <div className="flex flex-col sm:flex-row gap-4 items-start">
                        {/* Photo Preview */}
                        {photoPreview ? (
                          <div className="relative">
                            <img
                              src={photoPreview}
                              alt="Photo preview"
                              className="w-32 h-32 rounded-2xl object-cover border border-slate-200 shadow-sm"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                setPhotoFile(null)
                                setPhotoPreview(null)
                              }}
                              className="absolute -top-2 -right-2 w-6 h-6 bg-rose-500 text-white rounded-full flex items-center justify-center hover:bg-rose-600 transition-colors font-bold"
                            >
                              ×
                            </button>
                          </div>
                        ) : (
                          <div className="w-32 h-32 rounded-2xl border border-dashed border-slate-200 flex items-center justify-center bg-slate-50/50">
                            <svg className="w-10 h-10 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          </div>
                        )}
                        
                        {/* Upload Button */}
                        <div className="flex-1">
                          <label className="cursor-pointer inline-flex items-center px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-900 text-white text-[10px] font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm">
                            <input
                              type="file"
                              accept="image/*"
                              onChange={handlePhotoChange}
                              className="hidden"
                            />
                            <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                            </svg>
                            {photoFile ? 'Change Photo' : 'Upload Photo'}
                          </label>
                          <p className="text-[9px] text-slate-400 font-bold mt-2 uppercase tracking-wider">
                            Max 5MB • JPG, PNG, GIF
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    {/* Season Registration Information */}
                    <div className="mt-4 bg-blue-50/60 border border-blue-200/30 text-blue-700 p-4 rounded-xl font-mono">
                      <div className="flex items-start space-x-3">
                        <svg className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <div className="flex-1">
                          <h4 className="text-xs uppercase font-extrabold text-blue-900 mb-2">Season Registration</h4>
                          <p className="text-[10px] uppercase font-bold text-blue-700 leading-relaxed mb-2">
                            By registering, you are signing up for this season:
                          </p>
                          <ul className="text-[10px] uppercase font-bold text-blue-700 space-y-1 ml-4">
                            <li className="flex items-center">
                              <Check className="w-4 h-4 text-emerald-550 inline mr-2" />
                              <strong>{season?.name || 'Current Season'}</strong>
                            </li>
                          </ul>
                          <p className="text-[9px] uppercase font-bold text-blue-600 mt-2 italic">
                            You are registering for this season only
                          </p>
                        </div>
                      </div>
                    </div>
                    
                    <button
                      onClick={handleConfirm}
                      disabled={submitting || uploadingPhoto}
                      className="w-full py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all shadow-sm hover:-translate-y-0.5 active:translate-y-0 text-xs uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed mt-4"
                    >
                      {uploadingPhoto ? 'Uploading Photo...' : submitting ? 'Registering...' : 'Confirm Registration'}
                    </button>
                  </div>
                )}
              </>
            )}

            {success && (
              <div className="mt-4 p-4 bg-green-50 border border-green-200/40 text-green-800 rounded-xl text-xs uppercase font-bold tracking-wider flex items-center gap-2 font-mono">
                <svg className="w-4 h-4 text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{success}</span>
              </div>
            )}
            
            {error && (
              <div className="mt-4 p-4 bg-rose-50 border border-rose-200/40 text-rose-800 rounded-xl text-xs uppercase font-bold tracking-wider flex items-center gap-2 font-mono">
                <svg className="w-4 h-4 text-rose-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <div className="mt-6">
              <button
                onClick={handleBack}
                disabled={submitting}
                className="w-full py-2.5 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/60 font-bold rounded-xl transition-all text-xs uppercase tracking-wider hover:-translate-y-0.5 active:translate-y-0"
              >
                {"<-"} Back to Player Selection
              </button>
            </div>
          </div>

          <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 text-[10px] uppercase font-bold text-slate-400 text-center font-mono">
            Your information is securely managed by the committee
          </div>
        </div>
      </div>
    </div>
  )
}

export default function PlayerVerify() {
  return (
    <Suspense
      fallback={
        <div className="console-bg min-h-screen flex items-center justify-center relative">
          <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
          <div className="text-center relative z-10 font-mono">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
            <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading registration details...</p>
          </div>
        </div>
      }
    >
      <PlayerVerifyContent />
    </Suspense>
  )
}
