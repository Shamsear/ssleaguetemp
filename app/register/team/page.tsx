'use client';

import { CheckCircle, DollarSign, Gamepad2, Sparkles, Target, User } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import ConfirmModal from '@/components/modals/ConfirmModal';
import OwnerRegistrationForm from '@/components/forms/OwnerRegistrationForm';

interface Season {
  id: string;
  name: string;
  short_name?: string;
  is_active: boolean;
  status: string;
  starting_balance?: number;
}

function SeasonRegistrationContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const seasonId = searchParams?.get('season');
  const [season, setSeason] = useState<Season | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [registrationStatus, setRegistrationStatus] = useState<'none' | 'registered' | 'declined'>('none');
  
  // Phase 1: New state for registration form
  const [showRegistrationForm, setShowRegistrationForm] = useState(false);
  const [joinFantasy, setJoinFantasy] = useState(false);
  const [registerOwnerNow, setRegisterOwnerNow] = useState(false);
  const [showOwnerForm, setShowOwnerForm] = useState(false);
  const [ownerAlreadyRegistered, setOwnerAlreadyRegistered] = useState(false);
  
  const {
    alertState,
    showAlert,
    closeAlert,
    confirmState,
    showConfirm,
    closeConfirm,
    handleConfirm,
  } = useModal();

  useEffect(() => {
    if (!loading && !user) {
      // Store the current URL to redirect back after login
      if (typeof window !== 'undefined') {
        sessionStorage.setItem('redirectAfterLogin', window.location.pathname + window.location.search);
      }
      router.push('/login');
      return;
    }
    if (!loading && user && user.role !== 'team') {
      // Redirect non-team users to their role-specific dashboard
      switch (user.role) {
        case 'super_admin':
          router.push('/dashboard/superadmin');
          break;
        case 'committee_admin':
          router.push('/dashboard/committee');
          break;
        default:
          router.push('/dashboard');
      }
      return;
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchSeasonAndStatus = async () => {
      if (!seasonId || !user) return;

      if (!seasonId) {
        showAlert({
          type: 'error',
          title: 'Invalid Link',
          message: 'No season ID provided in the link'
        });
        router.push('/dashboard/team');
        return;
      }

      try {
        // Fetch season data
        const response = await fetch(`/api/seasons/${seasonId}`);
        const { success, data } = await response.json();

        if (success) {
          setSeason(data);
          console.log('Season data loaded:', data); // Debug log

          // Check registration status
          const { db } = await import('@/lib/firebase/config');
          const { doc, getDoc } = await import('firebase/firestore');
          
          const teamSeasonId = `${user.uid}_${seasonId}`;
          try {
            const existingDoc = await getDoc(doc(db, 'team_seasons', teamSeasonId));
            if (existingDoc.exists()) {
              const docData = existingDoc.data();
              setRegistrationStatus(docData.status === 'registered' ? 'registered' : 'declined');
            }
          } catch (err) {
            // No existing registration
            setRegistrationStatus('none');
          }

          // Check if owner already registered
          try {
            const { collection, query, where, getDocs } = await import('firebase/firestore');
            const teamsRef = collection(db, 'teams');
            
            // Try query by userId or uid or owner_uid
            let querySnapshot = await getDocs(query(teamsRef, where('userId', '==', user.uid)));
            if (querySnapshot.empty) {
              querySnapshot = await getDocs(query(teamsRef, where('uid', '==', user.uid)));
            }
            if (querySnapshot.empty) {
              querySnapshot = await getDocs(query(teamsRef, where('owner_uid', '==', user.uid)));
            }
            
            let teamIdParam = user.uid; // Fallback
            if (!querySnapshot.empty) {
              teamIdParam = querySnapshot.docs[0].id;
            }
            
            if (teamIdParam) {
              const ownerRes = await fetch(`/api/owners?teamId=${teamIdParam}`);
              const ownerData = await ownerRes.json();
              if (ownerData?.success && ownerData?.data) {
                setOwnerAlreadyRegistered(true);
                setRegisterOwnerNow(false);
              }
            }
          } catch (ownerErr) {
            console.error('Error checking owner status:', ownerErr);
          }
        } else {
          showAlert({
            type: 'error',
            title: 'Invalid Season',
            message: 'Season not found or link is invalid'
          });
          router.push('/dashboard/team');
        }
      } catch (err) {
        console.error('Error fetching season:', err);
        showAlert({
          type: 'error',
          title: 'Error',
          message: 'Failed to load season information'
        });
        router.push('/dashboard/team');
      } finally {
        setIsLoading(false);
      }
    };

    if (user && seasonId) {
      fetchSeasonAndStatus();
    }
  }, [seasonId, router, user]);

  const handleDecision = async (action: 'join' | 'decline') => {
    if (!season || isSubmitting || !user) return;

    // Phase 1: Show form for joining (to collect manager name and fantasy opt-in)
    if (action === 'join') {
      setShowRegistrationForm(true);
      return;
    }

    // For decline, show confirmation directly
    const confirmMessage = `Are you sure you want to skip ${season.name}?`;

    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Skip Season',
      message: confirmMessage,
      confirmText: 'Skip',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    setIsSubmitting(true);

    try {
      // Use API endpoint for decline
      const response = await fetch(`/api/seasons/${seasonId}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'decline',
          userId: user.uid,
        }),
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.message || 'Decline failed');
      }

      showAlert({
        type: 'success',
        title: 'Season Skipped',
        message: `You have declined ${season.name}. You can join future seasons.`
      });
      setTimeout(() => router.push('/dashboard/team'), 1500);
    } catch (err) {
      console.error('Error processing decision:', err);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'An error occurred. Please try again.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegistrationSubmit = async () => {
    if (!season || isSubmitting || !user) return;

    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/seasons/${seasonId}/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'join',
          userId: user.uid,
          joinFantasy: joinFantasy,
        }),
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.message || 'Registration failed');
      }

      showAlert({
        type: 'success',
        title: 'Success',
        message: `Successfully joined ${season.name}!${joinFantasy ? ' You\'re also registered for Fantasy League!' : ''}`
      });
      setTimeout(() => router.push('/dashboard/team'), 1500);
    } catch (err) {
      console.error('Error processing registration:', err);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'An error occurred. Please try again.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading season registration...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'team' || !season) {
    return null;
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 space-y-6 font-mono">
        <div className="flex justify-start">
          <button
            onClick={() => router.push('/dashboard/team')}
            className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all text-xs uppercase tracking-wider font-bold cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            <span>Back to Dashboard</span>
          </button>
        </div>

        <div className="console-card bg-white rounded-2xl p-6 shadow-sm border border-slate-200/60 overflow-hidden mb-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4 pb-4 border-b border-slate-100">
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                Season Invitation
              </h1>
              {season && (
                <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                  Season: <span className="font-extrabold text-amber-500">{season.name}</span>
                </p>
              )}
            </div>
          </div>
          <p className="text-xs text-slate-500 uppercase font-semibold leading-relaxed">
            You've been invited to participate in <span className="text-slate-800 font-extrabold">{season.name}</span>. Choose whether you'd like to join this season.
          </p>
        </div>

        <div className="console-card bg-white rounded-2xl shadow-sm border border-slate-200/60 overflow-hidden mb-8">
          <div className="p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 pb-6 border-b border-slate-100">
              <div>
                <h2 className="text-xl sm:text-2xl font-extrabold text-slate-800 uppercase tracking-wide">{season.name}</h2>
                {season.short_name && (
                  <p className="text-xs text-slate-500 uppercase font-bold mt-0.5">{season.short_name}</p>
                )}
              </div>
              <div className="sm:text-right">
                <span className={`inline-flex items-center px-2.5 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider ${
                  season.is_active
                    ? 'bg-green-50/60 text-green-700 border border-green-200/30'
                    : season.status === 'upcoming'
                    ? 'bg-blue-50/60 text-blue-700 border border-blue-200/30'
                    : 'bg-slate-50/60 text-slate-700 border border-slate-200/30'
                }`}>
                  {season.is_active ? (
                    <>
                      <svg className="w-3.5 h-3.5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" />
                      </svg>
                      Active Season
                    </>
                  ) : season.status === 'upcoming' ? (
                    <>
                      <svg className="w-3.5 h-3.5 mr-1" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                      </svg>
                      Upcoming Season
                    </>
                  ) : (
                    season.status
                  )}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
              <div className="bg-slate-50/60 border border-slate-200/40 rounded-xl p-4">
                <dt className="text-[10px] uppercase font-bold text-slate-500 mb-1">Your Team</dt>
                <dd className="text-sm font-extrabold text-slate-800 uppercase tracking-wide">{user.teamName || 'My Team'}</dd>
              </div>
              <div className="bg-slate-50/60 border border-slate-200/40 rounded-xl p-4">
                <dt className="text-[10px] uppercase font-bold text-slate-500 mb-1">Season Status</dt>
                <dd className="text-sm font-extrabold text-slate-800 uppercase tracking-wide">
                  {season.is_active ? 'Active' : season.status === 'upcoming' ? 'Upcoming' : 'Scheduled'}
                </dd>
              </div>
            </div>
            
            <div className="mb-6">
              <div className="bg-gradient-to-br from-amber-50/40 to-yellow-50/40 rounded-xl p-5 border border-amber-200/40 text-center">
                <div className="flex items-center justify-center">
                  <div className="w-10 h-10 rounded-full bg-slate-800 border border-slate-900 flex items-center justify-center mr-3 shadow-sm">
                    <DollarSign className="w-5 h-5 text-amber-500" />
                  </div>
                  <div className="text-left">
                    <dt className="text-[10px] uppercase font-bold text-slate-500">Starting Budget</dt>
                    <dd className="text-2xl font-black text-slate-800 leading-tight">{(season.starting_balance || 15000).toLocaleString()}</dd>
                  </div>
                </div>
                <p className="text-[9px] uppercase font-bold text-slate-400 mt-2">For all players and team management</p>
              </div>
            </div>

            <div className="bg-slate-50/60 rounded-xl p-5 mb-6 border border-slate-200/40">
              <h3 className="text-xs uppercase font-extrabold text-slate-800 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                What to Expect
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-[11px] font-semibold text-slate-600">
                <div>
                  <h4 className="text-slate-800 uppercase font-extrabold mb-2.5 flex items-center gap-1.5">
                    <CheckCircle className="w-4 h-4 text-emerald-500" /> As a Participant:
                  </h4>
                  <ul className="space-y-1.5 leading-relaxed">
                    <li>• Receive {(season.starting_balance || 15000).toLocaleString()} starting budget</li>
                    <li>• Build your squad with top players</li>
                    <li>• Track your team's performance throughout the season</li>
                    <li>• Compete with other teams in the league</li>
                  </ul>
                </div>
                <div>
                  <h4 className="text-slate-800 uppercase font-extrabold mb-2.5 flex items-center gap-1.5">
                    <Target className="w-4 h-4 text-rose-500" /> Season Features:
                  </h4>
                  <ul className="space-y-1.5 leading-relaxed">
                    <li>• Single currency system - unified budget for all players</li>
                    <li>• Season leaderboards and comprehensive statistics</li>
                    <li>• Compete for top positions in the league</li>
                    <li>• Track individual player performance</li>
                  </ul>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {registrationStatus === 'registered' ? (
                // Already registered message
                <div className="text-center py-4">
                  <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-50/60 border border-green-200/30 text-green-600 shadow-sm">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-800 uppercase tracking-wider mb-2">You're Already Registered!</h3>
                  <p className="text-xs text-slate-500 uppercase font-semibold mb-6">
                    <strong>{user.teamName || 'Your team'}</strong> has already joined <strong>{season.name}</strong>.
                  </p>
                  <div className="bg-gradient-to-r from-green-50/40 to-emerald-50/40 border border-green-200/40 rounded-xl p-5 mb-6 text-xs font-semibold">
                    <p className="text-green-800 font-extrabold uppercase mb-2">Registration Confirmed</p>
                    <p className="text-green-700 uppercase tracking-wide leading-relaxed mb-3">
                      Your starting budget has been allocated:
                    </p>
                    <div className="flex justify-center mb-3">
                      <div className="bg-white border border-green-200/20 rounded-lg px-4 py-2 text-center shadow-sm">
                        <p className="text-[9px] text-slate-400 uppercase font-extrabold">Starting Balance</p>
                        <p className="text-base font-black text-slate-800 font-mono">{(season.starting_balance || 15000).toLocaleString()}</p>
                      </div>
                    </div>
                    <p className="text-green-700 uppercase tracking-wide leading-relaxed">
                      Check your dashboard to start building your squad!
                    </p>
                  </div>
                  <Link
                    href="/dashboard/team"
                    className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-900 text-white font-bold rounded-xl transition-all shadow-sm text-xs uppercase tracking-wider cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                    </svg>
                    Go to Dashboard
                  </Link>
                </div>
              ) : registrationStatus === 'declined' ? (
                // Already declined message
                <div className="text-center py-4">
                  <div className="mb-6 inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-50/60 border border-slate-200/30 text-slate-500 shadow-sm">
                    <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-extrabold text-slate-800 uppercase tracking-wider mb-2">You Declined This Season</h3>
                  <p className="text-xs text-slate-500 uppercase font-semibold mb-6">
                    <strong>{user.teamName || 'Your team'}</strong> has declined to join <strong>{season.name}</strong>.
                  </p>
                  <div className="bg-slate-50/60 border border-slate-200/40 rounded-xl p-5 mb-6 text-xs font-semibold leading-relaxed">
                    <p className="text-slate-800 font-extrabold uppercase mb-2">Season Declined</p>
                    <p className="text-slate-500 uppercase">
                      You declined to participate in this season. If you made a mistake or changed your mind, you can choose to join below.
                    </p>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                      type="button"
                      onClick={() => setRegistrationStatus('none')}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-900 text-white font-bold rounded-xl transition-all shadow-sm text-xs uppercase tracking-wider cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Change Mind & Join
                    </button>
                    <Link
                      href="/dashboard/team"
                      className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 hover:border-slate-300 text-slate-700 font-bold rounded-xl transition-all shadow-sm text-xs uppercase tracking-wider cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                      </svg>
                      Back to Dashboard
                    </Link>
                  </div>
                </div>
              ) : showOwnerForm ? (
                // Owner Registration Form
                <div className="max-w-2xl mx-auto">
                  <button
                    type="button"
                    onClick={() => setShowOwnerForm(false)}
                    className="mb-6 text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition-colors uppercase text-xs font-bold"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                  </button>

                  <h3 className="text-base font-extrabold text-slate-800 uppercase tracking-wider mb-6 text-center">Register Team Owner</h3>
                  
                  <OwnerRegistrationForm
                    teamId={user.teamId || user.uid}
                    userId={user.uid}
                    userName={user.displayName || user.teamName || ''}
                    userEmail={user.email || ''}
                    onSuccess={() => {
                      // After owner registration, complete season registration
                      handleRegistrationSubmit();
                    }}
                    onCancel={() => {
                      // Skip owner registration and just complete season registration
                      setShowOwnerForm(false);
                      handleRegistrationSubmit();
                    }}
                  />
                </div>
              ) : showRegistrationForm ? (
                // Registration form with fantasy opt-in
                <div className="max-w-2xl mx-auto">
                  <button
                    type="button"
                    onClick={() => setShowRegistrationForm(false)}
                    className="mb-6 text-slate-500 hover:text-slate-800 flex items-center gap-1.5 transition-colors uppercase text-xs font-bold"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                    </svg>
                    Back
                  </button>

                  <h3 className="text-base font-extrabold text-slate-800 uppercase tracking-wider mb-6 text-center">Complete Your Registration</h3>
                  
                  <div className="space-y-4">
                    {/* Owner Registration Option */}
                    {ownerAlreadyRegistered ? (
                      <div className="bg-gradient-to-br from-green-50/50 to-emerald-50/50 rounded-xl p-5 border border-green-200/40 text-xs font-semibold">
                        <div className="flex items-start">
                          <div className="mt-0.5 flex-shrink-0 bg-green-500 rounded-full p-0.5 text-white">
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                          <div className="ml-3">
                            <span className="block font-extrabold text-green-950 uppercase tracking-wide mb-1">
                              <span className="flex items-center gap-1.5"><User className="w-4 h-4 text-green-600" /> Owner Already Registered</span>
                            </span>
                            <span className="block text-green-700 uppercase tracking-wide leading-normal">
                              Your team owner details are already registered in the system. No action is required.
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-gradient-to-br from-slate-50/50 to-zinc-50/50 rounded-xl p-5 border border-slate-200/40 text-xs font-semibold">
                        <div className="flex items-start">
                          <input
                            type="checkbox"
                            id="registerOwnerNow"
                            checked={registerOwnerNow}
                            onChange={(e) => setRegisterOwnerNow(e.target.checked)}
                            className="mt-0.5 h-4.5 w-4.5 text-slate-800 rounded focus:ring-slate-500 border-slate-300 cursor-pointer"
                          />
                          <label htmlFor="registerOwnerNow" className="ml-3 cursor-pointer select-none">
                            <span className="block font-extrabold text-slate-800 uppercase tracking-wide mb-1">
                              <span className="flex items-center gap-1.5"><User className="w-4 h-4 text-slate-400" /> Register Team Owner Now (Optional)</span>
                            </span>
                            <span className="block text-slate-500 uppercase tracking-wide leading-normal">
                              Add owner information now, or you can do this later from your dashboard.
                            </span>
                          </label>
                        </div>
                      </div>
                    )}

                    {/* Fantasy League Opt-in */}
                    <div className="bg-gradient-to-br from-purple-50/50 to-indigo-50/50 rounded-xl p-5 border border-purple-200/40 text-xs font-semibold">
                      <div className="flex items-start">
                        <input
                          type="checkbox"
                          id="joinFantasy"
                          checked={joinFantasy}
                          onChange={(e) => setJoinFantasy(e.target.checked)}
                          className="mt-0.5 h-4.5 w-4.5 text-slate-800 rounded focus:ring-slate-500 border-slate-300 cursor-pointer"
                        />
                        <label htmlFor="joinFantasy" className="ml-3 cursor-pointer select-none">
                          <span className="block font-extrabold text-purple-900 uppercase tracking-wide mb-1">
                            <span className="flex items-center gap-1.5"><Gamepad2 className="w-4 h-4 text-indigo-400" /> Join Fantasy League</span>
                          </span>
                          <span className="block text-purple-700 uppercase tracking-wide leading-normal">
                            Participate in the fantasy league! Draft players, set lineups, earn points, and compete against other managers.
                          </span>
                        </label>
                      </div>
                      
                      {joinFantasy && (
                        <div className="mt-4 pl-7 border-l-2 border-purple-200/40 space-y-2 text-[10px] uppercase font-bold text-purple-800">
                          <p className="flex items-center gap-1.5 text-[11px] font-extrabold text-purple-900"><Sparkles className="w-4 h-4 text-purple-500" /> Fantasy Features:</p>
                          <ul className="space-y-1 leading-normal list-disc list-inside pl-1">
                            <li>Draft players from your real team's roster</li>
                            <li>Set weekly lineups with Captain/Vice-Captain</li>
                            <li>Earn bonus points when your real team wins</li>
                            <li>Track dual scoring: player points + team bonuses</li>
                            <li>Compete on fantasy league leaderboards</li>
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Submit Button */}
                    <div className="pt-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (registerOwnerNow) {
                            setShowOwnerForm(true);
                          } else {
                            handleRegistrationSubmit();
                          }
                        }}
                        disabled={isSubmitting}
                        className="w-full py-3 px-6 bg-slate-800 hover:bg-slate-700 border border-slate-900 hover:border-slate-800 text-white font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-xs uppercase tracking-wider cursor-pointer hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        <span>{isSubmitting ? 'Processing...' : (registerOwnerNow ? 'Continue to Owner Registration' : 'Confirm Registration')}</span>
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                // Initial decision buttons
                <div className="text-center py-2">
                  <h3 className="text-base font-extrabold text-slate-800 uppercase tracking-wider mb-2">Make Your Decision</h3>
                  <p className="text-xs text-slate-500 uppercase font-semibold mb-6">
                    Would you like <strong>{user.teamName || 'your team'}</strong> to participate in <strong>{season.name}</strong>?
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <button
                      type="button"
                      onClick={() => handleDecision('join')}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-900 hover:border-slate-800 text-white font-bold rounded-xl transition-all shadow-sm text-xs uppercase tracking-wider cursor-pointer hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <span>{isSubmitting ? 'Processing...' : `Join ${season.name}`}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDecision('decline')}
                      disabled={isSubmitting}
                      className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-slate-200 hover:border-rose-400/40 hover:text-rose-600 text-slate-700 font-bold rounded-xl transition-all shadow-sm text-xs uppercase tracking-wider cursor-pointer hover:-translate-y-0.5 active:translate-y-0 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span>Skip This Season</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="mt-6 p-5 bg-gradient-to-r from-amber-50/40 to-yellow-50/40 rounded-xl border border-amber-200/40 text-xs font-semibold text-amber-800">
              <h4 className="font-extrabold uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Important Notes
              </h4>
              <ul className="space-y-1.5 leading-relaxed">
                <li>• Once you join a season, you cannot change your decision without admin assistance</li>
                <li>• If you decline, you can participate in future seasons</li>
                <li>• Your team will remain registered in the system regardless of your choice</li>
                <li>• Committee admins may send you invitations to other seasons in the future</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Modal Components */}
      <AlertModal
        isOpen={alertState.isOpen}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />

      <ConfirmModal
        isOpen={confirmState.isOpen}
        onConfirm={handleConfirm}
        onCancel={closeConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        type={confirmState.type}
      />
    </div>
  );
}

export default function SeasonRegistrationPage() {
  return (
    <Suspense fallback={
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading season registration...</p>
        </div>
      </div>
    }>
      <SeasonRegistrationContent />
    </Suspense>
  );
}
