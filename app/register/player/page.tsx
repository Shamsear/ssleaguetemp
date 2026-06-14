'use client'

import { Suspense, useState, useEffect, useMemo, useCallback, memo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { db, auth } from '@/lib/firebase/config'
import { collection, doc, getDoc, query, where, getDocs, orderBy, limit } from 'firebase/firestore'
import { signInWithPopup, GoogleAuthProvider, onAuthStateChanged, signOut, User } from 'firebase/auth'

interface Season {
  id: string
  name: string
  is_player_registration_open: boolean
}

interface Player {
  id: string
  player_id: string
  name: string
  status: string
  status_text: string
}

// Memoized player row component for better performance
const PlayerRow = memo(({ player, onSelect }: { 
  player: Player; 
  onSelect: (playerId: string) => void 
}) => {
  const statusClass = 
    player.status === 'registered_current' ? 'bg-blue-50/60 text-blue-700 border border-blue-200/30' :
    player.status === 'registered_other' ? 'bg-amber-50/60 text-amber-700 border border-amber-200/30' :
    'bg-green-50/60 text-green-700 border border-green-200/30'
  
  const rowClass =
    player.status === 'registered_current' ? 'bg-blue-50/[0.03] hover:bg-blue-50/[0.1]' :
    player.status === 'registered_other' ? 'bg-amber-50/[0.03] hover:bg-amber-50/[0.1]' :
    'hover:bg-amber-500/[0.02] cursor-pointer'

  return (
    <tr className={`${rowClass} transition-colors font-mono`}>
      <td className="p-4 text-xs text-slate-500">
        <span className="px-2 py-0.5 bg-slate-50 text-slate-600 rounded border border-slate-200/40 text-[10px] font-mono">
          {player.player_id}
        </span>
      </td>
      <td className="p-4 text-xs font-bold text-slate-800 uppercase tracking-wide">{player.name}</td>
      <td className="p-4">
        <span className={`inline-flex px-2.5 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider ${statusClass}`}>
          {player.status_text}
        </span>
      </td>
      <td className="p-4 text-right">
        {player.status === 'available' ? (
          <button
            onClick={() => onSelect(player.player_id)}
            className="bg-slate-800 hover:bg-slate-700 border border-slate-900 text-white text-[10px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-xl transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer shadow-sm animate-pulse-slow"
          >
            Select
          </button>
        ) : (
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {player.status === 'registered_current' ? 'Registered' : 'Unavailable'}
          </span>
        )}
      </td>
    </tr>
  )
})

PlayerRow.displayName = 'PlayerRow'

function PlayerSearchContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const seasonId = searchParams.get('season')

  const [season, setSeason] = useState<Season | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [players, setPlayers] = useState<Player[]>([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [user, setUser] = useState<User | null>(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [signingIn, setSigningIn] = useState(false)
  const [success, setSuccess] = useState<string | null>(null)

  // Check auth state
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser)
      setAuthLoading(false)
    })
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const fetchSeason = async () => {
      if (!seasonId) {
        setError('No season specified')
        setLoading(false)
        return
      }

      try {
        // Fetch season info
        const seasonDoc = await fetch(`/api/cached/firebase/seasons?seasonId=${seasonId}`, {
          cache: 'default'
        }).then(r => r.json())

        if (!seasonDoc.success || !seasonDoc.data) {
          setError('Season not found')
          setLoading(false)
          return
        }

        const seasonData = seasonDoc.data as Season

        // Check registration status
        if (!seasonData.is_player_registration_open) {
          setError('Player registration is currently closed for this season')
          setLoading(false)
          return
        }

        setSeason(seasonData)
        setLoading(false)
      } catch (err) {
        console.error('Error fetching season:', err)
        setError('Failed to load registration')
        setLoading(false)
      }
    }

    fetchSeason()
  }, [seasonId])

  // Check if email already used for this season
  useEffect(() => {
    const checkEmailUsage = async () => {
      if (!user?.email || !seasonId) return

      try {
        const emailCheckQuery = query(
          collection(db, 'realplayers'),
          where('season_id', '==', seasonId),
          where('email', '==', user.email),
          where('is_registered', '==', true)
        )
        const emailCheckSnapshot = await getDocs(emailCheckQuery)

        if (!emailCheckSnapshot.empty) {
          setError(`This email (${user.email}) has already been used to register for this season`)
          await signOut(auth)
        }
      } catch (err) {
        console.error('Error checking email:', err)
      }
    }

    checkEmailUsage()
  }, [user, seasonId])

  const searchPlayers = useCallback(async (term: string) => {
    if (!seasonId) return

    // Only search if term has at least 2 characters
    if (term.trim().length < 2) {
      setPlayers([])
      return
    }

    setSearching(true)
    try {
      // Use API endpoint for optimized search with caching
      const response = await fetch(
        `/api/players/search?term=${encodeURIComponent(term)}&seasonId=${seasonId}&limit=20`,
        {
          // Let browser cache identical searches
          cache: 'default'
        }
      )
      
      if (!response.ok) {
        throw new Error('Failed to search players')
      }
      
      const { players: searchResults } = await response.json()
      setPlayers(searchResults || [])
    } catch (err) {
      console.error('Error searching players:', err)
      setError('Failed to search players')
      setPlayers([])
    } finally {
      setSearching(false)
    }
  }, [seasonId])

  // Add debounce state - optimized to 100ms for instant feel
  useEffect(() => {
    if (searchTerm.length < 2) {
      setPlayers([])
      return
    }

    // Reduced debounce to 100ms for faster response
    const timer = setTimeout(() => {
      searchPlayers(searchTerm)
    }, 100)

    return () => clearTimeout(timer)
  }, [searchTerm, seasonId])

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value)
  }

  const handleSelectPlayer = useCallback((playerId: string) => {
    router.push(`/register/player/verify?season=${seasonId}&player=${playerId}`)
  }, [router, seasonId])

  const handleGoogleSignIn = async () => {
    setSigningIn(true)
    setError(null)

    try {
      const provider = new GoogleAuthProvider()
      await signInWithPopup(auth, provider)
      setSuccess('✅ Signed in successfully!')
    } catch (err: any) {
      console.error('Sign in error:', err)
      if (err.code === 'auth/popup-closed-by-user') {
        setError('Sign-in cancelled. Please try again.')
      } else if (err.code === 'auth/popup-blocked') {
        setError('Pop-up blocked. Please allow pop-ups and try again.')
      } else {
        setError('Failed to sign in with Google. Please try again.')
      }
    } finally {
      setSigningIn(false)
    }
  }

  const handleSignOut = async () => {
    try {
      await signOut(auth)
      setSuccess(null)
      setSearchTerm('')
      setPlayers([])
    } catch (err) {
      console.error('Sign out error:', err)
    }
  }
  if (loading || authLoading) {
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

  if (error) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative px-4">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-8 max-w-md w-full mx-auto text-center relative z-10 font-mono">
          <div className="text-rose-500 mb-4">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider mb-2">Registration Unavailable</h2>
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
        {/* Header */}
        <div className="console-card bg-white rounded-2xl p-6 shadow-sm border border-slate-200/60 overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100">
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
            
            <button
              onClick={() => router.push('/')}
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all text-xs uppercase tracking-wider font-bold cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back Home</span>
            </button>
          </div>

          {/* Step 1: Google Sign-in */}
          {!user ? (
            <div className="bg-gradient-to-r from-blue-50/50 to-cyan-50/50 rounded-xl p-6 border border-blue-200/40 text-slate-850">
              <h3 className="text-xs uppercase font-bold text-slate-505 tracking-wider mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600 flex-shrink-0" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Step 1: Sign in with Gmail
              </h3>
              
              <div className="bg-blue-50/60 border border-blue-200/30 text-blue-700 p-4 rounded-xl mb-4 font-mono">
                <p className="text-xs uppercase font-extrabold mb-1">
                  🔒 Secure Authentication Required
                </p>
                <p className="text-[10px] uppercase font-bold leading-relaxed">
                  Sign in with your Gmail account to begin registration.
                </p>
              </div>
              
              <button
                onClick={handleGoogleSignIn}
                disabled={signingIn}
                className="w-full py-3 px-4 bg-white border border-slate-200 hover:border-amber-400/40 hover:text-amber-600 text-slate-700 font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2.5 text-xs uppercase tracking-wider cursor-pointer hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {signingIn ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-slate-700 border-t-transparent"></div>
                    <span>Signing in...</span>
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC04" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                    </svg>
                    <span>Sign in with Google</span>
                  </>
                )}
              </button>
            </div>
          ) : (
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

              {/* Step 2: Find Your Player Profile */}
              <div className="mb-6 font-mono text-slate-500">
                <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center">
                  <span className="w-6 h-6 bg-slate-800 text-white rounded-full flex items-center justify-center text-xs font-bold mr-2">2</span>
                  Find Your Player Profile
                </h2>
                <p className="text-[10px] uppercase font-bold tracking-wider leading-relaxed">
                  Search using your unique Player ID (e.g., sspslpsl001) or your full name to find your player profile.
                </p>
              </div>
            </>
          )}

          {/* Search Input - Only show if user is signed in */}
          {user && (
            <div className="mb-6 font-mono">
              <label htmlFor="search_term" className="block text-[10px] uppercase font-bold text-slate-500 mb-2">
                <svg className="w-4 h-4 inline mr-1 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Search for your Player Profile
              </label>
              <div className="relative">
                <input
                  type="text"
                  id="search_term"
                  value={searchTerm}
                  onChange={handleSearchChange}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500/80 text-xs font-bold uppercase tracking-wider"
                  placeholder="Start typing your Player ID (sspslpsl001) or Full Name"
                  autoComplete="off"
                />
                {searching && (
                  <div className="absolute right-3.5 top-1/2 transform -translate-y-1/2">
                    <svg className="w-5 h-5 text-amber-500 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                  </div>
                )}
              </div>
              <div className="mt-2 text-[9px] text-slate-400 uppercase tracking-wider font-bold space-y-1 leading-normal">
                <p><strong>Player ID format:</strong> sspslpsl001, sspslpsl002, etc.</p>
                <p><strong>Name search:</strong> Enter your full name as registered</p>
              </div>
            </div>
          )}
        </div>

        {/* Search Results - Only show if user is signed in */}
        {user && (
          <div className="console-card bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden">
            <div className="border-b border-slate-100 p-4 bg-slate-50 flex items-center justify-between">
              <h3 className="text-xs uppercase font-extrabold text-slate-800 tracking-wider flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Player Search Results
              </h3>
              <span className="px-2 py-0.5 bg-amber-50 text-amber-600 rounded border border-amber-200/40 text-[10px] font-mono font-bold">
                {players.length} FOUND
              </span>
            </div>
          
            <div className="max-h-[500px] overflow-y-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200/60 text-[10px] uppercase font-black tracking-wider text-slate-500 font-mono">
                    <th className="p-4 w-32">Player ID</th>
                    <th className="p-4">Name</th>
                    <th className="p-4">Status</th>
                    <th className="p-4 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs font-bold text-slate-700">
                  {players.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="p-12 text-center font-mono">
                        <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        <h3 className="text-base font-bold text-slate-800 uppercase tracking-wider mb-1">
                          {searchTerm.trim().length >= 2 ? 'No players found' : 'Ready to search'}
                        </h3>
                        <p className="text-xs text-slate-400 uppercase font-bold tracking-wider leading-relaxed">
                          {searchTerm.trim().length >= 2
                            ? 'Try adjusting your search terms'
                            : 'Enter at least 2 characters of your ID or Name above'}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    players.map((player) => (
                      <PlayerRow 
                        key={player.id} 
                        player={player} 
                        onSelect={handleSelectPlayer}
                      />
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Footer */}
        {user && (
          <div className="mt-6">
            <div className="console-card bg-white rounded-3xl p-6 border border-slate-200/60 font-mono shadow-sm">
              <div className="flex flex-col sm:flex-row items-start gap-4">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-amber-500/[0.08] text-amber-600 rounded-full flex items-center justify-center border border-amber-500/20">
                    <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                  </div>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-2">Can't find your profile?</h3>
                  <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider leading-relaxed mb-4">
                    If you're a new player and don't have a Player ID yet, you can register as a new player.
                  </p>
                  <button
                    onClick={() => router.push(`/register/player/verify?season=${seasonId}`)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all shadow-sm cursor-pointer hover:-translate-y-0.5 active:translate-y-0 text-xs uppercase tracking-wider"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
                    </svg>
                    Register as New Player
                  </button>
                  <p className="text-[9px] text-slate-400 uppercase tracking-wider font-bold mt-4 flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Already have a Player ID? Search above to find your profile.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Success/Error Messages */}
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
      </div>
    </div>
  )
}

export default function PlayerSearch() {
  return (
    <Suspense fallback={
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading player registration...</p>
        </div>
      </div>
    }>
      <PlayerSearchContent />
    </Suspense>
  )
}
