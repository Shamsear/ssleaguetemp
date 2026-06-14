'use client';
import { CheckCircle, XCircle } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePermissions } from '@/hooks/usePermissions';
import { getSeasonById, updateSeason } from '@/lib/firebase/seasons';
import { Season } from '@/types/season';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs, onSnapshot } from 'firebase/firestore';

export default function TeamRegistrationPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { isCommitteeAdmin, userSeasonId } = usePermissions();
  const [currentSeason, setCurrentSeason] = useState<Season | null>(null);
  
  const [registeredTeamsCount, setRegisteredTeamsCount] = useState(0);
  const [totalTeamsCount, setTotalTeamsCount] = useState(0);
  const [loadingData, setLoadingData] = useState(true);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isToggling, setIsToggling] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && !isCommitteeAdmin) {
      router.push('/dashboard');
    }
  }, [user, loading, router, isCommitteeAdmin]);

  useEffect(() => {
    if (!isCommitteeAdmin || !userSeasonId) {
      setLoadingData(false);
      return;
    }

    const fetchInitialData = async () => {
      try {
        setLoadingData(true);
        
        const season = await getSeasonById(userSeasonId);
        setCurrentSeason(season);
        
        const teamsSnapshot = await getDocs(collection(db, 'teams'));
        setTotalTeamsCount(teamsSnapshot.docs.length);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoadingData(false);
      }
    };

    fetchInitialData();

    // Set up real-time listener for team registrations
    console.log('🔴 Setting up real-time listener for season:', userSeasonId);
    
    const teamSeasonsQuery = query(
      collection(db, 'team_seasons'),
      where('season_id', '==', userSeasonId),
      where('status', '==', 'registered')
    );

    const unsubscribe = onSnapshot(
      teamSeasonsQuery,
      (snapshot) => {
        console.log('🟢 Real-time update received! Registered teams:', snapshot.docs.length);
        setRegisteredTeamsCount(snapshot.docs.length);
      },
      (error) => {
        console.error('<XCircle className="w-4 h-4 inline-block text-rose-500 mr-1 align-text-bottom" /> Error listening to team registrations:', error);
      }
    );

    console.log('<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Real-time listener set up successfully');

    return () => {
      console.log('🔴 Cleaning up real-time listener');
      unsubscribe();
    };
  }, [isCommitteeAdmin, userSeasonId]);

  const toggleTeamRegistration = async () => {
    if (!currentSeason || isToggling) return;

    const confirmMessage = currentSeason.is_team_registration_open
      ? `Close team registration for ${currentSeason.name}?`
      : `Open team registration for ${currentSeason.name}?`;
    
    if (!confirm(confirmMessage)) return;

    try {
      setIsToggling(true);
      const newValue = !currentSeason.is_team_registration_open;
      
      await updateSeason(currentSeason.id, {
        is_team_registration_open: newValue
      });

      setCurrentSeason({
        ...currentSeason,
        is_team_registration_open: newValue
      });

      alert(
        newValue 
          ? 'Team registration opened successfully!' 
          : 'Team registration closed successfully!'
      );
    } catch (error) {
      console.error('Error toggling team registration:', error);
      alert('Failed to toggle team registration');
    } finally {
      setIsToggling(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    }).catch(() => {
      alert('Failed to copy link');
    });
  };

  if (loading || loadingData) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading Registration Details...</p>
        </div>
      </div>
    );
  }

  if (!user || !isCommitteeAdmin) {
    return null;
  }

  if (!currentSeason) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative px-4">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-8 max-w-md w-full mx-auto text-center relative z-10 font-mono">
          <div className="text-amber-500 mb-4 animate-pulse">
            <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider mb-2">No Season Assigned</h2>
          <p className="text-xs text-slate-500 uppercase font-semibold mb-6">
            You need to be assigned to a season to manage team registration.
          </p>
          <Link 
            href="/dashboard/committee" 
            className="inline-flex items-center justify-center px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl text-xs uppercase tracking-wider font-bold transition-all shadow-sm w-full"
          >
            Back to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  const teamRegistrationLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/register/team?season=${currentSeason.id}`;
  const availableTeams = totalTeamsCount - registeredTeamsCount;

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 font-mono">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-wider text-slate-800">Team Registration</h1>
            <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
              Active Season: <span className="font-extrabold text-amber-500">{currentSeason.name}</span>
            </p>
          </div>

          <Link 
            href="/dashboard/committee" 
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all text-xs uppercase tracking-wider font-bold"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Dashboard</span>
          </Link>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 font-mono">
          <div className="console-card bg-white rounded-2xl p-5 border border-slate-200/60 hover:border-amber-400/40 transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 shadow-md">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Total Teams</div>
            <div className="text-2xl font-black text-slate-800">{totalTeamsCount}</div>
          </div>

          <div className="console-card bg-white rounded-2xl p-5 border border-slate-200/60 hover:border-green-500/40 transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-green-500 to-green-600 shadow-md">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Registered</div>
            <div className="text-2xl font-black text-green-600">{registeredTeamsCount}</div>
          </div>

          <div className="console-card bg-white rounded-2xl p-5 border border-slate-200/60 hover:border-amber-500/40 transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 shadow-md">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
            </div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Available</div>
            <div className="text-2xl font-black text-amber-600">{availableTeams}</div>
          </div>
        </div>

        {/* Registration Control */}
        <div className="console-card bg-white rounded-3xl p-6 shadow-sm border border-slate-200/60 font-mono">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <span className="text-xs uppercase font-bold text-slate-500 tracking-wider">Registration Status:</span>
              {currentSeason.is_team_registration_open ? (
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
              onClick={toggleTeamRegistration}
              disabled={isToggling}
              className={`inline-flex items-center px-4 py-2.5 text-xs font-bold uppercase tracking-wider rounded-xl transition-all shadow-sm hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${
                currentSeason.is_team_registration_open
                  ? 'bg-red-600 hover:bg-red-500 text-white border border-red-700'
                  : 'bg-green-600 hover:bg-green-500 text-white border border-green-700'
              }`}
            >
              {isToggling ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : currentSeason.is_team_registration_open ? (
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

          {currentSeason.is_team_registration_open ? (
            <div className="space-y-4">
              <div className="p-4 bg-green-50/50 border border-green-200/50 rounded-xl">
                <p className="text-[10px] uppercase font-bold text-green-850 flex items-start leading-relaxed tracking-wider">
                  <svg className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5 text-green-650" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span><strong>Registration Active:</strong> Share the link below with teams to register for {currentSeason.name}.</span>
                </p>
              </div>
              
              <div>
                <label className="block text-[10px] uppercase font-bold text-slate-500 tracking-wider mb-2">Registration Link</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={teamRegistrationLink}
                    readOnly
                    onClick={(e) => e.currentTarget.select()}
                    className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:outline-none focus:ring-1 focus:ring-amber-400/20 text-xs font-mono text-slate-700 font-bold"
                  />
                  <button
                    onClick={() => copyToClipboard(teamRegistrationLink)}
                    className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-slate-900 font-bold text-xs uppercase tracking-wider transition-all shadow-sm flex items-center justify-center cursor-pointer"
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
              <p className="text-[10px] uppercase font-bold text-red-850 flex items-start leading-relaxed tracking-wider">
                <svg className="w-4 h-4 mr-2 flex-shrink-0 mt-0.5 text-red-650" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span><strong>Registration Closed:</strong> Teams cannot register at this time. Click "Open Registration" to allow teams to join.</span>
              </p>
            </div>
          )}
        </div>

        {/* Info Section */}
        <div className="console-card bg-white rounded-3xl p-6 shadow-sm border border-slate-200/60 font-mono">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center mb-4">
            <svg className="w-4 h-4 mr-2 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Registration Information
          </h3>
          <div className="space-y-3 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            <p>
              <span className="text-slate-700">1. Registration Link:</span> The registration link allows teams to register for {currentSeason.name}.
            </p>
            <p>
              <span className="text-slate-700">2. Process:</span> New teams will create an account and be registered for {currentSeason.name}.
            </p>
            <p>
              <span className="text-slate-700">3. Control:</span> You can open or close registration at any time using the toggle above.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
