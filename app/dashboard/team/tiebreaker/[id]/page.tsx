'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchWithTokenRetry } from '@/lib/fetch-with-retry';

import { fetchWithTokenRefresh } from '@/lib/token-refresh';
interface TiebreakerDetail {
  id: string;
  round_id: string;
  round_position: string;
  player: {
    id: string;
    name: string;
    position: string;
    overall_rating: number;
    team_name: string;
  };
  original_amount: number;
  status: string;
  duration_minutes: number | null;
  created_at: string;
  new_amount: number | null;
  submitted: boolean;
  submitted_at: string | null;
  expiresAt: string | null;
  timeRemaining: number;
  isExpired: boolean;
  hasTimeLimit: boolean;
}

interface UserBidInRound {
  bid_id: string;
  player_id: string;
  player_name: string;
  position: string;
  overall_rating: number;
  player_team: string;
  bid_amount: number;
  allocation_status: 'won' | 'allocated_to_other' | 'lost' | 'tiebreaker' | 'tiebreaker_other' | 'available' | 'pending';
  allocated_to_team: string | null;
  is_current_tiebreaker: boolean;
}

interface TiedTeam {
  team_id: string;
  team_name: string;
  submitted: boolean;
  new_bid_amount: number | null;
  is_current_user: boolean;
}

export default function TeamTiebreakerPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, loading, firebaseUser } = useAuth();
  const router = useRouter();
  const [tiebreakerId, setTiebreakerId] = useState<string | null>(null);
  const [tiebreaker, setTiebreaker] = useState<TiebreakerDetail | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [bidAmount, setBidAmount] = useState<number | ''>(0);
  const [hasUserModifiedBid, setHasUserModifiedBid] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [teamBalance, setTeamBalance] = useState(0);
  const [currentTime, setCurrentTime] = useState(Date.now());
  const [userBidsInRound, setUserBidsInRound] = useState<UserBidInRound[]>([]);
  const [tiedTeams, setTiedTeams] = useState<TiedTeam[]>([]);

  useEffect(() => {
    params.then(({ id }) => setTiebreakerId(id));
  }, [params]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading, router]);

  const fetchTiebreakerDetails = async () => {
    if (!tiebreakerId) return;
    
    try {
      // Refresh token before API call
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken(true);
          await fetchWithTokenRefresh('/api/auth/set-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: idToken }),
          });
        } catch (tokenError) {
          console.error('Token refresh failed:', tokenError);
        }
      }
      
      const response = await fetchWithTokenRetry(`/api/tiebreakers/${tiebreakerId}`);
      const result = await response.json();
      
      console.log('🔍 Tiebreaker API response:', result);
      
      if (result.success) {
        // Find the current user's team data using is_current_user flag
        const teamTiebreaker = result.data.teamTiebreakers.find(
          (t: any) => t.is_current_user === true
        );
        
        console.log('💰 Current user team tiebreaker:', teamTiebreaker);
        
        const durationMinutes = result.data.tiebreaker.duration_minutes;
        const hasTimeLimit = durationMinutes !== null;
        
        setTiebreaker({
          id: result.data.tiebreaker.id,
          round_id: result.data.tiebreaker.round_id,
          round_position: result.data.tiebreaker.round_position,
          player: {
            id: result.data.tiebreaker.player_id,
            name: result.data.tiebreaker.player_name,
            position: result.data.tiebreaker.position,
            overall_rating: result.data.tiebreaker.overall_rating,
            team_name: result.data.tiebreaker.player_team,
          },
          original_amount: result.data.tiebreaker.original_amount,
          status: result.data.tiebreaker.status,
          duration_minutes: durationMinutes,
          created_at: result.data.tiebreaker.created_at,
          new_amount: teamTiebreaker?.new_bid_amount || null,
          submitted: teamTiebreaker?.submitted || false,
          submitted_at: teamTiebreaker?.submitted_at || null,
          expiresAt: hasTimeLimit
            ? new Date(
                new Date(result.data.tiebreaker.created_at).getTime() +
                  durationMinutes * 60 * 1000
              ).toISOString()
            : null,
          timeRemaining: 0, // Will be calculated dynamically
          isExpired: false, // Will be calculated dynamically
          hasTimeLimit,
        });
        
        setTeamBalance(teamTiebreaker?.team_balance || 0);
        
        // Set user bids in round
        if (result.data.userBidsInRound) {
          setUserBidsInRound(result.data.userBidsInRound);
        }
        
        // Set tied teams
        if (result.data.teamTiebreakers) {
          setTiedTeams(result.data.teamTiebreakers);
        }
      } else {
        setError(result.error || 'Failed to load tiebreaker details');
      }
    } catch (error) {
      console.error('Error fetching tiebreaker:', error);
      setError('An error occurred while loading the tiebreaker');
    } finally {
      setLoadingData(false);
    }
  };

  useEffect(() => {
    if (user && tiebreakerId) {
      fetchTiebreakerDetails();
      
      // Auto-refresh every 3 seconds
      const interval = setInterval(() => {
        fetchTiebreakerDetails();
      }, 3000);
      
      return () => clearInterval(interval);
    }
  }, [user, tiebreakerId]);

  // Check if tiebreaker is resolved and redirect to dashboard
  useEffect(() => {
    if (tiebreaker && tiebreaker.submitted && tiebreaker.status === 'resolved') {
      console.log('✅ Tiebreaker resolved, redirecting to dashboard...');
      setTimeout(() => {
        router.push('/dashboard/team');
      }, 2000); // Wait 2 seconds to show resolution message
    }
  }, [tiebreaker, router]);

  // Update current time every second for dynamic timer
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(Date.now());
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!tiebreaker) return;
    
    const amount = typeof bidAmount === 'number' ? Math.floor(bidAmount) : 0;
    
    // Validation
    if (amount < Math.floor(tiebreaker.original_amount)) {
      setError(`Bid must be at least £${Math.floor(tiebreaker.original_amount).toLocaleString()} (the tied bid amount)`);
      return;
    }
    
    if (amount > teamBalance) {
      setError(`Bid exceeds your balance of £${teamBalance.toLocaleString()}`);
      return;
    }
    
    setError('');
    setSubmitting(true);
    
    console.log('💰 Submitting tiebreaker bid:', { amount, bidAmount, tiebreakerId });
    
    try {
      // Refresh token before submitting
      if (firebaseUser) {
        try {
          const idToken = await firebaseUser.getIdToken(true);
          await fetchWithTokenRefresh('/api/auth/set-token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ token: idToken }),
          });
        } catch (tokenError) {
          console.error('Token refresh failed:', tokenError);
        }
      }
      
      const response = await fetchWithTokenRetry(`/api/tiebreakers/${tiebreakerId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newBidAmount: amount }),
      });
      
      console.log('📤 Sent bid amount:', amount);
      
      const result = await response.json();
      
      if (result.success) {
        // Refresh to show submitted state
        fetchTiebreakerDetails();
      } else {
        setError(result.error || 'Failed to submit bid');
      }
    } catch (error) {
      console.error('Error submitting bid:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Calculate time remaining dynamically
  const getTimeRemaining = () => {
    if (!tiebreaker) return Infinity;
    // If duration_minutes is null, tiebreaker never expires
    if (tiebreaker.duration_minutes === null || tiebreaker.duration_minutes === undefined) return Infinity;
    if (!tiebreaker.hasTimeLimit || !tiebreaker.expiresAt) return Infinity;
    const expiryTime = new Date(tiebreaker.expiresAt).getTime();
    return Math.max(0, expiryTime - currentTime);
  };

  const isExpired = () => {
    if (!tiebreaker) return false;
    // If duration_minutes is null, tiebreaker never expires
    if (tiebreaker.duration_minutes === null || tiebreaker.duration_minutes === undefined) return false;
    if (!tiebreaker.hasTimeLimit) return false; // No time limit = never expires
    return getTimeRemaining() === 0;
  };

  const formatTimeRemaining = (timeRemaining: number) => {
    if (!tiebreaker?.hasTimeLimit) return 'No time limit';
    if (timeRemaining === 0) return 'Expired';
    if (timeRemaining === Infinity) return 'No time limit';
    
    const milliseconds = timeRemaining;
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) return `${hours}h ${minutes % 60}m ${seconds % 60}s remaining`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s remaining`;
    return `${seconds}s remaining`;
  };

  if (loading || !user || loadingData) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading Tiebreaker...</p>
        </div>
      </div>
    );
  }

  if (!tiebreaker) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 space-y-4">
          <p className="text-rose-600 font-extrabold uppercase tracking-wider">{error || 'Tiebreaker not found'}</p>
          <Link
            href="/dashboard/team"
            className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-bold inline-block"
          >
            Return to Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-3xl mx-auto relative z-10 space-y-6">
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4 font-mono">
            <div className="flex items-center">
              <div className="bg-amber-50 border border-amber-250 p-2 rounded-xl mr-3">
                <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-grow">
                <h2 className="text-xl font-extrabold uppercase tracking-wider text-slate-800">Tiebreaker Required</h2>
                <p className="text-[10px] text-slate-500 uppercase font-semibold mt-1">
                  Round {tiebreaker.round_position} • {new Date(tiebreaker.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            <div className="text-left sm:text-right">
              <p className="text-[10px] text-slate-400 uppercase font-bold">Balance</p>
              <p className="text-lg font-black text-emerald-600">£{teamBalance.toLocaleString()}</p>
            </div>
          </div>

          {/* Status Alert */}
          <div className="bg-amber-50/50 border border-amber-200 p-4 mb-6 rounded-2xl font-mono border-l-4 border-l-amber-500">
            <div className="flex items-start">
              <svg className="h-5 w-5 text-amber-500 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              <div className="ml-3">
                <h3 className="text-xs text-amber-800 font-extrabold uppercase tracking-wide">URGENT: Action Required</h3>
                <p className="text-[11px] text-amber-700 font-semibold mt-1">
                  Your bid of <strong className="text-slate-800">£{Math.floor(tiebreaker.original_amount).toLocaleString()}</strong> for{' '}
                  <strong className="text-slate-800">{tiebreaker.player.name}</strong> is tied. Please submit a new higher bid to win this player.
                </p>
                <p className="text-xs text-rose-600 font-black mt-2 uppercase tracking-wide">
                  {formatTimeRemaining(getTimeRemaining())}
                </p>
              </div>
            </div>
          </div>

          {/* Player Card */}
          <div className="mb-8 font-mono">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 mb-4 flex items-center">
              <svg className="w-5 h-5 text-slate-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zm-4 7a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              Player Information
            </h3>
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm border-l-4 border-l-slate-300">
              <div className="flex items-center">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mr-4">
                  <span className="text-lg font-black text-slate-700">{tiebreaker.player.position}</span>
                </div>
                <div className="flex-grow">
                  <h4 className="text-lg font-extrabold uppercase tracking-wide text-slate-850">{tiebreaker.player.name}</h4>
                  <div className="flex items-center mt-1 gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded-lg text-[10px] font-black border uppercase tracking-wider bg-slate-100 border-slate-205 text-slate-650">
                      {tiebreaker.player.position}
                    </span>
                    {tiebreaker.player.team_name && (
                      <span className="text-[10px] text-slate-400 uppercase font-bold">{tiebreaker.player.team_name}</span>
                    )}
                    {tiebreaker.player.overall_rating && (
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-black text-amber-500">★ {tiebreaker.player.overall_rating}</span>
                      </div>
                    )}
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] uppercase font-bold text-slate-505">
                    <div>
                      <span>Original Bid:</span>
                      <p className="font-mono font-black text-xs text-slate-800 mt-0.5">£{Math.floor(tiebreaker.original_amount).toLocaleString()}</p>
                    </div>
                    <div>
                      <span>Minimum New Bid:</span>
                      <p className="font-mono font-black text-xs text-slate-800 mt-0.5">
                        £{Math.floor(tiebreaker.original_amount).toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Bid Submission */}
          <div className="mb-8 font-mono">
            <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 mb-4 flex items-center">
              <svg className="w-5 h-5 text-slate-505 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Submit New Bid
            </h3>

            {tiebreaker.submitted ? (
              <div className="console-card bg-emerald-50/30 border border-emerald-250 rounded-2xl p-4 border-l-4 border-l-emerald-500">
                <div className="flex items-start">
                  <svg className="h-5 w-5 text-emerald-600 mt-0.5 animate-pulse" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <div className="ml-3">
                    <p className="text-[11px] text-emerald-800 uppercase font-black">
                      You have submitted a new bid of £{tiebreaker.new_amount?.toLocaleString()}.
                    </p>
                    <p className="text-[10px] text-emerald-600 uppercase font-bold mt-1">
                      Waiting for other teams to submit their bids...
                    </p>
                    <div className="mt-3 flex items-center text-[10px] text-emerald-600 uppercase font-bold">
                      <svg className="animate-spin h-4 w-4 text-emerald-600 mr-2" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      <span>Auto-refreshing...</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm">
                <div className="mb-4">
                  <label htmlFor="bidAmount" className="block text-[10px] uppercase font-bold text-slate-405 mb-2">
                    New Bid Amount
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-slate-500 font-extrabold text-sm">£</span>
                    </div>
                    <input
                      type="number"
                      id="bidAmount"
                      value={bidAmount}
                      onChange={(e) => {
                        setHasUserModifiedBid(true);
                        const value = e.target.value;
                        const parsedValue = value === '' ? 0 : Math.floor(parseFloat(value));
                        console.log('🔤 Input changed:', { rawValue: value, parsedValue, currentBidAmount: bidAmount });
                        setBidAmount(parsedValue);
                      }}
                      min={Math.floor(tiebreaker.original_amount)}
                      step="1"
                      disabled={tiebreaker.submitted}
                      className="block w-full pl-8 pr-20 py-3 bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-lg font-black disabled:opacity-50 disabled:cursor-not-allowed"
                    />
                    <div className="absolute inset-y-0 right-0 flex items-center mr-2 gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          setHasUserModifiedBid(true);
                          const current = typeof bidAmount === 'number' && bidAmount > 0 ? bidAmount : Math.floor(tiebreaker.original_amount);
                          setBidAmount(Math.max(Math.floor(tiebreaker.original_amount), current - 1));
                        }}
                        disabled={tiebreaker.submitted}
                        className="p-1 text-slate-400 hover:text-amber-600 disabled:opacity-50"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
                        </svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setHasUserModifiedBid(true);
                          const current = typeof bidAmount === 'number' && bidAmount > 0 ? bidAmount : Math.floor(tiebreaker.original_amount);
                          setBidAmount(current + 1);
                        }}
                        disabled={tiebreaker.submitted}
                        className="p-1 text-slate-400 hover:text-amber-600 disabled:opacity-50"
                      >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-between mt-2 text-[10px] uppercase font-bold text-slate-400">
                    <span>Minimum: £{Math.floor(tiebreaker.original_amount).toLocaleString()}</span>
                    <span>
                      Your balance: <span className="font-black text-emerald-600">£{Math.floor(teamBalance).toLocaleString()}</span>
                    </span>
                  </div>
                </div>

                {error && (
                  <div className="mb-4 bg-rose-50 border border-rose-250 p-3 rounded-2xl text-xs font-bold text-rose-700 uppercase">
                    {error}
                  </div>
                )}

                <div className="flex gap-3 justify-end">
                  <button
                    type="button"
                    onClick={() => {
                      setHasUserModifiedBid(true);
                      setBidAmount(Math.floor(tiebreaker.original_amount) + 10);
                    }}
                    className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-bold"
                  >
                    Quick Bid: £{(Math.floor(tiebreaker.original_amount) + 10).toLocaleString()}
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl font-mono text-xs uppercase tracking-wider font-extrabold transition-all disabled:opacity-50 flex items-center"
                  >
                    {submitting ? (
                      <>
                        <svg className="animate-spin h-4 w-4 mr-2" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        Submitting...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Submit Bid
                      </>
                    )}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Tied Teams */}
          {tiedTeams.length > 0 && (
            <div className="mb-8">
              <h3 className="text-lg font-semibold text-dark mb-4 flex items-center">
                <svg className="w-5 h-5 text-[#0066FF] mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
                Teams in Tiebreaker
              </h3>
              <div className="bg-white/60 p-5 rounded-2xl shadow-sm">
                <p className="text-sm text-gray-600 mb-4">
                  {tiedTeams.length} team{tiedTeams.length !== 1 ? 's' : ''} tied with the same bid amount:
                </p>
                <div className="space-y-3">
                  {tiedTeams.map((team) => (
                    <div
                      key={team.team_id}
                      className={`flex items-center justify-between p-4 rounded-xl ${
                        team.is_current_user
                          ? 'bg-blue-50 border-2 border-blue-400'
                          : team.submitted
                          ? 'bg-green-50'
                          : 'bg-gray-50'
                      }`}
                    >
                      <div className="flex items-center flex-1">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center mr-3 ${
                          team.is_current_user
                            ? 'bg-blue-500'
                            : team.submitted
                            ? 'bg-green-500'
                            : 'bg-gray-400'
                        }`}>
                          <span className="text-white font-bold text-lg">
                            {team.team_name.charAt(0).toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-semibold text-dark">{team.team_name}</p>
                            {team.is_current_user && (
                              <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-blue-600 text-white">
                                You
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            {team.submitted ? (
                              <>
                                <span className="text-xs text-green-600 font-medium flex items-center">
                                  <svg className="w-3 h-3 mr-1" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                  </svg>
                                  Bid Submitted
                                </span>
                              </>
                            ) : (
                              <span className="text-xs text-gray-500 font-medium flex items-center">
                                <svg className="w-3 h-3 mr-1 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
                                </svg>
                                Pending
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                
                {/* Summary */}
                <div className="mt-4 pt-4 border-t border-gray-200">
                  <div className="grid grid-cols-2 gap-2 text-center text-sm">
                    <div>
                      <p className="text-gray-600">Submitted</p>
                      <p className="font-bold text-green-600">
                        {tiedTeams.filter(t => t.submitted).length}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-600">Pending</p>
                      <p className="font-bold text-gray-600">
                        {tiedTeams.filter(t => !t.submitted).length}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* User's All Bids in This Round */}
          {userBidsInRound.length > 0 && (
            <div className="mb-8 font-mono">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-slate-800 mb-4 flex items-center">
                <svg className="w-5 h-5 text-slate-500 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
                Your Bids in This Round
              </h3>
              <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm">
                <p className="text-xs text-slate-500 uppercase font-semibold mb-4">
                  See how your bids compare to help you decide on this tiebreaker:
                </p>
                <div className="space-y-3">
                  {userBidsInRound.map((bid) => {
                    const statusConfig = {
                      won: { icon: '🏆', color: 'text-emerald-600', bg: 'bg-emerald-50/30 border-emerald-200', label: 'You Won' },
                      allocated_to_other: { icon: '💀', color: 'text-rose-650', bg: 'bg-rose-50/30 border-rose-200', label: `Won by ${bid.allocated_to_team}` },
                      lost: { icon: '💀', color: 'text-rose-650', bg: 'bg-rose-50/30 border-rose-200', label: 'Lost' },
                      tiebreaker: { icon: '⚖️', color: 'text-amber-600', bg: 'bg-amber-50/30 border-amber-200', label: 'Current Tiebreaker' },
                      tiebreaker_other: { icon: '⚖️', color: 'text-amber-600', bg: 'bg-amber-50/30 border-amber-200', label: 'Other Tiebreaker' },
                      available: { icon: '✨', color: 'text-blue-600', bg: 'bg-slate-55 border-slate-200', label: 'Still Available' },
                      pending: { icon: '⏳', color: 'text-slate-500', bg: 'bg-slate-50 border-slate-200', label: 'Pending' },
                    };
                    
                    const config = statusConfig[bid.allocation_status];
                    
                    return (
                      <div
                        key={bid.bid_id}
                        className={`flex items-center justify-between p-3 rounded-2xl border ${config.bg} ${
                          bid.is_current_tiebreaker ? 'border-2 border-amber-400' : ''
                        }`}
                      >
                        <div className="flex items-center flex-1">
                          <span className="text-xl mr-3">{config.icon}</span>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-extrabold text-sm text-slate-850 uppercase tracking-wide">{bid.player_name}</p>
                              <span className="px-1.5 py-0.5 rounded-lg text-[9px] font-black border uppercase tracking-wider bg-white border-slate-205 text-slate-600">
                                {bid.position}
                              </span>
                              {bid.overall_rating && (
                                <span className="text-[10px] text-amber-500 font-black">★ {bid.overall_rating}</span>
                              )}
                            </div>
                            <p className={`text-[10px] ${config.color} font-bold mt-1 uppercase tracking-wider`}>
                              {config.label}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-mono font-black text-slate-800">£{bid.bid_amount.toLocaleString()}</p>
                          <p className="text-[9px] text-slate-400 uppercase font-bold">Your bid</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Summary */}
                <div className="mt-4 pt-4 border-t border-slate-200">
                  <div className="grid grid-cols-3 gap-2 text-center text-[10px] uppercase font-bold text-slate-450">
                    <div>
                      <span>Allocated</span>
                      <p className="font-mono font-black text-xs text-rose-600 mt-0.5">
                        {userBidsInRound.filter(b => b.allocation_status === 'allocated_to_other').length}
                      </p>
                    </div>
                    <div>
                      <span>Available</span>
                      <p className="font-mono font-black text-xs text-blue-600 mt-0.5">
                        {userBidsInRound.filter(b => b.allocation_status === 'available').length}
                      </p>
                    </div>
                    <div>
                      <span>Tiebreakers</span>
                      <p className="font-mono font-black text-xs text-amber-600 mt-0.5">
                        {userBidsInRound.filter(b => b.allocation_status === 'tiebreaker' || b.allocation_status === 'tiebreaker_other').length}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div className="flex justify-between items-center font-mono">
            <Link
              href="/dashboard/team"
              className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-bold flex items-center"
            >
              <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
              </svg>
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
