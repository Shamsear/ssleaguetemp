import { useEffect, useState, useCallback } from 'react';
import { 
  collection, 
  query, 
  onSnapshot, 
  orderBy, 
  where, 
  Timestamp,
  QueryConstraint 
} from 'firebase/firestore';
import { db } from '@/lib/firebase/config';
import { useSSE } from './useSSE';
import { Season } from '@/types/season';
import { AdminInvite } from '@/types/invite';
import { User } from '@/types/user';

// Helper to convert Firestore timestamps
const convertTimestamp = (timestamp: any): Date => {
  if (timestamp instanceof Timestamp) {
    return timestamp.toDate();
  }
  if (timestamp?.toDate) {
    return timestamp.toDate();
  }
  if (timestamp?.seconds) {
    return new Date(timestamp.seconds * 1000);
  }
  return new Date();
};

/**
 * Hook for real-time seasons data — uses API polling instead of Firebase
 */
export const useRealtimeSeasons = (user?: any, userLoading?: boolean) => {
  const [enabled, setEnabled] = useState(false);
  
  useEffect(() => {
    if (userLoading) return;
    if (!user) return;
    if (user.role !== 'super_admin') return;
    setEnabled(true);
  }, [user, userLoading]);

  const { data: rawSeasons, loading, error, connected } = useSSE<any>('seasons', {
    interval: 5,
    enabled,
  });

  const seasons: Season[] = rawSeasons.map((s: any) => ({
    id: s.id,
    ...s,
    name: s.name || (s.season_number ? `Season ${s.season_number}` : s.year || 'Unnamed Season'),
    year: s.year || (s.season_number ? `${s.season_number}` : 'N/A'),
    startDate: s.startDate || s.start_date,
    endDate: s.endDate || s.end_date,
    createdAt: s.created_at || s.createdAt,
    updatedAt: s.updated_at || s.updatedAt,
  }));

  return { seasons, loading, error: error || (!enabled ? 'Access denied' : null), refetch: () => {} };
};

/**
 * Hook for real-time invites data (stays on Firebase — not migrated)
 */
export const useRealtimeInvites = () => {
  const [invites, setInvites] = useState<AdminInvite[]>([]);

  useEffect(() => {
    const invitesQuery = query(
      collection(db, 'invites'),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(
      invitesQuery,
      (snapshot) => {
        const invitesData: AdminInvite[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          invitesData.push({
            id: doc.id,
            ...data,
            expiresAt: convertTimestamp(data.expiresAt),
            createdAt: convertTimestamp(data.createdAt),
          } as AdminInvite);
        });
        setInvites(invitesData);
      },
      (err) => {
        console.error('Error fetching real-time invites:', err);
      }
    );

    return () => unsubscribe();
  }, []);

  return { invites, loading: false, error: null };
};

/**
 * Hook for real-time users data with optional filtering (stays on Firebase — not migrated)
 */
export const useRealtimeUsers = (role?: string, user?: any, userLoading?: boolean) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (userLoading || !user) return;
    if (!user.uid) {
      setError('Authentication required');
      setLoading(false);
      return;
    }

    const constraints: QueryConstraint[] = [orderBy('createdAt', 'desc')];
    if (role) {
      constraints.unshift(where('role', '==', role));
    }

    const usersQuery = query(collection(db, 'users'), ...constraints);

    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        const usersData: User[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          usersData.push({
            ...data,
            createdAt: convertTimestamp(data.createdAt),
            updatedAt: convertTimestamp(data.updatedAt),
          } as User);
        });
        setUsers(usersData);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err.message || 'Failed to fetch users');
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [role, user, userLoading]);

  return { users, loading, error };
};

/**
 * Hook for real-time committee admins by season (stays on Firebase — not migrated)
 */
export const useRealtimeCommitteeAdmins = (seasonId?: string) => {
  const [admins, setAdmins] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!seasonId) {
      setLoading(false);
      return;
    }

    const adminsQuery = query(
      collection(db, 'users'),
      where('role', '==', 'committee_admin'),
      where('seasonIds', 'array-contains', seasonId)
    );

    const unsubscribe = onSnapshot(
      adminsQuery,
      (snapshot) => {
        const adminsData: User[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          adminsData.push({
            ...data,
            createdAt: convertTimestamp(data.createdAt),
            updatedAt: convertTimestamp(data.updatedAt),
          } as User);
        });
        setAdmins(adminsData);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [seasonId]);

  return { admins, loading, error };
};

/**
 * Hook for real-time football players data (stays on Firebase — not migrated)
 */
export const useRealtimeFootballPlayers = (teamId?: string) => {
  const [players, setPlayers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const constraints: QueryConstraint[] = [];
    if (teamId) {
      constraints.push(where('team_id', '==', teamId));
    }

    const playersQuery = query(
      collection(db, 'footballPlayers'),
      ...constraints
    );

    const unsubscribe = onSnapshot(
      playersQuery,
      (snapshot) => {
        const playersData: any[] = [];
        snapshot.forEach((doc) => {
          playersData.push({ id: doc.id, ...doc.data() });
        });
        setPlayers(playersData);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [teamId]);

  return { players, loading, error };
};

/**
 * Generic hook for any Firestore collection with real-time updates (stays on Firebase — not migrated)
 */
export const useRealtimeCollection = <T = any>(
  collectionName: string,
  constraints: QueryConstraint[] = []
) => {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const collectionQuery = query(
      collection(db, collectionName),
      ...constraints
    );

    const unsubscribe = onSnapshot(
      collectionQuery,
      (snapshot) => {
        const data: T[] = [];
        snapshot.forEach((doc) => {
          data.push({ id: doc.id, ...doc.data() } as T);
        });
        setData(data);
        setLoading(false);
      },
      (err) => {
        setError(err.message);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [collectionName, ...constraints]);

  return { data, loading, error };
};
