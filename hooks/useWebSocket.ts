/**
 * React Hook for Real-time Updates via Firebase Realtime Database
 * Provides easy-to-use hooks for real-time updates
 */

import { useEffect, useCallback, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import {
  listenToSquadUpdates,
  listenToWalletUpdates,
  listenToTiebreakerBids,
  type SquadUpdateEvent,
  type WalletUpdateEvent,
  type TiebreakerBidEvent,
} from '@/lib/realtime/listeners';
import {
  invalidateSquadCaches,
  invalidateWalletCaches,
  invalidateTiebreakerCaches,
} from '@/lib/cache/invalidate';

/**
 * Hook for dashboard updates (squad and wallet changes)
 * Uses Firebase Realtime Database for instant notifications
 */
export function useDashboardWebSocket(seasonId: string | null, teamId: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!seasonId) return;

    console.log('🔌 [Realtime DB] Connecting to season:', seasonId);

    let unsubSquads = () => {};
    let unsubWallets = () => {};
    let unsubRounds = () => {};

    try {
      // Listen to squad updates
      unsubSquads = listenToSquadUpdates(seasonId, (event: SquadUpdateEvent) => {
        console.log('📦 [Squad Update] Received:', event);
        invalidateSquadCaches(queryClient, event.team_id);
      });

      // Listen to wallet updates
      unsubWallets = listenToWalletUpdates(seasonId, (event: WalletUpdateEvent) => {
        console.log('💰 [Wallet Update] Received:', event);
        invalidateWalletCaches(queryClient, event.team_id);
      });

      // Listen to round updates (new rounds, status changes)
      const { ref, onValue } = require('firebase/database');
      const { realtimeDb } = require('@/lib/firebase/config');
      
      if (realtimeDb) {
        const seasonRoundsRef = ref(realtimeDb, `seasons/${seasonId}/rounds`);
        
        unsubRounds = onValue(seasonRoundsRef, (snapshot: any) => {
          const data = snapshot.val();
          if (data) {
            console.log('🎯 [Round Update] Received for season:', seasonId);
            // Invalidate dashboard queries to refetch active rounds
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
            queryClient.invalidateQueries({ queryKey: ['active-rounds'] });
            queryClient.invalidateQueries({ queryKey: ['team-dashboard'] });
          }
        });
      } else {
        console.warn('⚠️ Realtime Database not initialized');
      }
    } catch (error) {
      console.error('❌ [Realtime DB] Error in useDashboardWebSocketConnecting:', error);
    }

    return () => {
      console.log('🔌 [Realtime DB] Disconnecting from season:', seasonId);
      unsubSquads();
      unsubWallets();
      unsubRounds();
    };
  }, [seasonId, queryClient]);

  return {
    isConnected: !!seasonId,
  };
}

/**
 * Hook for tiebreaker updates
 * Uses Firebase Realtime Database for instant bid notifications
 */
export function useTiebreakerWebSocket(
  seasonId: string | null,
  tiebreakerRound: string | null
) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!seasonId || !tiebreakerRound) return;

    console.log('🔌 [Realtime DB] Connecting to tiebreaker:', tiebreakerRound);

    let unsubscribe = () => {};

    try {
      unsubscribe = listenToTiebreakerBids(
        seasonId,
        tiebreakerRound,
        (event: TiebreakerBidEvent) => {
          console.log('⚖️ [Tiebreaker Bid] Received:', event);
          invalidateTiebreakerCaches(queryClient, tiebreakerRound);
        }
      );
    } catch (error) {
      console.error('❌ [Realtime DB] Error in useTiebreakerWebSocket:', error);
    }

    return () => {
      console.log('🔌 [Realtime DB] Disconnecting from tiebreaker:', tiebreakerRound);
      unsubscribe();
    };
  }, [seasonId, tiebreakerRound, queryClient]);
}

/**
 * Hook for auction/round updates
 * Uses Firebase Realtime Database for instant round updates
 */
export function useAuctionWebSocket(roundId: string | null, enabled: boolean = true) {
  const queryClient = useQueryClient();
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    if (!enabled || !roundId) return;

    console.log('🔌 [Realtime DB] Connecting to round:', roundId);
    let unsubscribe = () => {};

    try {
      // Listen to round status updates
      const { ref, onValue } = require('firebase/database');
      const { realtimeDb } = require('@/lib/firebase/config');
      
      if (realtimeDb) {
        const roundRef = ref(realtimeDb, `rounds/${roundId}`);
        
        unsubscribe = onValue(roundRef, (snapshot: any) => {
          const data = snapshot.val();
          if (data) {
            console.log('📊 [Round Update] Received:', data);
            
            // Invalidate round-related caches
            queryClient.invalidateQueries({ queryKey: ['round', roundId] });
            queryClient.invalidateQueries({ queryKey: ['roundStatus', roundId] });
            queryClient.invalidateQueries({ queryKey: ['dashboard'] });
          }
        });
        setIsConnected(true);
      } else {
        console.warn('⚠️ Realtime Database not initialized');
      }
    } catch (error) {
      console.error('❌ [Realtime DB] Error in useAuctionWebSocket:', error);
    }

    return () => {
      console.log('🔌 [Realtime DB] Disconnecting from round:', roundId);
      unsubscribe();
      setIsConnected(false);
    };
  }, [roundId, enabled, queryClient]);

  return {
    isConnected,
    lastMessage: null,
  };
}

/**
 * Generic WebSocket hook for custom channels
 * Uses Firebase Realtime Database
 */
export function useWebSocket(options: {
  channel: string;
  enabled?: boolean;
  onMessage?: (message: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
}) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!options.enabled) return;

    console.log('🔌 [Realtime DB] Connecting to channel:', options.channel);
    let unsubscribe = () => {};

    try {
      options.onConnect?.();

      // Listen to the channel path in Firebase Realtime DB
      // Use onChildAdded to listen for new messages pushed to the channel
      const { ref, onChildAdded } = require('firebase/database');
      const { realtimeDb } = require('@/lib/firebase/config');
      
      if (realtimeDb) {
        const channelRef = ref(realtimeDb, options.channel.replace(/:/g, '/'));
        
        // onChildAdded fires for each new child added to the channel
        // This is perfect for .push() broadcasts which create new child nodes
        unsubscribe = onChildAdded(channelRef, (snapshot: any) => {
          const data = snapshot.val();
          if (data) {
            console.log('📨 [Channel Update] New message:', data);
            setLastMessage(JSON.stringify(data));
            options.onMessage?.(data);
          }
        });
        setIsConnected(true);
      } else {
        console.warn('⚠️ Realtime Database not initialized');
      }
    } catch (error) {
      console.error('❌ [Realtime DB] Error in useWebSocket:', error);
    }

    return () => {
      console.log('🔌 [Realtime DB] Disconnecting from channel:', options.channel);
      unsubscribe();
      setIsConnected(false);
      options.onDisconnect?.();
    };
  }, [options.channel, options.enabled]);

  return {
    isConnected,
    lastMessage,
  };
}

