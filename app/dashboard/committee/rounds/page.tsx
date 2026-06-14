'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { extractIdNumberAsInt } from '@/lib/id-utils';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import FinalizationProgress from '@/components/FinalizationProgress';
import { useModal } from '@/hooks/useModal';
import { MultiRoundAutoFinalize } from '@/components/MultiRoundAutoFinalize';
import AlertModal from '@/components/modals/AlertModal';
import ConfirmModal from '@/components/modals/ConfirmModal';
import { useWebSocket } from '@/hooks/useWebSocket';
import { ArrowLeft, Trash2, ShieldAlert, CheckCircle2, AlertTriangle, Info, Sparkles, Plus, Clock, Users, ChevronRight, ChevronDown, RefreshCw, Play, DollarSign, Check, FileText, Settings, Calendar, ArrowRight, Layers, HelpCircle, XCircle, CheckCircle, BarChart2 } from 'lucide-react';


interface Round {
  id: string;
  season_id: string;
  position: string;
  round_number?: number;
  max_bids_per_team: number;
  status: string;
  end_time: string;
  created_at: string;
  updated_at: string;
  total_bids: number;
  teams_bid: number;
  start_time?: string;
  player_count?: number;
  finalization_mode?: 'auto' | 'manual';
  has_pending_allocations?: boolean;
}

interface Tiebreaker {
  id: string;
  round_id: string;
  player_id: string;
  player_name: string;
  position: string;
  original_amount: number;
  status: string;
  teams_count: number;
  submitted_count: number;
  teams: any[];
}

export default function RoundsManagementPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [currentSeasonId, setCurrentSeasonId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [availablePositions, setAvailablePositions] = useState<string[]>([]);
  const [timeRemaining, setTimeRemaining] = useState<{[key: string]: number}>({});
  const [addTimeInputs, setAddTimeInputs] = useState<{[key: string]: string}>({});
  const [roundTiebreakers, setRoundTiebreakers] = useState<{[key: string]: Tiebreaker[]}>({});
  const [showFinalizationProgress, setShowFinalizationProgress] = useState(false);
  const [finalizingRoundId, setFinalizingRoundId] = useState<string | null>(null);
  const [expandedRounds, setExpandedRounds] = useState<Set<string>>(new Set());
  const [expandedPlayers, setExpandedPlayers] = useState<Set<string>>(new Set());
  const [roundDetails, setRoundDetails] = useState<{[key: string]: any}>({});
  const [roundSubmissions, setRoundSubmissions] = useState<{[key: string]: any}>({});
  const [loadingSubmissions, setLoadingSubmissions] = useState<{[key: string]: boolean}>({});
  const [auctionSettings, setAuctionSettings] = useState<any[]>([]);
  const [selectedAuctionSettingsId, setSelectedAuctionSettingsId] = useState<string>('');
  const timerRefs = useRef<{[key: string]: NodeJS.Timeout}>({});
  const previousRoundsRef = useRef<string>('');

  // Modal system
  const {
    alertState,
    showAlert,
    closeAlert,
    confirmState,
    showConfirm,
    closeConfirm,
    handleConfirm,
  } = useModal();

  // Form state
  const [formData, setFormData] = useState({
    position: '',
    duration_hours: '2',
    duration_minutes: '0',
    max_bids_per_team: '5',
    finalization_mode: 'auto',
  });
  const [selectedPositions, setSelectedPositions] = useState<string[]>([]);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'committee_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch all data in parallel
  const fetchAllData = useCallback(async () => {
    if (!user || user.role !== 'committee_admin') return;

    setIsLoading(true);
    
    try {
      // Use the committee admin's season ID instead of active season
      // This allows admins to view their assigned season's data even if it's not active
      const seasonId = user.seasonId;
      
      if (!seasonId) {
        console.error('Committee admin has no seasonId assigned');
        setIsLoading(false);
        return;
      }

      setCurrentSeasonId(seasonId);

      // Fetch auction settings for this season
      try {
        const settingsResponse = await fetchWithTokenRefresh(
          `/api/auction-settings/all?season_id=${seasonId}`
        );
        const settingsData = await settingsResponse.json();
        if (settingsData.success && settingsData.data) {
          setAuctionSettings(settingsData.data);
          // Auto-select first setting if none selected
          if (!selectedAuctionSettingsId && settingsData.data.length > 0) {
            setSelectedAuctionSettingsId(String(settingsData.data[0].id));
          }
        }
      } catch (err) {
        console.error('Error fetching auction settings:', err);
      }

      // Fetch rounds, positions, and tiebreakers in parallel
      const roundsParams = new URLSearchParams({ season_id: seasonId });
      const [roundsResponse, playersResponse, tbResponse] = await Promise.all([
        fetchWithTokenRefresh(`/api/admin/rounds?${roundsParams}`),
        fetchWithTokenRefresh('/api/players?is_auction_eligible=true'),
        fetchWithTokenRefresh(`/api/admin/tiebreakers?seasonId=${seasonId}&status=active,pending`).catch(err => {
          console.error('Error fetching tiebreakers:', err);
          return null;
        })
      ]);

      // Process rounds
      const { success: roundsSuccess, data: roundsData } = await roundsResponse.json();
      if (roundsSuccess) {
        const dataString = JSON.stringify(roundsData);
        if (dataString !== previousRoundsRef.current) {
          previousRoundsRef.current = dataString;
          setRounds(roundsData);
          
          // Initialize add time inputs for active rounds
          const activeRounds = roundsData.filter((r: Round) => r.status === 'active');
          activeRounds.forEach((r: Round) => {
            setAddTimeInputs(prev => ({ ...prev, [r.id]: prev[r.id] || '10' }));
          });

        // Fetch submission status for active rounds
        console.log('🔍 [fetchRounds] Found active rounds:', activeRounds.length);
        
        // Set loading state for each active round
        const loadingMap: {[key: string]: boolean} = {};
        activeRounds.forEach((r: Round) => { loadingMap[r.id] = true; });
        setLoadingSubmissions(prev => ({ ...prev, ...loadingMap }));
        
        // Use Promise.all to wait for all submissions to be fetched
        const submissionPromises = activeRounds.map(async (r: Round) => {
          try {
            console.log(`🔍 [fetchRounds] Fetching submissions for round ${r.id}`);
            const subResponse = await fetchWithTokenRefresh(`/api/admin/rounds/${r.id}/submissions`);
            const subData = await subResponse.json();
            console.log(`🔍 [fetchRounds] Submissions response for round ${r.id}:`, subData);
            if (subData.success) {
              console.log(`<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> [fetchRounds] Setting submissions for round ${r.id}:`, subData);
              return { roundId: r.id, data: subData };
            } else {
              console.error(`<XCircle className="w-4 h-4 inline-block text-rose-500 mr-1 align-text-bottom" /> [fetchRounds] Failed to fetch submissions for round ${r.id}:`, subData.error);
              return null;
            }
          } catch (err) {
            console.error(`<XCircle className="w-4 h-4 inline-block text-rose-500 mr-1 align-text-bottom" /> [fetchRounds] Error fetching submissions for round ${r.id}:`, err);
            return null;
          }
        });
        
        const submissionResults = await Promise.all(submissionPromises);
        const submissionsMap: {[key: string]: any} = {};
        submissionResults.forEach(result => {
          if (result) {
            submissionsMap[result.roundId] = {
              ...result.data.stats,
              teams: result.data.teams
            };
          }
        });
        console.log('📦 [fetchRounds] All submissions fetched:', submissionsMap);
        setRoundSubmissions(prev => ({ ...prev, ...submissionsMap }));
        
        // Clear loading state
        const clearedLoadingMap: {[key: string]: boolean} = {};
        activeRounds.forEach((r: Round) => { clearedLoadingMap[r.id] = false; });
        setLoadingSubmissions(prev => ({ ...prev, ...clearedLoadingMap }));
        }
      }

      // Process positions and position groups
      const { success: playersSuccess, data: playersData } = await playersResponse.json();
      if (playersSuccess && playersData.length > 0) {
        // Get all unique positions
        const allPositions = [...new Set(playersData.map((p: any) => p.position).filter(Boolean))] as string[];
        
        // Get positions that have been divided into groups
        const positionGroups = [...new Set(
          playersData
            .map((p: any) => p.position_group)
            .filter(Boolean)
        )] as string[];
        
        // Create map of which positions have groups
        const positionsWithGroups = new Set(
          positionGroups.map(pg => pg.split('-')[0]) // Extract position from "CB-1" &rarr; "CB"
        );
        
        console.log('<BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> [Positions] All positions:', allPositions);
        console.log('<BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> [Positions] Position groups found:', positionGroups);
        console.log('<BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> [Positions] Positions with groups:', Array.from(positionsWithGroups));
        
        // Build final list: use groups if they exist, otherwise use base position
        const finalPositions: string[] = [];
        
        allPositions.forEach(pos => {
          if (positionsWithGroups.has(pos)) {
            // Position has been divided - add all its groups
            const groups = positionGroups.filter(pg => pg.startsWith(`${pos}-`));
            finalPositions.push(...groups);
          } else {
            // Position not divided - add as-is
            finalPositions.push(pos);
          }
        });
        
        console.log('<BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> [Positions] Final dropdown options:', finalPositions);
        setAvailablePositions(finalPositions.sort());
      }

      // Process tiebreakers
      if (tbResponse) {
        const tbData = await tbResponse.json();
        console.log('🔍 Tiebreaker response:', tbData);
        if (tbData.success && tbData.data?.tiebreakers) {
          const tiebreakersByRound: {[key: string]: Tiebreaker[]} = {};
          tbData.data.tiebreakers.forEach((tb: Tiebreaker) => {
            if (!tiebreakersByRound[tb.round_id]) {
              tiebreakersByRound[tb.round_id] = [];
            }
            tiebreakersByRound[tb.round_id].push(tb);
          });
          console.log('🔍 Tiebreakers by round:', tiebreakersByRound);
          // Only update if tiebreakers actually changed
          const tbString = JSON.stringify(tiebreakersByRound);
          setRoundTiebreakers(prev => {
            if (JSON.stringify(prev) !== tbString) {
              return tiebreakersByRound;
            }
            return prev;
          });
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [user]);

  // Fetch rounds only (for updates)
  const fetchRounds = useCallback(async (showLoader = true) => {
    if (!currentSeasonId) return;

    if (showLoader) setIsLoading(true);
    
    try {
      const params = new URLSearchParams({ season_id: currentSeasonId });
      
      // Fetch rounds and tiebreakers in parallel
      const [roundsResponse, tbResponse] = await Promise.all([
        fetchWithTokenRefresh(`/api/admin/rounds?${params}`),
        fetchWithTokenRefresh(`/api/admin/tiebreakers?seasonId=${currentSeasonId}&status=active,pending`).catch(err => {
          console.error('Error fetching tiebreakers:', err);
          return null;
        })
      ]);

      const { success, data } = await roundsResponse.json();
      if (success) {
        const dataString = JSON.stringify(data);
        if (dataString !== previousRoundsRef.current) {
          previousRoundsRef.current = dataString;
          setRounds(data);
          
          // Initialize add time inputs for active rounds
          data.filter((r: Round) => r.status === 'active').forEach((r: Round) => {
            setAddTimeInputs(prev => ({ ...prev, [r.id]: prev[r.id] || '10' }));
          });
        }

        // Fetch submission status for active rounds
        const activeRounds = data.filter((r: Round) => r.status === 'active');
        console.log('🔍 [fetchAllData] Found active rounds:', activeRounds.length);
        
        // Set loading state for each active round
        const loadingMap: {[key: string]: boolean} = {};
        activeRounds.forEach((r: Round) => { loadingMap[r.id] = true; });
        setLoadingSubmissions(loadingMap);
        
        // Use Promise.all to wait for all submissions to be fetched
        const submissionPromises = activeRounds.map(async (r: Round) => {
          try {
            console.log(`🔍 [fetchAllData] Fetching submissions for round ${r.id}`);
            const subResponse = await fetchWithTokenRefresh(`/api/admin/rounds/${r.id}/submissions`);
            const subData = await subResponse.json();
            console.log(`🔍 [fetchAllData] Submissions response for round ${r.id}:`, subData);
            if (subData.success) {
              console.log(`<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> [fetchAllData] Setting submissions for round ${r.id}:`, subData);
              return { roundId: r.id, data: subData };
            } else {
              console.error(`<XCircle className="w-4 h-4 inline-block text-rose-500 mr-1 align-text-bottom" /> [fetchAllData] Failed to fetch submissions for round ${r.id}:`, subData.error);
              return null;
            }
          } catch (err) {
            console.error(`<XCircle className="w-4 h-4 inline-block text-rose-500 mr-1 align-text-bottom" /> [fetchAllData] Error fetching submissions for round ${r.id}:`, err);
            return null;
          }
        });
        
        const submissionResults = await Promise.all(submissionPromises);
        const submissionsMap: {[key: string]: any} = {};
        submissionResults.forEach(result => {
          if (result) {
            submissionsMap[result.roundId] = {
              ...result.data.stats,
              teams: result.data.teams
            };
          }
        });
        console.log('📦 [fetchAllData] All submissions fetched:', submissionsMap);
        setRoundSubmissions(submissionsMap);
        
        // Clear loading state
        const clearedLoadingMap: {[key: string]: boolean} = {};
        activeRounds.forEach((r: Round) => { clearedLoadingMap[r.id] = false; });
        setLoadingSubmissions(clearedLoadingMap);
      }
      
      // Process tiebreakers
      if (tbResponse) {
        const tbData = await tbResponse.json();
        console.log('🔍 Tiebreaker response (fetchRounds):', tbData);
        if (tbData.success && tbData.data?.tiebreakers) {
          const tiebreakersByRound: {[key: string]: Tiebreaker[]} = {};
          tbData.data.tiebreakers.forEach((tb: Tiebreaker) => {
            if (!tiebreakersByRound[tb.round_id]) {
              tiebreakersByRound[tb.round_id] = [];
            }
            tiebreakersByRound[tb.round_id].push(tb);
          });
          console.log('🔍 Tiebreakers by round (fetchRounds):', tiebreakersByRound);
          // Only update if tiebreakers actually changed
          const tbString = JSON.stringify(tiebreakersByRound);
          setRoundTiebreakers(prev => {
            if (JSON.stringify(prev) !== tbString) {
              return tiebreakersByRound;
            }
            return prev;
          });
        }
      }
    } catch (err) {
      console.error('Error fetching rounds:', err);
    } finally {
      if (showLoader) setIsLoading(false);
    }
  }, [currentSeasonId]);

  // Initial fetch
  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Realtime listener for submission updates
  useEffect(() => {
    if (!currentSeasonId || rounds.length === 0) return;

    const activeRounds = rounds.filter(r => r.status === 'active');
    if (activeRounds.length === 0) {
      console.log('🔌 [Realtime] No active rounds found');
      return;
    }

    console.log('🔌 [Realtime] Setting up listeners for', activeRounds.length, 'active rounds:', activeRounds.map(r => r.id));
    console.log('🔌 [Realtime] Season ID:', currentSeasonId);

    // Import Firebase Realtime DB
    const { ref, onValue } = require('firebase/database');
    const { realtimeDb } = require('@/lib/firebase/config');

    if (!realtimeDb) {
      console.error('<XCircle className="w-4 h-4 inline-block text-rose-500 mr-1 align-text-bottom" /> [Realtime] Firebase Realtime Database not initialized!');
      return;
    }

    const unsubscribers: (() => void)[] = [];

    // Listen to each active round for submission updates
    activeRounds.forEach(round => {
      const path = `updates/${currentSeasonId}/rounds/${round.id}`;
      console.log('🔌 [Realtime] Listening to path:', path);
      
      const roundRef = ref(realtimeDb, path);
      
      const unsubscribe = onValue(
        roundRef,
        (snapshot: any) => {
          const data = snapshot.val();
          console.log('📡 [Realtime] Data received for round', round.id, ':', data);
          
          if (data && data.type === 'submission') {
            console.log('<BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> [Realtime] <CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Submission update detected!', {
              round: round.id,
              action: data.action,
              team: data.team_id,
              timestamp: data.timestamp
            });
            
            // Refetch submissions for this round
            console.log('<RefreshCw className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> [Realtime] Refetching submissions for round:', round.id);
            fetchWithTokenRefresh(`/api/admin/rounds/${round.id}/submissions`)
              .then(res => res.json())
              .then(subData => {
                if (subData.success) {
                  console.log('<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> [Realtime] Updated submissions for round:', round.id, subData.stats);
                  setRoundSubmissions(prev => {
                    const updated = {
                      ...prev,
                      [round.id]: {
                        ...subData.stats,
                        teams: subData.teams
                      }
                    };
                    console.log('<BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> [Realtime] New submission state:', updated);
                    return updated;
                  });
                } else {
                  console.error('<XCircle className="w-4 h-4 inline-block text-rose-500 mr-1 align-text-bottom" /> [Realtime] API returned error:', subData.error);
                }
              })
              .catch(err => console.error('<XCircle className="w-4 h-4 inline-block text-rose-500 mr-1 align-text-bottom" /> [Realtime] Failed to fetch submissions:', err));
          } else if (data) {
            console.log('ℹ️ [Realtime] Received data but type is not "submission":', data.type);
          } else {
            console.log('ℹ️ [Realtime] Received null/empty data for round:', round.id);
          }
        },
        (error: any) => {
          console.error('<XCircle className="w-4 h-4 inline-block text-rose-500 mr-1 align-text-bottom" /> [Realtime] Error listening to round', round.id, ':', error);
        }
      );

      unsubscribers.push(unsubscribe);
    });

    return () => {
      console.log('🔌 [Realtime] Disconnecting', unsubscribers.length, 'submission listeners');
      unsubscribers.forEach(unsub => unsub());
    };
  }, [currentSeasonId, rounds]);

  // Debug: Monitor roundSubmissions state changes
  useEffect(() => {
    console.log('📦 [State] roundSubmissions updated:', roundSubmissions);
  }, [roundSubmissions]);

  // ⚡ Comprehensive Firebase Realtime Database listeners for instant updates
  useEffect(() => {
    if (!currentSeasonId) return;

    const { listenToSeasonRoundUpdates, listenToSquadUpdates, listenToWalletUpdates } = require('@/lib/realtime/listeners');
    
    console.log('🔴 [Committee Rounds] Setting up Firebase listeners for season:', currentSeasonId);
    
    // Listen to round updates (started, finalized, status changes, bids submitted)
    const unsubRounds = listenToSeasonRoundUpdates(currentSeasonId, (message: any) => {
      console.log('🔴 [Committee Rounds] Round update:', message.type, message);
      
      if (message.type === 'bid_submitted') {
        // When a team submits bids, refetch submissions for that specific round immediately
        console.log('🔍 [Firebase] Bid submitted for round:', message.data?.round_id);
        if (message.data?.round_id) {
          const roundId = message.data.round_id;
          setLoadingSubmissions(prev => ({ ...prev, [roundId]: true }));
          
          fetchWithTokenRefresh(`/api/admin/rounds/${roundId}/submissions`)
            .then(res => res.json())
            .then(subData => {
              if (subData.success) {
                console.log('<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> [Firebase] Updated submissions for round:', roundId);
                setRoundSubmissions(prev => ({
                  ...prev,
                  [roundId]: {
                    ...subData.stats,
                    teams: subData.teams
                  }
                }));
              }
              setLoadingSubmissions(prev => ({ ...prev, [roundId]: false }));
            })
            .catch(err => {
              console.error('<XCircle className="w-4 h-4 inline-block text-rose-500 mr-1 align-text-bottom" /> [Firebase] Error fetching submissions:', err);
              setLoadingSubmissions(prev => ({ ...prev, [roundId]: false }));
            });
        }
      } else if (
        message.type === 'round_finalized' ||
        message.type === 'round_started' ||
        message.type === 'round_updated' ||
        message.type === 'round_status_changed'
      ) {
        // For round status changes, refetch all rounds data immediately
        console.log('<RefreshCw className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> [Firebase] Refetching all rounds due to:', message.type);
        fetchRounds(false);
      }
    });

    // Listen to squad updates (player allocations during finalization)
    const unsubSquads = listenToSquadUpdates(currentSeasonId, (event: any) => {
      console.log('📦 [Committee Rounds] Squad update:', event);
      // Refetch rounds to update bid counts and team stats
      fetchRounds(false);
    });

    // Listen to wallet updates (balance changes during bidding/finalization)
    const unsubWallets = listenToWalletUpdates(currentSeasonId, (event: any) => {
      console.log('<DollarSign className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> [Committee Rounds] Wallet update:', event);
      // Wallet changes might affect submission status
      fetchRounds(false);
    });

    return () => {
      console.log('🔴 [Committee Rounds] Cleaning up Firebase listeners');
      unsubRounds();
      unsubSquads();
      unsubWallets();
    };
  }, [currentSeasonId, fetchRounds]);

  // Timer management for active rounds - optimized with requestAnimationFrame
  useEffect(() => {
    const activeRounds = rounds.filter(r => r.status === 'active');
    
    if (activeRounds.length === 0) return;

    let animationFrameId: number;
    let lastUpdate = Date.now();

    const updateTimers = () => {
      const now = Date.now();
      
      // Only update every second to reduce re-renders
      if (now - lastUpdate >= 1000) {
        lastUpdate = now;
        
        const newTimeRemaining: {[key: string]: number} = {};
        let hasActiveTimers = false;

        activeRounds.forEach(round => {
          if (round.end_time) {
            const end = new Date(round.end_time).getTime();
            const remaining = Math.max(0, Math.floor((end - now) / 1000));
            newTimeRemaining[round.id] = remaining;
            if (remaining > 0) hasActiveTimers = true;
          }
        });

        setTimeRemaining(newTimeRemaining);
        
        // Continue animation loop only if there are active timers
        if (hasActiveTimers) {
          animationFrameId = requestAnimationFrame(updateTimers);
        }
      } else {
        animationFrameId = requestAnimationFrame(updateTimers);
      }
    };

    // Start the animation loop
    animationFrameId = requestAnimationFrame(updateTimers);

    return () => {
      if (animationFrameId) {
        cancelAnimationFrame(animationFrameId);
      }
    };
  }, [rounds]);

  const handleStartRound = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!currentSeasonId) {
      showAlert({
        type: 'error',
        title: 'No Active Season',
        message: 'No active season found'
      });
      return;
    }

    if (selectedPositions.length === 0) {
      showAlert({
        type: 'warning',
        title: 'Missing Position',
        message: 'Please select at least one position'
      });
      return;
    }

    // Get next round number
    const nextRoundNumber = rounds.length > 0 
      ? Math.max(...rounds.map(r => r.round_number ?? 0)) + 1 
      : 1;

    // Convert hours and minutes to seconds
    const totalHours = parseFloat(formData.duration_hours) + (parseFloat(formData.duration_minutes) / 60);
    const durationSeconds = Math.round(totalHours * 3600);

    // Combine selected positions with comma separator
    const combinedPosition = selectedPositions.join(',');

    // Validate auction settings selected
    if (!selectedAuctionSettingsId) {
      showAlert({
        type: 'warning',
        title: 'Missing Settings',
        message: 'Please select auction settings'
      });
      return;
    }

    try {
      const response = await fetchWithTokenRefresh('/api/admin/rounds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auction_settings_id: parseInt(selectedAuctionSettingsId),
          position: combinedPosition,
          max_bids_per_team: parseInt(formData.max_bids_per_team),
          duration_hours: (parseFloat(formData.duration_hours) + (parseFloat(formData.duration_minutes) / 60)).toString(),
          finalization_mode: formData.finalization_mode,
        }),
      });

      const { success, error } = await response.json();

      if (success) {
        showAlert({
          type: 'success',
          title: 'Round Started',
          message: `Round for ${selectedPositions.join(' + ')} started successfully!`
        });
        setFormData({
          position: '',
          duration_hours: '2',
          duration_minutes: '0',
          max_bids_per_team: '5',
          finalization_mode: 'auto',
        });
        setSelectedPositions([]);
        
        // Refresh rounds
        const params = new URLSearchParams({ season_id: currentSeasonId });
        const refreshResponse = await fetchWithTokenRefresh(`/api/admin/rounds?${params}`);
        const refreshData = await refreshResponse.json();
        if (refreshData.success) {
          setRounds(refreshData.data);
        }
      } else {
        showAlert({
          type: 'error',
          title: 'Error',
          message: error || 'Failed to start round'
        });
      }
    } catch (err) {
      console.error('Error starting round:', err);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to start round'
      });
    }
  };

  const handleAddTime = async (roundId: string) => {
    const minutes = parseInt(addTimeInputs[roundId] || '10');
    
    if (minutes < 5) {
      showAlert({
        type: 'warning',
        title: 'Invalid Duration',
        message: 'Duration must be at least 5 minutes'
      });
      return;
    }

    try {
      const round = rounds.find(r => r.id === roundId);
      if (!round || !round.end_time) return;

      const currentEnd = new Date(round.end_time);
      const newEnd = new Date(currentEnd.getTime() + (minutes * 60 * 1000));

      const response = await fetchWithTokenRefresh(`/api/rounds/${roundId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          end_time: newEnd.toISOString(),
        }),
      });

      const { success } = await response.json();

      if (success) {
        showAlert({
          type: 'success',
          title: 'Time Added',
          message: `Added ${minutes} minute${minutes !== 1 ? 's' : ''} to the timer`
        });
        
        // Refresh rounds
        const params = new URLSearchParams({ season_id: currentSeasonId! });
        const refreshResponse = await fetchWithTokenRefresh(`/api/rounds?${params}`);
        const refreshData = await refreshResponse.json();
        if (refreshData.success) {
          setRounds(refreshData.data);
        }
      }
    } catch (err) {
      console.error('Error adding time:', err);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to add time'
      });
    }
  };


  const handleFinalizeRound = async (roundId: string) => {
    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Finalize Round',
      message: 'Are you sure you want to finalize this round? This will allocate players based on bids. This cannot be undone.',
      confirmText: 'Finalize',
      cancelText: 'Cancel'
    });
    
    if (!confirmed) {
      return;
    }

    // Show progress modal and start finalization
    setFinalizingRoundId(roundId);
    setShowFinalizationProgress(true);
  };

  const handleFinalizationComplete = () => {
    setShowFinalizationProgress(false);
    setFinalizingRoundId(null);
    
    // Refresh rounds list
    if (currentSeasonId) {
      const params = new URLSearchParams({ season_id: currentSeasonId });
      fetchWithTokenRefresh(`/api/admin/rounds?${params}`)
        .then(res => res.json())
        .then(data => {
          if (data.success) {
            setRounds(data.data);
          }
        });
    }
  };

  const handleFinalizationError = (error: string) => {
    console.error('Finalization error:', error);
    // Modal will show error state, user can close it
  };

  const handleResolveTiebreaker = async (tiebreakerId: string, roundId: string) => {
    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Resolve Tiebreaker',
      message: 'This will resolve the tiebreaker and finalize the round if all tiebreakers are resolved. Continue?',
      confirmText: 'Resolve',
      cancelText: 'Cancel'
    });
    
    if (!confirmed) {
      return;
    }

    try {
      // Call the tiebreaker resolution API
      const response = await fetchWithTokenRefresh(`/api/tiebreakers/${tiebreakerId}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resolutionType: 'auto' }),
      });

      const result = await response.json();

      if (result.success) {
        showAlert({
          type: 'success',
          title: 'Tiebreaker Resolved',
          message: result.message || 'Tiebreaker resolved successfully'
        });
        
        // Refresh rounds to update tiebreaker status
        fetchRounds(false);
      } else {
        showAlert({
          type: 'error',
          title: 'Resolution Failed',
          message: result.error || 'Failed to resolve tiebreaker'
        });
      }
    } catch (err) {
      console.error('Error resolving tiebreaker:', err);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to resolve tiebreaker'
      });
    }
  };

  const toggleRound = async (roundId: string) => {
    const newExpanded = new Set(expandedRounds);
    if (newExpanded.has(roundId)) {
      newExpanded.delete(roundId);
    } else {
      newExpanded.add(roundId);
      // Fetch round details if not already loaded
      if (!roundDetails[roundId]) {
        try {
          const response = await fetchWithTokenRefresh(`/api/rounds/${roundId}`);
          const { success, data } = await response.json();
          if (success) {
            setRoundDetails(prev => ({ ...prev, [roundId]: data }));
          }
        } catch (err) {
          console.error('Error fetching round details:', err);
        }
      }
    }
    setExpandedRounds(newExpanded);
  };

  const togglePlayer = (playerKey: string) => {
    const newExpanded = new Set(expandedPlayers);
    if (newExpanded.has(playerKey)) {
      newExpanded.delete(playerKey);
    } else {
      newExpanded.add(playerKey);
    }
    setExpandedPlayers(newExpanded);
  };

  const organizeBidsByPlayer = (bids: any[]) => {
    const byPlayer: {[key: string]: any[]} = {};
    
    bids.forEach(bid => {
      if (!byPlayer[bid.player_id]) {
        byPlayer[bid.player_id] = [];
      }
      byPlayer[bid.player_id].push(bid);
    });
    
    // Sort bids within each player by amount (highest first)
    Object.keys(byPlayer).forEach(playerId => {
      byPlayer[playerId].sort((a, b) => b.amount - a.amount);
    });
    
    return byPlayer;
  };

  const handlePreviewFinalization = async (roundId: string) => {
    // Prevent multiple clicks
    if (loadingSubmissions[roundId]) {
      return;
    }
    
    setLoadingSubmissions({ ...loadingSubmissions, [roundId]: true });
    
    try {
      const response = await fetchWithTokenRefresh(`/api/admin/rounds/${roundId}/preview-finalization`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (result.success) {
        showAlert({
          type: 'success',
          title: 'Preview Created',
          message: `Preview finalization created successfully. ${result.data?.allocations?.length || 0} players allocated.`
        });
        
        // Refresh rounds to update status
        fetchRounds(false);
      } else if (result.tieDetected) {
        showAlert({
          type: 'warning',
          title: 'Tiebreaker Detected',
          message: 'A tiebreaker was detected and must be resolved before finalization can proceed.'
        });
        
        // Refresh to show tiebreaker
        fetchRounds(false);
      } else {
        showAlert({
          type: 'error',
          title: 'Preview Failed',
          message: result.error || 'Failed to create preview'
        });
      }
    } catch (err) {
      console.error('Error previewing finalization:', err);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to preview finalization'
      });
    } finally {
      setLoadingSubmissions(prev => ({ ...prev, [roundId]: false }));
    }
  };

  const handleFinalizeImmediately = async (roundId: string) => {
    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Finalize Immediately',
      message: 'This will skip the preview and finalize the round immediately. Results will be published to teams right away. Continue?',
      confirmText: 'Finalize Now',
      cancelText: 'Cancel'
    });
    
    if (!confirmed) {
      return;
    }

    // Use the existing finalization flow
    setFinalizingRoundId(roundId);
    setShowFinalizationProgress(true);
  };

  const handleViewPendingResults = (roundId: string) => {
    // Navigate to the dedicated pending results page
    router.push(`/dashboard/committee/rounds/${roundId}/pending-results`);
  };

  const handleApplyPendingAllocations = async (roundId: string) => {
    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Finalize for Real',
      message: 'This will apply the pending allocations and publish results to all teams. This action cannot be undone. Continue?',
      confirmText: 'Finalize for Real',
      cancelText: 'Cancel'
    });
    
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetchWithTokenRefresh(`/api/admin/rounds/${roundId}/apply-pending-allocations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const result = await response.json();

      if (result.success) {
        showAlert({
          type: 'success',
          title: 'Round Finalized',
          message: 'Pending allocations applied successfully. Results are now visible to teams.'
        });
        
        // Refresh rounds to update status
        fetchRounds(false);
      } else {
        showAlert({
          type: 'error',
          title: 'Finalization Failed',
          message: result.error || 'Failed to apply pending allocations'
        });
      }
    } catch (err) {
      console.error('Error applying pending allocations:', err);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to apply pending allocations'
      });
    }
  };

  const handleCancelPending = async (roundId: string) => {
    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Cancel Pending Results',
      message: 'This will delete the pending allocations. You can preview finalization again afterwards. Continue?',
      confirmText: 'Cancel Pending',
      cancelText: 'Keep Pending'
    });
    
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetchWithTokenRefresh(`/api/admin/rounds/${roundId}/pending-allocations`, {
        method: 'DELETE',
      });

      const result = await response.json();

      if (result.success) {
        showAlert({
          type: 'success',
          title: 'Pending Results Canceled',
          message: 'Pending allocations have been deleted. You can preview finalization again.'
        });
        
        // Refresh rounds to update status
        fetchRounds(false);
      } else {
        showAlert({
          type: 'error',
          title: 'Cancellation Failed',
          message: result.error || 'Failed to cancel pending allocations'
        });
      }
    } catch (err) {
      console.error('Error canceling pending allocations:', err);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to cancel pending allocations'
      });
    }
  };

  const handleDeleteRound = async (roundId: string) => {
    const confirmed = await showConfirm({
      type: 'danger',
      title: 'Delete Round',
      message: 'Are you sure you want to delete this round? This will release all players allocated in this round. This action cannot be undone.',
      confirmText: 'Delete',
      cancelText: 'Cancel'
    });
    
    if (!confirmed) {
      return;
    }

    try {
      const response = await fetchWithTokenRefresh(`/api/rounds/${roundId}`, {
        method: 'DELETE',
      });

      const { success } = await response.json();

      if (success) {
        showAlert({
          type: 'success',
          title: 'Round Deleted',
          message: 'Round deleted successfully'
        });
        const params = new URLSearchParams({ season_id: currentSeasonId! });
        const refreshResponse = await fetchWithTokenRefresh(`/api/rounds?${params}`);
        const refreshData = await refreshResponse.json();
        if (refreshData.success) {
          setRounds(refreshData.data);
        }
      }
    } catch (err) {
      console.error('Error deleting round:', err);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to delete round'
      });
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const activeRounds = rounds.filter(r => r.status === 'active');
  const finalizingRounds = rounds.filter(r => r.status === 'tiebreaker_pending');
  const expiredRounds = rounds.filter(r => r.status === 'expired' || r.status === 'expired_pending_finalization' || r.status === 'pending_finalization');
  const completedRounds = rounds.filter(r => r.status === 'completed');

  // Debug logging
  console.log('🔍 [Rounds Page] Total rounds:', rounds.length);
  console.log('🔍 [Rounds Page] Active rounds:', activeRounds.length);
  console.log('🔍 [Rounds Page] Completed rounds:', completedRounds.length);
  console.log('🔍 [Rounds Page] Current season ID:', currentSeasonId);
  console.log('🔍 [Rounds Page] All rounds:', rounds.map(r => ({ id: r.id, status: r.status, season_id: r.season_id })));

  if (loading || !user || user.role !== 'committee_admin' || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading round console...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Decorative glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      {/* <CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Auto-finalize all active rounds */}
      <MultiRoundAutoFinalize 
        rounds={rounds} 
        onFinalizationComplete={() => fetchRounds(false)}
      />
      
      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/committee"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <Settings className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">COMMITTEE CONSOLE</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Round Management
              </h1>
              <p className="text-xs text-slate-405 font-mono mt-1">
                Create and manage auction rounds and bidding sessions.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-3 py-1.5 rounded-full bg-blue-50 border border-blue-200 text-blue-805 text-xs font-semibold uppercase font-mono shadow-sm">
              <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-blue-500 mr-2 animate-pulse"></span>
              <span>{activeRounds.length} Active</span>
            </span>
          </div>
        </div>

        {/* Start New Round Form */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
          <h2 className="text-sm sm:text-base font-extrabold mb-4 uppercase text-slate-900 tracking-wide flex items-center gap-2">
            <Plus className="w-4 h-4 text-amber-500" />
            Start New Round
          </h2>
          <form onSubmit={handleStartRound} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="position" className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mb-1.5 block">
                  Position(s) <span className="text-slate-400/70 lowercase font-normal">(Select multiple for combined rounds)</span>
                </label>
                <div className="relative">
                  <span className="absolute top-3.5 left-3 flex items-center pointer-events-none text-slate-405">
                    <Layers className="w-4 h-4" />
                  </span>
                  <div className="pl-10 min-h-[48px] w-full py-2 bg-white border border-slate-200 rounded-xl focus-within:ring-2 focus-within:ring-amber-500/20 focus-within:border-amber-500 transition-all duration-200 shadow-sm">
                    {/* Selected positions */}
                    {selectedPositions.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 px-2 mb-2">
                        {selectedPositions.map(pos => (
                          <span key={pos} className="inline-flex items-center px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs font-bold font-mono">
                            {pos}
                            <button
                              type="button"
                              onClick={() => setSelectedPositions(prev => prev.filter(p => p !== pos))}
                              className="ml-1 text-amber-600 hover:text-amber-850 font-bold"
                            >
                              ✕
                            </button>
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Dropdown */}
                    <select
                      id="position"
                      value=""
                      onChange={(e) => {
                        if (e.target.value && !selectedPositions.includes(e.target.value)) {
                          setSelectedPositions(prev => [...prev, e.target.value]);
                        }
                      }}
                      className="w-full px-2 py-1 bg-transparent border-none focus:ring-0 outline-none text-sm font-bold font-mono text-slate-700 pl-10"
                    >
                      <option value="">+ Add position</option>
                      {availablePositions
                        .filter(pos => !selectedPositions.includes(pos))
                        .map(position => (
                          <option key={position} value={position}>{position}</option>
                        ))
                      }
                    </select>
                  </div>
                </div>
                <p className="mt-1 text-[10px] text-slate-400 font-mono">Select one position for regular rounds, or multiple for combined rounds (e.g. LB + LWF)</p>
              </div>

              {/* Auction Settings Selector */}
              <div>
                <label htmlFor="auction_settings" className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mb-1.5 block">
                  Auction Settings <span className="text-slate-400/70 lowercase font-normal">(Window Type)</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                    <Settings className="w-4 h-4" />
                  </span>
                  <select
                    id="auction_settings"
                    value={selectedAuctionSettingsId}
                    onChange={(e) => setSelectedAuctionSettingsId(e.target.value)}
                    required
                    className="pl-10 w-full py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all duration-200 text-sm font-bold font-mono shadow-sm text-slate-700"
                  >
                    <option value="">Select auction settings...</option>
                    {auctionSettings.map(setting => {
                      const windowLabel = setting.auction_window
                        .split('_')
                        .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                        .join(' ');
                      return (
                        <option key={setting.id} value={setting.id}>
                          {windowLabel} (Max {setting.max_rounds} rounds, {setting.max_squad_size} players)
                        </option>
                      );
                    })}
                  </select>
                </div>
                <p className="mt-1 text-[10px] text-slate-400 font-mono">
                  Choose settings based on auction type. 
                  {auctionSettings.length === 0 && (
                    <Link href="/dashboard/committee/auction-settings" className="text-amber-600 hover:text-amber-800 font-bold ml-1">
                      Create settings first  &rarr; 
                    </Link>
                  )}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4">
              {/* Duration */}
              <div className="md:col-span-2">
                <label className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mb-1.5 block">Duration</label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="relative">
                    <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                      <Clock className="w-4 h-4" />
                    </span>
                    <input
                      type="number"
                      id="duration_hours"
                      value={formData.duration_hours}
                      onChange={(e) => setFormData({ ...formData, duration_hours: e.target.value })}
                      min="0"
                      max="24"
                      required
                      className="pl-10 pr-12 w-full py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all duration-200 text-sm font-bold font-mono shadow-sm text-slate-800"
                    />
                    <span className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-[10px] text-slate-400 font-bold uppercase">
                      hrs
                    </span>
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      id="duration_minutes"
                      value={formData.duration_minutes}
                      onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value })}
                      min="0"
                      max="59"
                      className="pr-12 w-full py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all duration-200 text-sm font-bold font-mono shadow-sm text-slate-800"
                    />
                    <span className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-[10px] text-slate-400 font-bold uppercase">
                      min
                    </span>
                  </div>
                </div>
                <div className="mt-2 space-y-1">
                  <p className="text-[10px] text-slate-400 font-mono">Recommended: 2-3 hours</p>
                  {(() => {
                    const hours = parseFloat(formData.duration_hours) || 0;
                    const minutes = parseFloat(formData.duration_minutes) || 0;
                    if (hours > 0 || minutes > 0) {
                      const now = new Date();
                      const endTime = new Date(now.getTime() + (hours * 60 + minutes) * 60 * 1000);
                      return (
                        <div className="p-3 bg-amber-50/50 border border-amber-200/60 rounded-xl text-xs">
                          <p className="font-bold text-amber-900 font-mono">
                            Round will end at: <span className="text-amber-700">{endTime.toLocaleString('en-US', { 
                              weekday: 'short',
                              month: 'short', 
                              day: 'numeric',
                              year: 'numeric',
                              hour: '2-digit', 
                              minute: '2-digit',
                              hour12: true 
                            })}</span>
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            ({endTime.toLocaleString('en-US', { timeZoneName: 'short' })})
                          </p>
                        </div>
                      );
                    }
                    return null;
                  })()}
                </div>
              </div>
              
              {/* Required Bids Per Team */}
              <div>
                <label htmlFor="max_bids" className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mb-1.5 block">Required Bids Per Team</label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                    <Users className="w-4 h-4" />
                  </span>
                  <input
                    type="number"
                    id="max_bids"
                    value={formData.max_bids_per_team}
                    onChange={(e) => setFormData({ ...formData, max_bids_per_team: e.target.value })}
                    min="1"
                    required
                    className="pl-10 w-full py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all duration-200 text-sm font-bold font-mono shadow-sm text-slate-800"
                  />
                </div>
                <p className="mt-1 text-[10px] text-slate-400 font-mono">Teams must bid exactly this many players</p>
              </div>
            </div>

            {/* Finalization Mode Selector */}
            <div className="mt-4">
              <label htmlFor="finalization_mode" className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mb-1.5 block">
                Finalization Mode
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
                  <CheckCircle2 className="w-4 h-4" />
                </span>
                <select
                  id="finalization_mode"
                  value={formData.finalization_mode}
                  onChange={(e) => setFormData({ ...formData, finalization_mode: e.target.value })}
                  className="pl-10 w-full py-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none transition-all duration-200 text-sm font-bold font-mono shadow-sm text-slate-700"
                >
                  <option value="auto">Auto-Finalize (when timer ends)</option>
                  <option value="manual">Manual Finalization (preview first)</option>
                </select>
              </div>
              <p className="mt-1 text-[10px] text-slate-400 font-mono">
                {formData.finalization_mode === 'auto' 
                  ? 'Round will automatically finalize when timer expires' 
                  : 'Round will wait for committee approval before publishing results'}
              </p>
            </div>
            
            <div className="flex justify-end mt-4">
              <button
                type="submit"
                className="px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-all flex items-center gap-2 cursor-pointer"
              >
                <Play className="w-4 h-4 text-amber-400" /> Start Round
              </button>
            </div>
          </form>
        </div>

        {/* Active Rounds Section */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <h2 className="text-sm sm:text-base font-extrabold uppercase text-slate-900 tracking-wide flex items-center gap-2">
            <Play className="w-4 h-4 text-emerald-500" />
            Active Rounds
            {activeRounds.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-5 border border-emerald-200 text-emerald-805 text-[10px] font-extrabold font-mono shadow-sm">
                {activeRounds.length}
              </span>
            )}
          </h2>
          
          <div className="space-y-4">
            {activeRounds.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 border border-slate-100 rounded-2xl space-y-3 font-mono text-xs">
                <Clock className="w-10 h-10 mx-auto text-slate-300" />
                <h3 className="font-extrabold text-slate-500 uppercase tracking-wide">No active rounds</h3>
                <p className="text-slate-400">Start a new round using the form above</p>
              </div>
            ) : (
              activeRounds.map(round => (
                <div
                  key={round.id}
                  className="p-5 rounded-2xl border border-slate-200 hover:border-amber-400 transition-all relative overflow-hidden space-y-4"
                >
                  <div className="absolute top-0 right-0 bg-emerald-500 text-white px-3 py-1 text-[10px] font-bold uppercase rounded-bl-xl tracking-wider font-mono">
                    Active
                  </div>
                  
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center flex-shrink-0 mr-3 border border-emerald-100">
                          <Layers className="w-5 h-5 text-emerald-600" />
                        </div>
                        <div>
                          <h3 className="text-base font-extrabold text-slate-800">
                            {round.position} Round #{round.round_number || extractIdNumberAsInt(round.id)}
                          </h3>
                          <div className="flex flex-wrap gap-2 mt-1.5 text-[10px] font-bold font-mono">
                            {(() => {
                              const settings = auctionSettings.find(s => String(s.id) === String(selectedAuctionSettingsId));
                              if (!settings || !round.round_number) return null;
                              
                              let phase = 'Phase 3';
                              let phaseColor = 'bg-purple-50 text-purple-700 border border-purple-100';
                              
                              if (round.round_number <= settings.phase_1_end_round) {
                                phase = 'Phase 1';
                                phaseColor = 'bg-blue-50 text-blue-700 border border-blue-100';
                              } else if (round.round_number <= settings.phase_2_end_round) {
                                phase = 'Phase 2';
                                phaseColor = 'bg-orange-50 text-orange-700 border border-orange-100';
                              }
                              
                              return (
                                <span className={`px-2 py-0.5 rounded-md uppercase ${phaseColor}`}>
                                  {phase}
                                </span>
                              );
                            })()}
                            {round.finalization_mode === 'manual' && (
                              <span className="px-2 py-0.5 rounded-md uppercase bg-amber-50 text-amber-700 border border-amber-100 flex items-center gap-1">
                                <Settings className="w-3 h-3 text-amber-500" /> Manual Finalization
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 text-white shadow-sm font-mono text-xs font-bold shrink-0">
                        <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                        <span>{formatTime(timeRemaining[round.id] || 0)}</span>
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                      <div className="flex items-center gap-3">
                        <div className="relative flex-1 max-w-[120px]">
                          <input
                            type="number"
                            value={addTimeInputs[round.id] || '10'}
                            onChange={(e) => setAddTimeInputs({ ...addTimeInputs, [round.id]: e.target.value })}
                            min="5"
                            className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none text-xs font-bold font-mono shadow-sm text-slate-800"
                          />
                          <span className="absolute right-3 top-1/2 transform -translate-y-1/2 text-[10px] text-slate-400 font-bold uppercase">min</span>
                        </div>
                        <button
                          onClick={() => handleAddTime(round.id)}
                          className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider shadow-sm transition-all cursor-pointer flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3 text-amber-400" /> Add Time
                        </button>
                      </div>
                      
                      <div className="flex justify-end items-center gap-2">
                        {round.finalization_mode !== 'manual' ? (
                          <button
                            onClick={() => handleFinalizeRound(round.id)}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider shadow-sm transition-all cursor-pointer flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" /> Finalize Round
                          </button>
                        ) : (
                          <button
                            onClick={() => handleFinalizeImmediately(round.id)}
                            className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider shadow-sm transition-all cursor-pointer flex items-center gap-1"
                          >
                            <Play className="w-3.5 h-3.5" /> Finalize Early (Skip Preview)
                          </button>
                        )}
                      </div>
                    </div>
                    
                    {/* Submission Status */}
                    {loadingSubmissions[round.id] ? (
                      <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl flex flex-col items-center justify-center gap-3">
                        <RefreshCw className="w-6 h-6 text-amber-500 animate-spin" />
                        <span className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider font-mono">Loading Team Submissions...</span>
                      </div>
                    ) : roundSubmissions[round.id] && (
                      <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-2xl space-y-3 font-mono text-xs">
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2 pb-2 border-b border-slate-200/60">
                          <div className="flex items-center gap-1.5 text-slate-700 font-extrabold uppercase text-[10px]">
                            <Users className="w-4 h-4 text-slate-500" />
                            Team Submissions
                          </div>
                          <span className="px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100 text-[10px] font-extrabold uppercase font-mono shadow-sm">
                            {roundSubmissions[round.id].submitted} of {roundSubmissions[round.id].total_teams} teams ({roundSubmissions[round.id].submission_rate}%)
                          </span>
                        </div>

                        {/* Mobile view */}
                        <div className="block lg:hidden space-y-2">
                          {roundSubmissions[round.id].teams?.map((team: any, idx: number) => (
                            <div
                              key={team.team_id || idx}
                              className={`flex items-center justify-between p-3 rounded-xl border ${
                                team.has_submitted
                                  ? 'bg-emerald-50/50 border-emerald-200/60 text-emerald-800'
                                  : 'bg-orange-50/50 border-orange-200/60 text-orange-800'
                              }`}
                            >
                              <span className="font-bold truncate max-w-[200px]">{team.team_name}</span>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase border ${
                                team.has_submitted
                                  ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                                  : 'bg-orange-100 text-orange-850 border-orange-200'
                              }`}>
                                {team.has_submitted ? 'Yes Submitted' : 'Pending'}
                              </span>
                            </div>
                          ))}
                        </div>

                        {/* Desktop view */}
                        <div className="hidden lg:block overflow-hidden rounded-xl border border-slate-200/60 bg-white">
                          <table className="min-w-full divide-y divide-slate-100">
                            <thead className="bg-slate-50">
                              <tr>
                                <th className="px-4 py-2.5 text-left text-[10px] font-bold text-slate-400 uppercase tracking-wider">Team Name</th>
                                <th className="px-4 py-2.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                                <th className="px-4 py-2.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Bids</th>
                                <th className="px-4 py-2.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-wider">Submitted At</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-mono text-xs">
                              {roundSubmissions[round.id].teams?.map((team: any, idx: number) => (
                                <tr
                                  key={team.team_id || idx}
                                  className={`hover:bg-slate-50/50 transition-colors ${
                                    team.has_submitted ? 'bg-emerald-50/10' : 'bg-orange-50/10'
                                  }`}
                                >
                                  <td className="px-4 py-2.5 whitespace-nowrap font-bold text-slate-800">
                                    {team.team_name}
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap text-center">
                                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-extrabold uppercase border ${
                                      team.has_submitted
                                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                        : 'bg-orange-50 text-orange-700 border-orange-200'
                                    }`}>
                                      {team.has_submitted ? 'Yes Submitted' : 'Pending'}
                                    </span>
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap text-center text-slate-700 font-bold">
                                    {team.has_submitted ? team.bid_count : '-'}
                                  </td>
                                  <td className="px-4 py-2.5 whitespace-nowrap text-center text-slate-400">
                                    {team.has_submitted && team.submitted_at
                                      ? new Date(team.submitted_at).toLocaleString('en-US', {
                                          month: 'short',
                                          day: 'numeric',
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })
                                      : '-'
                                    }
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Tiebreakers Section */}
                    {roundTiebreakers[round.id] && roundTiebreakers[round.id].length > 0 && (
                      <div className="p-4 bg-amber-50/20 border border-amber-200/60 rounded-2xl space-y-3">
                        <div className="flex items-center gap-1.5 text-amber-800 font-bold uppercase text-[10px]">
                          <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                          Active Tiebreakers ({roundTiebreakers[round.id].length})
                        </div>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          {roundTiebreakers[round.id].map((tb: Tiebreaker) => (
                            <div key={tb.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between gap-3">
                              <div>
                                <p className="font-extrabold text-slate-800 text-xs">{tb.player_name}</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{tb.position} • £{tb.original_amount.toLocaleString()}</p>
                                <p className="text-[10px] text-slate-400 font-bold uppercase mt-2">
                                  {tb.submitted_count} of {tb.teams_count} teams submitted
                                </p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleResolveTiebreaker(tb.id, round.id)}
                                  disabled={tb.submitted_count < tb.teams_count}
                                  className={`px-3 py-1.5 text-white font-mono font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1 ${
                                    tb.submitted_count < tb.teams_count
                                      ? 'bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed'
                                      : 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
                                  }`}
                                  title={tb.submitted_count < tb.teams_count ? 'Waiting for all teams to submit' : 'Resolve tiebreaker'}
                                >
                                  <Check className="w-3.5 h-3.5" /> Resolve
                                </button>
                                <Link 
                                  href="/dashboard/committee/tiebreakers"
                                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-sm transition-all flex items-center gap-1"
                                >
                                  <ArrowRight className="w-3.5 h-3.5 text-amber-400" /> View
                                </Link>
                              </div>
                            </div>
                          ))}
                        </div>
                        
                        <div className="flex gap-1.5 items-start text-[10px] text-amber-800 bg-amber-50/50 p-3 rounded-xl border border-amber-100">
                          <Info className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
                          <span>Tiebreakers have no time limit. Teams can submit bids when ready. Resolve tiebreakers before finalization.</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Finalizing Rounds Section (rounds with tiebreakers) */}
        {finalizingRounds.length > 0 && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            <h2 className="text-sm sm:text-base font-extrabold uppercase text-slate-900 tracking-wide flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 animate-pulse" />
              Finalizing Rounds (Tiebreakers Pending)
              <span className="px-2 py-0.5 rounded-full bg-amber-5 border border-amber-200 text-amber-800 text-[10px] font-extrabold font-mono shadow-sm">
                {finalizingRounds.length}
              </span>
            </h2>
            
            <div className="space-y-4">
              {finalizingRounds.map(round => (
                <div
                  key={round.id}
                  className="p-5 rounded-2xl border border-amber-200 bg-amber-50/5 relative overflow-hidden space-y-4"
                >
                  <div className="absolute top-0 right-0 bg-amber-500 text-white px-3 py-1 text-[10px] font-bold uppercase rounded-bl-xl tracking-wider font-mono">
                    Tiebreakers Pending
                  </div>

                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-805 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-amber-500 shrink-0" />
                        {round.position} Round #{round.round_number || extractIdNumberAsInt(round.id)}
                      </h3>
                      <div className="flex flex-wrap gap-2 mt-1.5 text-[10px] font-bold font-mono">
                        {(() => {
                          const settings = auctionSettings.find(s => String(s.id) === String(selectedAuctionSettingsId));
                          if (!settings || !round.round_number) return null;
                          let phase = 'Phase 3';
                          let phaseColor = 'bg-purple-50 text-purple-700 border border-purple-100';
                          if (round.round_number <= settings.phase_1_end_round) {
                            phase = 'Phase 1';
                            phaseColor = 'bg-blue-50 text-blue-700 border border-blue-100';
                          } else if (round.round_number <= settings.phase_2_end_round) {
                            phase = 'Phase 2';
                            phaseColor = 'bg-orange-50 text-orange-700 border border-orange-100';
                          }
                          return <span className={`px-2 py-0.5 rounded-md uppercase ${phaseColor}`}>{phase}</span>;
                        })()}
                        {round.finalization_mode === 'manual' && (
                          <span className="px-2 py-0.5 rounded-md uppercase bg-amber-50 text-amber-700 border border-amber-100 flex items-center gap-1">
                            <Settings className="w-3 h-3 text-amber-500" /> Manual Finalization
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Tiebreakers */}
                  {roundTiebreakers[round.id] && roundTiebreakers[round.id].length > 0 && (
                    <div className="p-4 bg-white border border-amber-200 rounded-xl space-y-2">
                      <div className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider pb-1.5 border-b border-slate-100">
                        Tiebreakers ({roundTiebreakers[round.id].length})
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1.5">
                        {roundTiebreakers[round.id].map((tb: Tiebreaker) => (
                          <div key={tb.id} className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 flex flex-col justify-between gap-3 font-mono text-xs">
                            <div>
                              <p className="font-extrabold text-slate-800">{tb.player_name}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">{tb.position} • £{tb.original_amount.toLocaleString()}</p>
                              <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
                                {tb.submitted_count} of {tb.teams_count} teams submitted
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleResolveTiebreaker(tb.id, round.id)}
                                disabled={tb.submitted_count < tb.teams_count}
                                className={`px-3 py-1.5 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors flex items-center gap-1 ${
                                  tb.submitted_count < tb.teams_count
                                    ? 'bg-slate-200 text-slate-500 border border-slate-300 cursor-not-allowed'
                                    : 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
                                }`}
                              >
                                <Check className="w-3.5 h-3.5" /> Resolve
                              </button>
                              <Link 
                                href="/dashboard/committee/tiebreakers"
                                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-sm transition-all flex items-center gap-1"
                              >
                                <ArrowRight className="w-3.5 h-3.5 text-amber-400" /> View
                              </Link>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expired Rounds Section (rounds that failed finalization) */}
        {expiredRounds.length > 0 && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            <h2 className="text-sm sm:text-base font-extrabold uppercase text-slate-900 tracking-wide flex items-center gap-2">
              <Clock className="w-4 h-4 text-orange-500 animate-pulse" />
              Expired Rounds (Needs Manual Finalization)
              <span className="px-2 py-0.5 rounded-full bg-orange-5 border border-orange-200 text-orange-850 text-[10px] font-extrabold font-mono shadow-sm">
                {expiredRounds.length}
              </span>
            </h2>
            
            <div className="space-y-4">
              {expiredRounds.map(round => (
                <div
                  key={round.id}
                  className="p-5 rounded-2xl border border-orange-200 bg-orange-50/5 relative overflow-hidden space-y-4"
                >
                  <div className="absolute top-0 right-0 bg-orange-500 text-white px-3 py-1 text-[10px] font-bold uppercase rounded-bl-xl tracking-wider font-mono">
                    Expired
                  </div>

                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div>
                      <h3 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                        <Layers className="w-4 h-4 text-amber-500 shrink-0" />
                        {round.position} Round #{round.round_number || extractIdNumberAsInt(round.id)}
                      </h3>
                      <div className="flex flex-wrap gap-2 mt-1.5 text-[10px] font-bold font-mono">
                        {(() => {
                          const settings = auctionSettings.find(s => String(s.id) === String(selectedAuctionSettingsId));
                          if (!settings || !round.round_number) return null;
                          let phase = 'Phase 3';
                          let phaseColor = 'bg-purple-50 text-purple-700 border border-purple-100';
                          if (round.round_number <= settings.phase_1_end_round) {
                            phase = 'Phase 1';
                            phaseColor = 'bg-blue-50 text-blue-700 border border-blue-100';
                          } else if (round.round_number <= settings.phase_2_end_round) {
                            phase = 'Phase 2';
                            phaseColor = 'bg-orange-50 text-orange-700 border border-orange-100';
                          }
                          return <span className={`px-2 py-0.5 rounded-md uppercase ${phaseColor}`}>{phase}</span>;
                        })()}
                        {round.finalization_mode === 'manual' && (
                          <span className="px-2 py-0.5 rounded-md uppercase bg-amber-50 text-amber-700 border border-amber-100 flex items-center gap-1">
                            <Settings className="w-3 h-3 text-amber-500" /> Manual Finalization
                          </span>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 font-mono text-[10px]">
                      <span className="px-2.5 py-1 rounded-lg bg-orange-50 border border-orange-200 text-orange-800 font-extrabold uppercase shadow-sm">
                        {round.status === 'expired_pending_finalization' ? 'Awaiting Preview' : 'Expired'}
                      </span>
                      {round.status === 'pending_finalization' && (
                        <span className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-200 text-blue-800 font-extrabold uppercase shadow-sm">
                          Results Pending
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-200/40">
                    {(round.status === 'expired' || round.status === 'expired_pending_finalization') && round.finalization_mode === 'manual' && (
                      <>
                        <button
                          onClick={() => handlePreviewFinalization(round.id)}
                          disabled={loadingSubmissions[round.id]}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider shadow-sm transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <FileText className="w-3.5 h-3.5 text-amber-400" />
                          {loadingSubmissions[round.id] ? 'Creating Preview...' : 'Preview Results'}
                        </button>
                        <button
                          onClick={() => handleFinalizeImmediately(round.id)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Finalize Immediately
                        </button>
                      </>
                    )}
                    
                    {round.status === 'pending_finalization' && (
                      <>
                        <button
                          onClick={() => handleViewPendingResults(round.id)}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <FileText className="w-3.5 h-3.5 text-amber-400" />
                          View Pending Results
                        </button>
                        <button
                          onClick={() => handleApplyPendingAllocations(round.id)}
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Finalize for Real
                        </button>
                        <button
                          onClick={() => handleCancelPending(round.id)}
                          className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                        >
                          Cancel Pending
                        </button>
                      </>
                    )}
                    
                    {round.status === 'expired' && round.finalization_mode !== 'manual' && (
                      <button
                        onClick={() => handleFinalizeRound(round.id)}
                        className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-[10px] uppercase tracking-wider shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Finalize Round
                      </button>
                    )}
                    
                    <button
                      onClick={() => handleDeleteRound(round.id)}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Completed Rounds Section */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
          <h2 className="text-sm sm:text-base font-extrabold uppercase text-slate-900 tracking-wide flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
            Completed Rounds
            {completedRounds.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-5 border border-emerald-200 text-emerald-800 text-[10px] font-extrabold font-mono shadow-sm">
                {completedRounds.length}
              </span>
            )}
          </h2>
          
          <div className="space-y-4">
            {completedRounds.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 border border-slate-100 rounded-2xl space-y-3 font-mono text-xs">
                <CheckCircle2 className="w-10 h-10 mx-auto text-slate-300" />
                <h3 className="font-extrabold text-slate-500 uppercase tracking-wide">No completed rounds yet</h3>
                <p className="text-slate-400">Past rounds will appear here once they're finalized</p>
              </div>
            ) : (
              completedRounds.map(round => (
                <div
                  key={round.id}
                  className="p-5 rounded-2xl border border-slate-200 hover:border-amber-400 transition-all space-y-4"
                >
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center flex-shrink-0">
                        <Layers className="w-5 h-5 text-slate-500" />
                      </div>
                      <div>
                        <h3 className="text-base font-extrabold text-slate-800">
                          {round.position} Round #{extractIdNumberAsInt(round.id)}
                        </h3>
                        <p className="text-[10px] text-slate-400 font-bold uppercase mt-1 flex items-center gap-1 font-mono">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          {round.created_at && new Date(round.created_at).toLocaleString('en-US', { 
                            year: 'numeric', 
                            month: '2-digit', 
                            day: '2-digit', 
                            hour: '2-digit', 
                            minute: '2-digit'
                          })}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 text-[10px] font-mono font-bold">
                      <span className="px-2.5 py-1 rounded-lg bg-blue-50 border border-blue-100 text-blue-700 flex items-center gap-1 shadow-sm">
                        <Users className="w-3.5 h-3.5 text-blue-500" />
                        {round.total_bids || 0} bids from {round.teams_bid || 0} teams
                      </span>
                      <span className="px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-slate-705 uppercase flex items-center gap-1 shadow-sm">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                        {round.status}
                      </span>
                    </div>
                  </div>
                  
                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                    <Link
                      href={`/dashboard/committee/rounds/${round.id}`}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-[10px] uppercase tracking-wider rounded-lg shadow-sm transition-all flex items-center gap-1"
                    >
                      <FileText className="w-3.5 h-3.5 text-amber-400" />
                      View Details
                    </Link>
                    <button
                      onClick={() => handleDeleteRound(round.id)}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold text-[10px] uppercase tracking-wider rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Round Finalization Details Section */}
        {completedRounds.length > 0 && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
            <h2 className="text-sm sm:text-base font-extrabold uppercase text-slate-900 tracking-wide flex items-center gap-2">
              <HelpCircle className="w-4 h-4 text-violet-500" />
              Round Finalization Details
            </h2>
            
            <div className="space-y-3 font-mono">
              {completedRounds.map(round => {
                const isRoundExpanded = expandedRounds.has(round.id);
                const details = roundDetails[round.id];
                const bidsByPlayer = details?.bids ? organizeBidsByPlayer(details.bids) : {};
                
                return (
                  <div key={round.id} className="border border-slate-200 rounded-2xl overflow-hidden bg-slate-50/10">
                    {/* Round Header */}
                    <button
                      onClick={() => toggleRound(round.id)}
                      className="w-full p-4 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer text-left font-mono"
                    >
                      <div className="flex items-center gap-3">
                        <ChevronRight 
                          className={`w-4 h-4 text-slate-500 transition-transform ${
                            isRoundExpanded ? 'rotate-90' : ''
                          }`}
                        />
                        <span className="font-extrabold text-slate-805 text-sm">
                          {round.position} Round #{extractIdNumberAsInt(round.id)}
                        </span>
                        {details && (
                          <span className="text-[9px] font-bold text-slate-400 bg-slate-100 border border-slate-200 px-2 py-0.5 rounded uppercase">
                            {Object.keys(bidsByPlayer).length} players
                          </span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 font-bold uppercase">
                        {new Date(round.created_at).toLocaleDateString()}
                      </span>
                    </button>

                    {/* Round Content - Players List */}
                    {isRoundExpanded && details && (
                      <div className="border-t border-slate-200 bg-white">
                        {Object.keys(bidsByPlayer).length === 0 ? (
                          <div className="p-6 text-center text-slate-400 text-xs">
                            No bids found for this round
                          </div>
                        ) : (
                          <div className="divide-y divide-slate-100">
                            {Object.entries(bidsByPlayer).map(([playerId, playerBids]: [string, any]) => {
                              const playerKey = `${round.id}_${playerId}`;
                              const isPlayerExpanded = expandedPlayers.has(playerKey);
                              const firstBid = playerBids[0];
                              const wonBid = playerBids.find((b: any) => b.status === 'won');
                              
                              return (
                                <div key={playerKey} className="text-xs">
                                  {/* Player Header */}
                                  <button
                                    onClick={() => togglePlayer(playerKey)}
                                    className="w-full p-3.5 pl-8 flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer text-left font-mono"
                                  >
                                    <div className="flex items-center gap-3 flex-wrap">
                                      <ChevronRight 
                                        className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
                                          isPlayerExpanded ? 'rotate-90' : ''
                                        }`}
                                      />
                                      <span className="font-extrabold text-slate-800">
                                        {firstBid.player_name}
                                      </span>
                                      <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-650 font-bold uppercase text-[9px] border border-slate-200">
                                        {firstBid.position}
                                      </span>
                                      {wonBid && (
                                        <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-800 font-extrabold text-[9px] uppercase">
                                          Won by {wonBid.team_name}
                                        </span>
                                      )}
                                    </div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase">
                                      {playerBids.length} bid{playerBids.length > 1 ? 's' : ''}
                                    </span>
                                  </button>

                                  {/* Player Bids - Sorted List */}
                                  {isPlayerExpanded && (
                                    <div className="bg-slate-50/50 px-6 py-4 border-t border-b border-slate-100 space-y-3 font-mono">
                                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                        {playerBids.map((bid: any, index: number) => (
                                          <div 
                                            key={bid.id}
                                            className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 ${
                                              bid.status === 'won'
                                                ? 'bg-emerald-50/50 border-emerald-200 text-emerald-900 font-extrabold'
                                                : 'bg-white border-slate-200 text-slate-700'
                                            }`}
                                          >
                                            <div className="flex items-center gap-3 min-w-0">
                                              <span className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold ${
                                                bid.status === 'won'
                                                  ? 'bg-emerald-600 text-white'
                                                  : 'bg-slate-200 text-slate-600'
                                              }`}>
                                                {index + 1}
                                              </span>
                                              <div className="min-w-0">
                                                <div className="font-bold truncate">{bid.team_name}</div>
                                                <div className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                                                  {new Date(bid.created_at).toLocaleString()}
                                                </div>
                                              </div>
                                            </div>
                                            <div className="flex items-center gap-2 shrink-0">
                                              <span className={`font-black text-sm ${
                                                bid.status === 'won' ? 'text-emerald-700' : 'text-slate-800'
                                              }`}>
                                                £{bid.amount.toLocaleString()}
                                              </span>
                                              {bid.status === 'won' && (
                                                <span className="flex items-center text-[9px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 rounded uppercase">
                                                  WON
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                      
                                      {/* Summary */}
                                      <div className="p-3 bg-blue-50/50 border border-blue-200/60 rounded-xl flex items-center gap-2 text-blue-900 font-bold text-xs">
                                        <Info className="w-4 h-4 text-blue-600 shrink-0" />
                                        <span>
                                          Highest Bid: <strong className="text-blue-950 font-black">£{playerBids[0].amount.toLocaleString()}</strong> by {playerBids[0].team_name}
                                          {wonBid && wonBid.id === playerBids[0].id && ' Yes (Allocated)'}
                                        </span>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Finalization Progress Modal */}
      {showFinalizationProgress && finalizingRoundId && (
        <FinalizationProgress
          roundId={finalizingRoundId}
          onComplete={handleFinalizationComplete}
          onError={handleFinalizationError}
        />
      )}

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
