'use client';

import { Calendar, Clock, Star, Trophy, User, Users, Megaphone, Medal, Zap } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamRegistration } from '@/contexts/TeamRegistrationContext';
import { useTournamentContext } from '@/contexts/TournamentContext';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useEffect, useState, useMemo } from 'react';
import RegisteredTeamDashboard from './RegisteredTeamDashboard';
import { useCachedSeasons } from '@/hooks/useCachedFirebase';
import { useTeamHistory } from '@/hooks/useTeamHistory';
import { useDashboardWebSocket } from '@/hooks/useWebSocket';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

export default function TeamDashboard() {
  const { user, loading } = useAuth();
  const { setIsRegistered } = useTeamRegistration();
  const { setSeasonId } = useTournamentContext();
  const router = useRouter();
  const [seasonStatus, setSeasonStatus] = useState<{
    hasActiveSeason: boolean;
    isRegistered: boolean;
    seasonName?: string;
    seasonId?: string;
  } | null>(null);
  const [teamLogoUrl, setTeamLogoUrl] = useState<string>('');
  const [historicalStats, setHistoricalStats] = useState<any>(null);
  const [loadingStats, setLoadingStats] = useState(true);
  const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'overview' | 'seasons' | 'active'>('overview');
  const [activeSeasonDetails, setActiveSeasonDetails] = useState<any>(null);
  const [loadingActiveDetails, setLoadingActiveDetails] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [ownerName, setOwnerName] = useState<string>('');
  const [checkingRegistration, setCheckingRegistration] = useState(true);
  const [teamDocId, setTeamDocId] = useState<string>('');
  const [loadingTeamDoc, setLoadingTeamDoc] = useState(true);

  // [INFO] Enable WebSocket for real-time dashboard updates (wallet, notifications)
  // Note: seasonId will be available after seasonStatus is loaded
  const { isConnected } = useDashboardWebSocket(
    seasonStatus?.seasonId || null,
    user?.uid || null
  );

  // Set season ID in TournamentContext when it's loaded
  useEffect(() => {
    if (seasonStatus?.seasonId) {
      console.log('📝 Setting season ID in TournamentContext:', seasonStatus.seasonId);
      setSeasonId(seasonStatus.seasonId);
    }
  }, [seasonStatus?.seasonId, setSeasonId]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'team') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch team's historical stats from Neon (all seasons played)
  const { data: teamHistory, isLoading: teamHistoryLoading } = useTeamHistory(
    user?.role === 'team' ? user.uid : undefined
  );

  // Fetch current active season from Firebase
  const { data: activeSeasons, isLoading: activeSeasonsLoading } = useCachedSeasons(
    user?.role === 'team' ? { isActive: 'true' } : undefined
  );

  // Fetch team logo and owner name from teams collection
  useEffect(() => {
    const fetchTeamData = async () => {
      if (!user?.uid) {
        setLoadingTeamDoc(false);
        return;
      }

      try {
        const { db } = await import('@/lib/firebase/config');
        const { doc, getDoc, collection, query, where, getDocs } = await import('firebase/firestore');
        
        // Try to find the team document by userId, uid, or owner_uid
        const teamsRef = collection(db, 'teams');
        
        // Try userId first (primary field)
        let querySnapshot = await getDocs(query(teamsRef, where('userId', '==', user.uid)));
        
        // Fallback to uid if userId query returned empty
        if (querySnapshot.empty) {
          querySnapshot = await getDocs(query(teamsRef, where('uid', '==', user.uid)));
        }
        
        // Final fallback to owner_uid
        if (querySnapshot.empty) {
          querySnapshot = await getDocs(query(teamsRef, where('owner_uid', '==', user.uid)));
        }
        
        if (!querySnapshot.empty) {
          // Found team document
          const teamDoc = querySnapshot.docs[0];
          const teamData = teamDoc.data();
          console.log('[SUCCESS] Team document found:', teamDoc.id);
          console.log('Team data:', teamData);
          
          // Store team document ID for registration check
          setTeamDocId(teamDoc.id);
          
          // Set owner name from team document
          const ownerNameValue = teamData.owner_name || teamData.ownerName || teamData.owner;
          if (ownerNameValue) {
            setOwnerName(ownerNameValue);
            console.log('[SUCCESS] Owner name set to:', ownerNameValue);
          }
          
          // Set logo URL from team document or user data
          const logoUrl = teamData.team_logo || teamData.teamLogo || teamData.logo_url || teamData.logoUrl;
          if (logoUrl) {
            setTeamLogoUrl(logoUrl);
            console.log('[SUCCESS] Team logo set from team document');
          } else if (user.teamLogoUrl) {
            setTeamLogoUrl(user.teamLogoUrl);
            console.log('[SUCCESS] Team logo set from user data');
          }
        } else {
          console.log('[WARNING] No team document found for userId:', user.uid);
          // Fallback to user data if no team document
          if (user.teamLogoUrl) {
            setTeamLogoUrl(user.teamLogoUrl);
          }
        }
      } catch (error) {
        console.error('[ERROR] Error fetching team data:', error);
        // Fallback to user data
        if (user.teamLogoUrl) {
          setTeamLogoUrl(user.teamLogoUrl);
        }
      } finally {
        setLoadingTeamDoc(false);
      }
    };

    fetchTeamData();
  }, [user]);

  // Handle logo upload using ImageKit
  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('File size must be less than 5MB');
      return;
    }

    try {
      setUploadingLogo(true);

      // Upload to ImageKit
      const { uploadImage } = await import('@/lib/imagekit/upload');
      
      const timestamp = Date.now();
      const fileName = `${user.uid}_${timestamp}_${file.name}`;
      
      const result = await uploadImage({
        file,
        fileName,
        folder: '/team-logos',
        tags: ['team', 'logo', user.uid],
        useUniqueFileName: true,
      });

      // Update Firestore with ImageKit URL and fileId
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase/config');
      
      // Update users collection
      await updateDoc(doc(db, 'users', user.uid), {
        logoUrl: result.url,
        logoFileId: result.fileId, // Store for deletion later
        updatedAt: new Date()
      });

      // Update teams collection (need to find team ID first)
      try {
        const { getDoc } = await import('firebase/firestore');
        const userDocData = await getDoc(doc(db, 'users', user.uid));
        const teamId = userDocData.data()?.teamId;
        
        if (teamId) {
          await updateDoc(doc(db, 'teams', teamId), {
            logo_url: result.url,
            updated_at: new Date()
          });
        } else {
          console.log('No team ID found in user document');
        }
      } catch (teamError) {
        console.log('Team document may not exist yet, will be created on season registration');
      }

      setTeamLogoUrl(result.url);
      alert('Team logo uploaded successfully!');
    } catch (error) {
      console.error('Error uploading logo:', error);
      alert('Failed to upload logo. Please try again.');
    } finally {
      setUploadingLogo(false);
    }
  };

  // Process data to determine season status
  useEffect(() => {
    if (!user || user.role !== 'team' || teamHistoryLoading || activeSeasonsLoading || loadingTeamDoc) {
      return;
    }

    const checkRegistrationStatus = async () => {
      setCheckingRegistration(true);
      try {
        console.log('[DEBUG] Season Status Debug:', {
          userId: user.uid,
          teamHistory: teamHistory,
          teamHistoryCount: teamHistory?.length || 0,
          activeSeasons: activeSeasons,
          activeSeasonsCount: activeSeasons?.length || 0
        });
        
        // Get active season (only if it exists)
        const activeSeason = activeSeasons && Array.isArray(activeSeasons) && activeSeasons.length > 0 
          ? activeSeasons[0] 
          : null;
        
        console.log('Active season:', activeSeason ? activeSeason.name : 'NONE');
        
        if (!activeSeason) {
          // No active season available
          setSeasonStatus({
            hasActiveSeason: false,
            isRegistered: false,
          });
          console.log('[INFO] Status: No active season');
          setCheckingRegistration(false);
          return;
        }

        // First check Neon teamstats (already loaded, fast)
        const registeredInNeon = teamHistory?.find(
          (ts: any) => ts.season_id === activeSeason.id
        );
        
        console.log('[DEBUG] Neon check:', { registeredInNeon: !!registeredInNeon });
        
        let isRegistered = !!registeredInNeon;
        
        // If not found in Neon, check Firebase team_seasons as fallback
        if (!isRegistered) {
          const { db } = await import('@/lib/firebase/config');
          const { doc, getDoc } = await import('firebase/firestore');
          
          // Try both possible team_season IDs in parallel (userId and team doc ID)
          const teamSeasonId1 = `${user.uid}_${activeSeason.id}`;
          const teamSeasonId2 = teamDocId 
            ? `${teamDocId}_${activeSeason.id}` 
            : (teamHistory && teamHistory.length > 0 
                ? `${teamHistory[0].team_id}_${activeSeason.id}` 
                : null);
          
          console.log('[DEBUG] Firebase fallback check:', { teamSeasonId1, teamSeasonId2, teamDocId });
          
          const queries = [getDoc(doc(db, 'team_seasons', teamSeasonId1))];
          if (teamSeasonId2 && teamSeasonId2 !== teamSeasonId1) {
            queries.push(getDoc(doc(db, 'team_seasons', teamSeasonId2)));
          }
          
          const results = await Promise.all(queries);
          const teamSeasonDoc = results.find(doc => doc.exists());
          
          if (teamSeasonDoc) {
            isRegistered = teamSeasonDoc.data()?.status === 'registered';
            console.log('[INFO] Firebase result:', { exists: true, status: teamSeasonDoc.data()?.status });
          } else {
            console.log('[INFO] Firebase result: No document found');
          }
        }
        
        console.log('[SUCCESS] Final registration status:', {
          userId: user.uid,
          seasonId: activeSeason.id,
          registeredInNeon: !!registeredInNeon,
          finalIsRegistered: isRegistered
        });

        if (isRegistered) {
          // Registered in active season
          setSeasonStatus({
            hasActiveSeason: true,
            isRegistered: true,
            seasonName: activeSeason.name,
            seasonId: activeSeason.id,
          });
          setIsRegistered(true); // Notify context
          console.log('[SUCCESS] Status: Registered in active season');
        } else {
          // Active season exists but not registered
          setSeasonStatus({
            hasActiveSeason: true,
            isRegistered: false,
            seasonName: activeSeason.name,
            seasonId: activeSeason.id,
          });
          setIsRegistered(false); // Notify context - HIDE NAVIGATION
          console.log('[INFO] Status: Active season available, not registered');
        }
      } catch (err) {
        console.error('Error processing season status:', err);
        setSeasonStatus({
          hasActiveSeason: false,
          isRegistered: false,
        });
      } finally {
        setCheckingRegistration(false);
      }
    };

    checkRegistrationStatus();
  }, [user, teamHistory, activeSeasons, teamHistoryLoading, activeSeasonsLoading, teamDocId, loadingTeamDoc]);

  // Fetch historical stats
  useEffect(() => {
    const fetchHistoricalStats = async () => {
      if (!user || user.role !== 'team' || !seasonStatus) return;
      
      try {
        setLoadingStats(true);
        const queryParams = seasonStatus.seasonId 
          ? `?season_id=${seasonStatus.seasonId}` 
          : '';
        const response = await fetchWithTokenRefresh(`/api/team/historical-stats${queryParams}`);
        const data = await response.json();
        
        if (data.success) {
          setHistoricalStats(data.data);
        }
      } catch (error) {
        console.error('Error fetching historical stats:', error);
      } finally {
        setLoadingStats(false);
      }
    };
    
    fetchHistoricalStats();
  }, [user, seasonStatus]);

  // Fetch active season details
  const fetchActiveSeasonDetails = async () => {
    if (!seasonStatus?.seasonId) return;
    
    try {
      setLoadingActiveDetails(true);
      const response = await fetchWithTokenRefresh(`/api/seasons/${seasonStatus.seasonId}/details`);
      const data = await response.json();
      
      if (data.success) {
        setActiveSeasonDetails(data.data);
      }
    } catch (error) {
      console.error('Error fetching active season details:', error);
    } finally {
      setLoadingActiveDetails(false);
    }
  };

  const toggleSeason = (seasonId: string) => {
    setExpandedSeasons(prev => {
      const newSet = new Set(prev);
      if (newSet.has(seasonId)) {
        newSet.delete(seasonId);
      } else {
        newSet.add(seasonId);
      }
      return newSet;
    });
  };

  const isCheckingStatus = teamHistoryLoading || activeSeasonsLoading || checkingRegistration || loadingTeamDoc;

  if (loading || isCheckingStatus) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#0066FF] mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'team') {
    return null;
  }

  // Show unassigned dashboard if no active season or not registered
  if (!seasonStatus?.hasActiveSeason || !seasonStatus?.isRegistered) {
    return (
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
        {/* Decorative eSports glowing ambient overlay */}
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

        <div className="max-w-7xl mx-auto relative z-10 space-y-8">
          {/* Team Header */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex flex-col sm:flex-row items-center gap-6 w-full md:w-auto">
              {/* Editable Logo */}
              <div className="relative group flex-shrink-0">
                <input
                  type="file"
                  id="logo-upload"
                  accept="image/*"
                  onChange={handleLogoUpload}
                  disabled={uploadingLogo}
                  className="hidden"
                />
                <label
                  htmlFor="logo-upload"
                  className="cursor-pointer block relative"
                  title="Click to change logo"
                >
                  {teamLogoUrl && teamLogoUrl !== 'skip' ? (
                    <div className="relative w-20 h-20 bg-white rounded-3xl flex items-center justify-center border border-slate-200 shadow-sm">
                      <img 
                        src={teamLogoUrl}
                        alt="Team logo" 
                        className="max-w-full max-h-full object-contain p-2 group-hover:opacity-75 transition-opacity"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 rounded-3xl bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        {uploadingLogo ? (
                          <svg className="animate-spin w-6 h-6 text-white" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                        ) : (
                          <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="w-20 h-20 rounded-3xl bg-amber-50 border border-amber-100 flex items-center justify-center group-hover:bg-amber-100 transition-all">
                      <span className="text-2xl font-bold text-amber-600">{user.teamName?.[0]?.toUpperCase() || 'T'}</span>
                    </div>
                  )}
                </label>
                <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-amber-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </div>
              </div>

              <div className="text-center sm:text-left">
                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">TEAM PROFILE</span>
                <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                  {user.teamName || 'My Team'}
                </h1>
                <p className="text-xs text-slate-500 font-mono mt-1">
                  Owner: <span className="font-bold text-slate-700">{ownerName || user.username || user.email?.split('@')[0] || 'Team Owner'}</span>
                </p>
                <div className="mt-3">
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-mono font-bold bg-amber-50 border border-amber-200 text-amber-800 uppercase tracking-wide">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" /> REGISTERED TEAM
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Logo Upload Tip - Show if no logo */}
          {(!teamLogoUrl || teamLogoUrl === '') && (
            <div className="p-4 bg-amber-50/50 border-l-2 border-amber-500 rounded text-xs text-slate-600 font-medium">
              <span className="font-bold text-amber-800">TIP:</span> Click on your team icon to upload a logo (Max 5MB • JPG, PNG)
            </div>
          )}

          {/* No Active Season */}
          {!seasonStatus?.hasActiveSeason && (
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                  <Megaphone className="w-5 h-5 text-amber-600" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 leading-tight">No Active Season</h3>
                  <p className="text-xs text-slate-400 font-mono uppercase mt-0.5">Waiting for new season to begin</p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-3">
                <p className="text-xs text-slate-500 leading-relaxed font-sans">
                  There is currently no active season. The committee will start a new season soon.
                </p>
                <div className="flex items-center text-xs font-mono font-bold text-slate-400">
                  <span className="inline-flex items-center px-2 py-0.5 rounded bg-slate-200 text-slate-600 mr-2 uppercase">
                    <Clock className="w-4 h-4 text-slate-500" /> WAITING
                  </span>
                  <span>Check back later for updates</span>
                </div>
              </div>

              <div className="flex items-center space-x-3">
                <button
                  onClick={() => window.location.reload()}
                  className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  Refresh Status
                </button>
              </div>
            </div>
          )}

          {/* Season Registration Open */}
          {seasonStatus?.hasActiveSeason && !seasonStatus?.isRegistered && (
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-xl">
                  <Trophy className="w-4 h-4 text-amber-500 fill-amber-500" />
                </div>
                <div>
                  <h3 className="text-lg font-extrabold text-slate-900 leading-tight">Season Registration Available!</h3>
                  <p className="text-xs text-slate-400 font-mono uppercase mt-0.5">Contact admin to join the active season</p>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 space-y-3">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <div>
                    <h4 className="font-extrabold text-slate-900 text-base">{seasonStatus.seasonName}</h4>
                    <p className="text-xs text-slate-500 font-sans mt-0.5">An active season is available for registration</p>
                    <div className="flex items-center mt-2 text-xs font-mono font-bold">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 mr-2 uppercase">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-ping"></span>
                        ACTIVE
                      </span>
                      <span className="text-slate-400">Contact committee to register</span>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <Medal className="w-8 h-8 text-amber-500 fill-amber-500/20" />
                  </div>
                </div>
              </div>

              <div className="p-4 bg-amber-50/50 border-l-2 border-amber-500 rounded text-xs text-slate-600 font-medium">
                <span className="font-bold text-amber-800">ACTION REQUIRED:</span> Please contact the committee administrator to register your team for this season.
              </div>

              <div className="flex flex-col sm:flex-row gap-3 items-center">
                <button
                  onClick={() => window.location.reload()}
                  className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-600 font-mono font-bold text-xs uppercase tracking-wider cursor-pointer"
                >
                  Check Registration
                </button>
                {seasonStatus?.seasonId && (
                  <Link
                    href={`/register/team?season=${seasonStatus.seasonId}`}
                    className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-mono font-bold text-xs uppercase tracking-wider"
                  >
                    Go to Registration {"->"}
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Tab Navigation */}
          <div className="bg-white border border-slate-200/60 rounded-3xl p-2 shadow-sm">
            <div className="flex space-x-2">
              <button
                onClick={() => setActiveTab('overview')}
                className={`flex-1 px-6 py-3 rounded-2xl font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                  activeTab === 'overview'
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('seasons')}
                className={`flex-1 px-6 py-3 rounded-2xl font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                  activeTab === 'seasons'
                    ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
                }`}
              >
                Seasons History
              </button>
              {seasonStatus?.hasActiveSeason && (
                <button
                  onClick={() => {
                    setActiveTab('active');
                    if (!activeSeasonDetails) fetchActiveSeasonDetails();
                  }}
                  className={`flex-1 px-6 py-3 rounded-2xl font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                    activeTab === 'active'
                      ? 'bg-amber-600 text-white shadow-md shadow-amber-600/10'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-600'
                  }`}
                >
                  Active Season
                </button>
              )}
            </div>
          </div>

          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-8">
              {/* Team Statistics Overview */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm hover:border-amber-400/40 transition-all duration-250 group">
                  <div className="p-4 flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-xl">
                      <Calendar className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">Seasons Played</span>
                      <h3 className="text-3xl font-black text-amber-600 font-mono mt-1">
                        {loadingStats ? '...' : (historicalStats?.summary?.totalSeasons || 0)}
                      </h3>
                    </div>
                  </div>
                </div>

                <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm hover:border-amber-400/40 transition-all duration-250 group">
                  <div className="p-4 flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-xl">
                      <Users className="w-4 h-4 text-slate-500" />
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">Total Players</span>
                      <h3 className="text-3xl font-black text-amber-600 font-mono mt-1">
                        {loadingStats ? '...' : (historicalStats?.summary?.totalPlayers || 0)}
                      </h3>
                    </div>
                  </div>
                </div>

                <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm hover:border-amber-400/40 transition-all duration-250 group">
                  <div className="p-4 flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center text-xl">
                      <Trophy className="w-4 h-4 text-amber-500 fill-amber-500" />
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">Championships</span>
                      <h3 className="text-3xl font-black text-amber-600 font-mono mt-1">
                        {loadingStats ? '...' : (historicalStats?.summary?.championships || 0)}
                      </h3>
                    </div>
                  </div>
                </div>

                <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm hover:border-amber-400/40 transition-all duration-250 group">
                  <div className="p-4 flex items-center justify-between">
                    <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                      <Zap className="w-5 h-5 text-amber-500 fill-amber-500/20" />
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">Win Rate</span>
                      <h3 className="text-3xl font-black text-amber-600 font-mono mt-1">
                        {loadingStats ? '...' : `${historicalStats?.summary?.winRate || 0}%`}
                      </h3>
                    </div>
                  </div>
                </div>
              </div>

              {/* Historical Performance */}
              {!loadingStats && historicalStats && historicalStats.summary.totalSeasons > 0 && (
                <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-6">
                  <h3 className="text-lg font-extrabold text-slate-900 uppercase tracking-tight flex items-center gap-2 border-b border-slate-100 pb-3">
                    <span>Performance Summary</span>
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 font-mono">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Matches Played</p>
                      <p className="text-xl font-extrabold text-slate-800 mt-1">{historicalStats.summary.totalMatches}</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 font-mono">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Wins / Draws / Losses</p>
                      <p className="text-xl font-extrabold text-slate-800 mt-1">
                        <span className="text-emerald-600">{historicalStats.summary.totalWins}</span>W / 
                        <span className="text-amber-600">{historicalStats.summary.totalDraws}</span>D / 
                        <span className="text-rose-600">{historicalStats.summary.totalLosses}</span>L
                      </p>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 font-mono">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Goals For / Against</p>
                      <p className="text-xl font-extrabold text-slate-800 mt-1">
                        {historicalStats.summary.totalGoalsScored} / {historicalStats.summary.totalGoalsConceded}
                      </p>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 font-mono">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Total Points</p>
                      <p className="text-xl font-extrabold text-slate-800 mt-1">{historicalStats.summary.totalPoints}</p>
                    </div>
                  </div>
                  {/* Trophies Section - Beautiful cards style */}
                  {historicalStats.trophies && historicalStats.trophies.length > 0 ? (
                    <div className="p-4 bg-amber-50/10 border border-amber-200/40 rounded-2xl space-y-4">
                      <p className="text-xs font-mono font-bold text-amber-800 uppercase tracking-wider flex items-center gap-1.5">
                        <span><Trophy className="w-4 h-4 text-amber-500 fill-amber-500" /></span> TROPHY CABINET
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {historicalStats.trophies.map((trophy: any) => {
                          const trophyPosLower = trophy.trophy_position?.toLowerCase() || '';
                          const isTrophyChampion = trophy.position === 1 || trophyPosLower === 'winner' || trophyPosLower.startsWith('winner') || trophyPosLower.includes('champion');
                          const isTrophyRunnerUp = trophy.position === 2 || trophyPosLower.includes('runner');
                          const isTrophyThird = trophy.position === 3 || trophyPosLower.includes('third');
                          const trophyNameLower = trophy.trophy_name?.toLowerCase() || '';
                          let trophyCardLabel = 'Trophy';
                          if (trophyNameLower.includes('shield')) trophyCardLabel = 'Shield';
                          else if (trophyNameLower.includes('cup')) trophyCardLabel = 'Cup';
                          else if (trophyNameLower.includes('league')) trophyCardLabel = 'League';
                          else if (trophyNameLower.includes('fantasy')) trophyCardLabel = 'Fantasy';
                          const trophyCardClass = isTrophyChampion ? 'fut-card-gold' : isTrophyRunnerUp ? 'fut-card-silver' : isTrophyThird ? 'fut-card-bronze' : 'fut-card-gold';
                          const trophyIconColor = isTrophyChampion ? 'text-amber-500' : isTrophyRunnerUp ? 'text-slate-400' : isTrophyThird ? 'text-amber-700' : 'text-amber-500';
                          const seasonLabel = trophy.season_id ? `Season ${trophy.season_id.replace('SSPSLS', '')}` : '';

                          return (
                            <div key={trophy.id} className={`fut-card ${trophyCardClass} p-4 flex flex-col justify-between`}>
                              <div className="flex justify-between items-start">
                                <span className="text-[8px] font-mono text-slate-400 uppercase block">{trophyCardLabel}</span>
                                <Trophy className={`w-4 h-4 ${trophyIconColor}`} />
                              </div>
                              <div className="text-center py-2">
                                <Trophy className={`w-9 h-9 mx-auto mb-1.5 ${trophyIconColor}`} />
                                <h4 className="font-bold text-slate-900 text-xs text-center mx-auto px-2">{trophy.trophy_name}</h4>
                                {seasonLabel && <p className="text-[9px] text-slate-500 font-mono mt-0.5">{seasonLabel}</p>}
                              </div>
                              <div className="border-t border-slate-200/50 pt-2 flex justify-between items-center text-[8px] font-mono">
                                <span className="text-slate-400">RANK:</span>
                                <span className={`font-bold uppercase ${isTrophyChampion ? 'text-amber-700' : isTrophyRunnerUp ? 'text-slate-700' : 'text-slate-600'}`}>
                                  {trophy.trophy_position || `#${trophy.position}`}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    historicalStats.summary.cups > 0 && (
                      <div className="p-4 bg-amber-50/50 border border-amber-200/60 rounded-2xl">
                        <p className="text-xs font-mono font-bold text-amber-800 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                          <span><Trophy className="w-4 h-4 text-amber-500 fill-amber-500" /></span> TROPHY CABINET
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {historicalStats.summary.championships > 0 && (
                            <span className="px-3 py-1 bg-amber-100 border border-amber-200 text-amber-800 rounded-full text-xs font-mono font-bold uppercase">
                              <Trophy className="w-4 h-4 text-amber-500 fill-amber-500" /> {historicalStats.summary.championships} Championship{historicalStats.summary.championships > 1 ? 's' : ''}
                            </span>
                          )}
                          {historicalStats.summary.runnerUps > 0 && (
                            <span className="px-3 py-1 bg-slate-100 border border-slate-200 text-slate-700 rounded-full text-xs font-mono font-bold uppercase">
                              <Trophy className="w-4 h-4 text-slate-400 fill-slate-400" /> {historicalStats.summary.runnerUps} Runner-up{historicalStats.summary.runnerUps > 1 ? 's' : ''}
                            </span>
                          )}
                          {historicalStats.summary.cups > 0 && (
                            <span className="px-3 py-1 bg-blue-50 border border-blue-200 text-blue-700 rounded-full text-xs font-mono font-bold uppercase">
                              <Trophy className="w-4 h-4 text-amber-500 fill-amber-500" /> {historicalStats.summary.cups} Cup{historicalStats.summary.cups > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  )}
                </div>
              )}

              {/* Current Season Info */}
              {!loadingStats && historicalStats?.currentSeason && (
                <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-6">
                  <h3 className="text-lg font-extrabold text-slate-900 uppercase tracking-tight flex items-center gap-2 border-b border-slate-100 pb-3">
                    <span>Current Season Status</span>
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 font-mono">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Status</p>
                      <p className="text-base font-extrabold text-emerald-600 uppercase tracking-wider mt-1">{historicalStats.currentSeason.status}</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 font-mono">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Players Registered</p>
                      <p className="text-base font-extrabold text-slate-800 mt-1">{historicalStats.currentSeason.registeredPlayers}</p>
                    </div>
                    <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 font-mono">
                      <p className="text-[10px] text-slate-400 font-bold uppercase">Balance</p>
                      <p className="text-base font-extrabold text-amber-600 mt-1">eCoin {historicalStats.currentSeason.balance?.toLocaleString() || 0}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Seasons History Tab */}
          {activeTab === 'seasons' && !loadingStats && historicalStats && (
            <div className="space-y-4">
              {historicalStats.teamStats && historicalStats.teamStats.length > 0 ? (
                historicalStats.teamStats.map((teamSeason: any) => {
                  const isExpanded = expandedSeasons.has(teamSeason.season_id);
                  const seasonPlayers = historicalStats.playerStats.filter(
                    (p: any) => p.season_id === teamSeason.season_id
                  );
                  const seasonTrophies = historicalStats.trophies?.filter(
                    (t: any) => t.season_id === teamSeason.season_id
                  ) || [];

                  return (
                    <div key={teamSeason.id} className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm">
                      {/* Season Header */}
                      <button
                        onClick={() => toggleSeason(teamSeason.season_id)}
                        className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-all cursor-pointer"
                      >
                        <div className="flex items-center space-x-4">
                          <div className="w-12 h-12 rounded-2xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                            <span className="text-lg font-black text-amber-600 font-mono">#{teamSeason.position || '-'}</span>
                          </div>
                          <div className="text-left">
                            <h3 className="font-extrabold text-slate-900 text-base">
                              Season {teamSeason.season_id?.replace('SSPSLS', '')}
                            </h3>
                            <div className="flex items-center space-x-3 mt-1 font-mono text-[11px]">
                              <span className="text-slate-400">
                                {teamSeason.matches_played || 0} Matches
                              </span>
                              <span className="text-slate-300">•</span>
                              <span className="font-semibold text-emerald-600">
                                {teamSeason.wins || 0}W
                              </span>
                              <span className="font-semibold text-amber-600">
                                {teamSeason.draws || 0}D
                              </span>
                              <span className="font-semibold text-rose-600">
                                {teamSeason.losses || 0}L
                              </span>
                              <span className="text-slate-300">•</span>
                              <span className="font-bold text-slate-700">
                                {teamSeason.points || 0} PTS
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center space-x-4">
                          {teamSeason.position === 1 && (
                            <span className="text-xl"><Trophy className="w-4 h-4 text-amber-500 fill-amber-500" /></span>
                          )}
                          {teamSeason.position === 2 && (
                            <span className="text-xl"><Trophy className="w-4 h-4 text-slate-400 fill-slate-400" /></span>
                          )}
                          {teamSeason.cup_achievement && (
                            <span className="px-2.5 py-0.5 bg-blue-50 border border-blue-200 text-blue-700 rounded-full text-[10px] font-mono font-bold uppercase">
                              {teamSeason.cup_achievement}
                            </span>
                          )}
                          <svg
                            className={`w-5 h-5 text-slate-400 transition-transform ${
                              isExpanded ? 'transform rotate-180' : ''
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                          </svg>
                        </div>
                      </button>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="px-6 pb-6 space-y-4 border-t border-slate-100">
                          {/* Team Stats */}
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-4">
                            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 font-mono">
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Position</p>
                              <p className="text-xl font-extrabold text-slate-800 mt-1">#{teamSeason.position || '-'}</p>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 font-mono">
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Goal Difference</p>
                              <p className={`text-xl font-extrabold mt-1 ${
                                (teamSeason.goal_difference || 0) >= 0 ? 'text-emerald-600' : 'text-rose-600'
                              }`}>
                                {(teamSeason.goal_difference || 0) >= 0 ? '+' : ''}{teamSeason.goal_difference || 0}
                              </p>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 font-mono">
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Goals For/Against</p>
                              <p className="text-xl font-extrabold text-slate-800 mt-1">
                                {teamSeason.goals_for || 0}/{teamSeason.goals_against || 0}
                              </p>
                            </div>
                            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 font-mono">
                              <p className="text-[10px] text-slate-400 font-bold uppercase">Win Rate</p>
                              <p className="text-xl font-extrabold text-slate-800 mt-1">
                                {teamSeason.matches_played > 0
                                  ? ((teamSeason.wins / teamSeason.matches_played) * 100).toFixed(0)
                                  : '0'}%
                              </p>
                            </div>
                          </div>

                          {/* Season Trophies */}
                          {seasonTrophies.length > 0 && (
                            <div className="space-y-3">
                              <h4 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center gap-2">
                                <span>Trophies Won</span>
                                <div className="h-[1px] flex-1 bg-slate-200"></div>
                              </h4>
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {seasonTrophies.map((trophy: any) => {
                                  const trophyPosLower = trophy.trophy_position?.toLowerCase() || '';
                                  const isTrophyChampion = trophy.position === 1 || trophyPosLower === 'winner' || trophyPosLower.startsWith('winner') || trophyPosLower.includes('champion');
                                  const isTrophyRunnerUp = trophy.position === 2 || trophyPosLower.includes('runner');
                                  const isTrophyThird = trophy.position === 3 || trophyPosLower.includes('third');
                                  const trophyNameLower = trophy.trophy_name?.toLowerCase() || '';
                                  let trophyCardLabel = 'Trophy';
                                  if (trophyNameLower.includes('shield')) trophyCardLabel = 'Shield';
                                  else if (trophyNameLower.includes('cup')) trophyCardLabel = 'Cup';
                                  else if (trophyNameLower.includes('league')) trophyCardLabel = 'League';
                                  else if (trophyNameLower.includes('fantasy')) trophyCardLabel = 'Fantasy';
                                  const trophyCardClass = isTrophyChampion ? 'fut-card-gold' : isTrophyRunnerUp ? 'fut-card-silver' : isTrophyThird ? 'fut-card-bronze' : 'fut-card-gold';
                                  const trophyIconColor = isTrophyChampion ? 'text-amber-500' : isTrophyRunnerUp ? 'text-slate-400' : isTrophyThird ? 'text-amber-700' : 'text-amber-500';
                                  return (
                                    <div key={trophy.id} className={`fut-card ${trophyCardClass} p-4 flex flex-col justify-between`}>
                                      <div className="flex justify-between items-start">
                                        <span className="text-[8px] font-mono text-slate-400 uppercase block">{trophyCardLabel}</span>
                                        <Trophy className={`w-4 h-4 ${trophyIconColor}`} />
                                      </div>
                                      <div className="text-center py-2">
                                        <Trophy className={`w-9 h-9 mx-auto mb-1.5 ${trophyIconColor}`} />
                                        <h4 className="font-bold text-slate-900 text-xs text-center mx-auto px-2">{trophy.trophy_name}</h4>
                                      </div>
                                      <div className="border-t border-slate-200/50 pt-2 flex justify-between items-center text-[8px] font-mono">
                                        <span className="text-slate-400">RANK:</span>
                                        <span className={`font-bold uppercase ${isTrophyChampion ? 'text-amber-700' : isTrophyRunnerUp ? 'text-slate-700' : 'text-slate-600'}`}>
                                          {trophy.trophy_position || `#${trophy.position}`}
                                        </span>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Players List */}
                          <div className="space-y-3">
                            <h4 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center gap-2">
                              <span>Squad ({seasonPlayers.length} Players)</span>
                              <div className="h-[1px] flex-1 bg-slate-200"></div>
                            </h4>
                            {seasonPlayers.length > 0 ? (
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {seasonPlayers.map((player: any) => (
                                  <button
                                    key={player.id}
                                    onClick={() => router.push(`/dashboard/players/${player.player_id}`)}
                                    className="bg-slate-50 border border-slate-100 rounded-xl p-4 hover:bg-slate-100 transition-all text-left w-full cursor-pointer flex flex-col justify-between"
                                  >
                                    <div className="flex items-center justify-between w-full">
                                      <div className="flex-1">
                                        <h5 className="font-extrabold text-slate-900 text-sm">{player.player_name}</h5>
                                        {player.category && (
                                          <span className="inline-block px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-[9px] font-mono font-bold text-amber-800 rounded uppercase mt-1">
                                            {player.category}
                                          </span>
                                        )}
                                      </div>
                                      <div className="text-right ml-4 font-mono text-[10px] text-slate-400">
                                        <p>{player.matches_played || 0} Matches</p>
                                        <p className="font-bold text-slate-700">{player.goals_scored || 0} Goals</p>
                                      </div>
                                    </div>
                                    {(player.category_trophies?.length > 0 || player.individual_trophies?.length > 0) && (
                                      <div className="mt-2 pt-2 border-t border-slate-200/50">
                                        <div className="flex flex-wrap gap-1">
                                          {player.category_trophies?.map((trophy: string, idx: number) => (
                                            <span key={idx} className="text-[9px] font-mono font-bold px-2 py-0.5 bg-amber-100 border border-amber-200 text-amber-800 rounded-full uppercase">
                                              <Trophy className="w-4 h-4 text-amber-500 fill-amber-500" /> {trophy}
                                            </span>
                                          ))}
                                          {player.individual_trophies?.map((trophy: string, idx: number) => (
                                            <span key={idx} className="text-[9px] font-mono font-bold px-2 py-0.5 bg-purple-50 border border-purple-100 text-purple-700 rounded-full uppercase">
                                              <Star className="w-4 h-4 text-amber-400 fill-amber-400" /> {trophy}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs text-slate-400 font-mono uppercase bg-slate-50 border border-slate-100 rounded-xl p-4">No player data available for this season</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-8 text-center shadow-sm max-w-md mx-auto">
                  <p className="text-xs text-slate-400 font-mono uppercase">No historical seasons found</p>
                </div>
              )}
            </div>
          )}

          {/* Active Season Tab */}
          {activeTab === 'active' && seasonStatus?.hasActiveSeason && (
            <div className="space-y-6">
              {loadingActiveDetails ? (
                <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-12 text-center shadow-sm">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto mb-4"></div>
                  <p className="text-xs text-slate-500 font-mono uppercase">Loading active season details...</p>
                </div>
              ) : activeSeasonDetails ? (
                <>
                  {/* Registered Teams */}
                  <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-4">
                    <h3 className="text-lg font-extrabold text-slate-900 uppercase tracking-tight flex items-center gap-2 border-b border-slate-100 pb-3">
                      <span>Registered Teams ({activeSeasonDetails.teams?.length || 0})</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {activeSeasonDetails.teams?.map((team: any) => (
                        <button
                          key={team.id}
                          onClick={() => router.push(`/teams/${team.team_id}`)}
                          className="bg-slate-50 border border-slate-100 rounded-xl p-4 hover:bg-slate-100 transition-all text-left w-full cursor-pointer flex items-center gap-3.5 hover:shadow-sm"
                        >
                          {team.logo_url ? (
                            <div className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
                              <img src={team.logo_url} alt={team.team_name} className="max-w-full max-h-full object-contain p-1" />
                            </div>
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center">
                              <span className="text-lg font-bold text-amber-600 font-mono">{team.team_name?.[0]}</span>
                            </div>
                          )}
                          <div className="flex-1">
                            <h4 className="font-extrabold text-slate-900 text-sm">{team.team_name}</h4>
                            {team.dollar_balance !== undefined || team.euro_balance !== undefined ? (
                              <p className="text-[10px] font-mono font-bold text-slate-400 mt-0.5">
                                <span className="text-emerald-700">SSCoin {team.dollar_balance?.toLocaleString() || 0}</span> / 
                                <span className="text-blue-700">eCoin {team.euro_balance?.toLocaleString() || 0}</span>
                              </p>
                            ) : (
                              <p className="text-[10px] font-mono font-bold text-slate-400 mt-0.5">Balance: eCoin {team.balance?.toLocaleString() || 0}</p>
                            )}
                          </div>
                        </button>
                      )) || <p className="text-xs text-slate-400 font-mono uppercase">No teams registered yet</p>}
                    </div>
                  </div>

                  {/* Real Players Pool */}
                  <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-4">
                    <h3 className="text-lg font-extrabold text-slate-900 uppercase tracking-tight flex items-center gap-2 border-b border-slate-100 pb-3">
                      <span>Active Players ({activeSeasonDetails.players?.length || 0})</span>
                    </h3>
                    <p className="text-xs text-slate-500 font-sans leading-normal">
                      All active players in the system for this season. Click on a player to view stats.
                    </p>
                    {activeSeasonDetails.players && activeSeasonDetails.players.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {activeSeasonDetails.players.map((player: any) => (
                          <button
                            key={player.id}
                            onClick={() => router.push(`/dashboard/players/${player.id}?from=dashboard`)}
                            className={`rounded-xl p-3.5 transition-all text-left w-full cursor-pointer flex flex-col justify-between border ${
                              player.hasPlayedThisSeason 
                                ? 'bg-amber-50/20 border-amber-200 hover:bg-amber-50/40' 
                                : 'bg-slate-50 border-slate-100 hover:bg-slate-100'
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <div className="flex-1">
                                <h5 className="font-extrabold text-slate-900 text-sm">{player.name}</h5>
                                <div className="flex items-center gap-2 mt-1 font-mono text-[10px]">
                                  {player.psn_id && (
                                    <p className="text-slate-500">PSN: {player.psn_id}</p>
                                  )}
                                  {player.hasPlayedThisSeason && (
                                    <span className="px-1.5 py-0.5 bg-amber-50 border border-amber-200 text-amber-800 rounded font-bold uppercase">
                                      Has Stats
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-slate-400 font-mono uppercase">No real players in the system yet</p>
                    )}
                  </div>
                </>
              ) : (
                <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-8 text-center shadow-sm max-w-md mx-auto">
                  <p className="text-xs text-slate-400 font-mono uppercase">Unable to load active season details</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show registered dashboard with full features
  return <RegisteredTeamDashboard seasonStatus={seasonStatus} user={user} />;
}
