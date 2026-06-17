'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { 
  ArrowLeft, 
  AlertCircle, 
  Calendar, 
  MapPin, 
  Phone, 
  Mail, 
  Home, 
  Clock, 
  User, 
  Sparkles,
  Trophy,
  Shield,
  Layers,
  FileText
} from 'lucide-react';

interface PlayerData {
  player_id: string;
  name: string;
  display_name?: string;
  team?: string;
  category?: string;
  star_rating?: number;
  photo_url?: string;
  photo_position_x_circle?: number;
  photo_position_y_circle?: number;
  photo_scale_circle?: number;
  is_active?: boolean;
  created_at?: any;
  updated_at?: any;
  // Additional fields that might exist
  [key: string]: any;
}

export default function PlayerProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const playerId = params?.playerId as string;

  const [player, setPlayer] = useState<PlayerData | null>(null);
  const [loadingData, setLoadingData] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchPlayer = async () => {
      if (!user || user.role !== 'super_admin' || !playerId) return;

      try {
        setLoadingData(true);
        setError(null);

        const playersRef = collection(db, 'realplayers');
        const q = query(playersRef, where('player_id', '==', playerId));
        const querySnapshot = await getDocs(q);

        if (querySnapshot.empty) {
          setError('Player not found');
          return;
        }

        const playerDoc = querySnapshot.docs[0];
        setPlayer({
          ...playerDoc.data(),
          player_id: playerDoc.data().player_id || playerDoc.id,
        } as PlayerData);
      } catch (error) {
        console.error('Error fetching player:', error);
        setError('Failed to load player data');
      } finally {
        setLoadingData(false);
      }
    };

    fetchPlayer();
  }, [user, playerId]);

  const formatDate = (date: any) => {
    if (!date) return 'N/A';
    try {
      const dateObj = date.toDate ? date.toDate() : new Date(date);
      return dateObj.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return 'N/A';
    }
  };

  const formatDateOnly = (date: any) => {
    if (!date) return 'N/A';
    try {
      const dateObj = date.toDate ? date.toDate() : new Date(date);
      return dateObj.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return 'N/A';
    }
  };

  const getPhotoStyle = (x?: number, y?: number, scale?: number) => {
    const posX = x ?? 50;
    const posY = y ?? 50;
    const scaleValue = scale ?? 1;

    return {
      objectPosition: `${posX}% ${posY}%`,
      transform: `scale(${scaleValue})`,
      transformOrigin: `${posX}% ${posY}%`,
    };
  };

  if (loading || loadingData) {
    return (
      <div className="flex items-center justify-center pt-32">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-505 font-mono text-xs tracking-widest uppercase animate-pulse">Syncing Player Telemetry...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  if (error || !player) {
    return (
      <div className="flex items-center justify-center pt-32 p-4">
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-8 max-w-md w-full text-center space-y-6 shadow-sm">
          <div className="w-16 h-16 mx-auto rounded-full bg-rose-50 border border-rose-200 flex items-center justify-center">
            <AlertCircle className="w-8 h-8 text-rose-500" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-bold text-slate-800">Player Record Missing</h2>
            <p className="text-xs text-slate-505 font-mono">{error || 'The requested player could not be loaded.'}</p>
          </div>
          <button
            onClick={() => router.push('/dashboard/superadmin/realplayers')}
            className="w-full py-2.5 bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-700 text-xs font-mono font-bold rounded-xl transition-all shadow-sm inline-flex items-center justify-center gap-1.5"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Players
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in font-mono">
      {/* Page Header */}
      <div className="flex items-center gap-4 pb-6 border-b border-slate-200/60">
        <button
          onClick={() => router.push('/dashboard/superadmin/realplayers')}
          className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-55 text-slate-600 hover:text-slate-950 transition-all flex-shrink-0 shadow-sm"
          title="Back to Players"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Player Profile
          </h1>
          <p className="text-xs text-slate-505 font-mono mt-1">
            Complete player registry card and associated telemetry stats.
          </p>
        </div>
      </div>

      {/* Player Header Card */}
      <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl">
        <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
          {/* Photo */}
          <div className="flex-shrink-0">
            {player.photo_url ? (
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-white shadow-md bg-slate-50 relative">
                <img
                  src={player.photo_url}
                  alt={player.name}
                  className="w-full h-full object-cover"
                  style={getPhotoStyle(
                    player.photo_position_x_circle,
                    player.photo_position_y_circle,
                    player.photo_scale_circle
                  )}
                />
              </div>
            ) : (
              <div className="w-32 h-32 rounded-full bg-gradient-to-br from-amber-50 to-amber-100/50 border-4 border-white shadow-md flex items-center justify-center">
                <span className="text-4xl font-extrabold text-amber-500">{player.name[0]}</span>
              </div>
            )}
          </div>

          {/* Basic Info */}
          <div className="flex-1 space-y-2">
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">{player.name}</h2>
            {player.display_name && player.display_name !== player.name && (
              <p className="text-sm font-mono text-slate-500">Display Alias: <span className="font-semibold text-slate-700">{player.display_name}</span></p>
            )}
            
            <div className="flex flex-wrap gap-2 pt-1 font-mono text-xs">
              {player.team && (
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl bg-slate-100 text-slate-700 border border-slate-200">
                  <Shield className="w-3.5 h-3.5 text-slate-500" />
                  {player.team}
                </span>
              )}
              {player.category && (
                <span className="inline-flex items-center px-3 py-1 rounded-xl bg-amber-50 text-amber-700 border border-amber-200/80 font-bold uppercase">
                  Cat {player.category}
                </span>
              )}
              {player.star_rating !== undefined && (
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-xl bg-amber-500/10 text-amber-700 border border-amber-500/20 font-bold">
                  {player.star_rating} ⭐
                </span>
              )}
              <span className={`inline-flex items-center px-3 py-1 rounded-xl font-bold ${
                player.is_active !== false 
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                  : 'bg-slate-100 text-slate-600 border border-slate-200'
              }`}>
                {player.is_active !== false ? 'Active' : 'Inactive'}
              </span>
            </div>

            <p className="text-[10px] text-slate-450 font-mono pt-1">Registry UUID: {player.player_id}</p>
          </div>
        </div>
      </div>

      {/* Details Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Basic Information */}
        <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl space-y-6">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-750 flex items-center gap-2 border-b border-slate-100 pb-3">
            <User className="w-4 h-4 text-amber-500" />
            Registry Information
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
            <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4">
              <div className="text-[10px] text-slate-455 uppercase tracking-wider mb-1">Database Key ID</div>
              <div className="font-semibold text-slate-800 break-all">{player.player_id}</div>
            </div>
            <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4">
              <div className="text-[10px] text-slate-455 uppercase tracking-wider mb-1">Full Legal Name</div>
              <div className="font-semibold text-slate-800">{player.name}</div>
            </div>
            {player.display_name && player.display_name !== player.name && (
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4">
                <div className="text-[10px] text-slate-455 uppercase tracking-wider mb-1">Public Display Name</div>
                <div className="font-semibold text-slate-800">{player.display_name}</div>
              </div>
            )}
            {player.team && (
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4">
                <div className="text-[10px] text-slate-455 uppercase tracking-wider mb-1">Assigned Franchise</div>
                <div className="font-semibold text-slate-800">{player.team}</div>
              </div>
            )}
            {player.category && (
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4">
                <div className="text-[10px] text-slate-455 uppercase tracking-wider mb-1">Base Bid Category</div>
                <div className="font-semibold text-slate-800">Category {player.category}</div>
              </div>
            )}
            {player.star_rating !== undefined && (
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4">
                <div className="text-[10px] text-slate-455 uppercase tracking-wider mb-1">Star Tier Class</div>
                <div className="font-bold text-amber-600">{player.star_rating} / 5 Star Rating</div>
              </div>
            )}
            <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4">
              <div className="text-[10px] text-slate-455 uppercase tracking-wider mb-1">Active Status</div>
              <div>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold ${
                  player.is_active !== false 
                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                    : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}>
                  {player.is_active !== false ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>
            {player.photo_url && (
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4">
                <div className="text-[10px] text-slate-455 uppercase tracking-wider mb-1">Media Storage</div>
                <div className="font-semibold text-emerald-600">Assets Configured</div>
              </div>
            )}
          </div>
        </div>

        {/* Personal Details */}
        <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl space-y-6">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-750 flex items-center gap-2 border-b border-slate-100 pb-3">
            <Layers className="w-4 h-4 text-amber-500" />
            Personal Profile Meta
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
            {(player.dob || player.date_of_birth || player.dateOfBirth || player.birth_date) && (
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 flex items-start gap-3">
                <Calendar className="w-4 h-4 text-slate-400 mt-0.5" />
                <div className="flex-1">
                  <div className="text-[10px] text-slate-455 uppercase tracking-wider mb-1">Date of Birth</div>
                  <div className="font-semibold text-slate-800">
                    {formatDateOnly(player.dob || player.date_of_birth || player.dateOfBirth || player.birth_date)}
                  </div>
                </div>
              </div>
            )}
            {player.place && (
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 flex items-start gap-3">
                <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                <div className="flex-1">
                  <div className="text-[10px] text-slate-455 uppercase tracking-wider mb-1">Home Town / Place</div>
                  <div className="font-semibold text-slate-800">{player.place}</div>
                </div>
              </div>
            )}
            {player.phone && (
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 flex items-start gap-3">
                <Phone className="w-4 h-4 text-slate-400 mt-0.5" />
                <div className="flex-1">
                  <div className="text-[10px] text-slate-455 uppercase tracking-wider mb-1">Phone Contact</div>
                  <div className="font-semibold text-slate-800">{player.phone}</div>
                </div>
              </div>
            )}
            {player.email && (
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 flex items-start gap-3">
                <Mail className="w-4 h-4 text-slate-400 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] text-slate-455 uppercase tracking-wider mb-1">Email Coordinates</div>
                  <div className="font-semibold text-slate-800 break-all">{player.email}</div>
                </div>
              </div>
            )}
            {player.address && (
              <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4 sm:col-span-2 flex items-start gap-3">
                <Home className="w-4 h-4 text-slate-400 mt-0.5" />
                <div className="flex-1">
                  <div className="text-[10px] text-slate-455 uppercase tracking-wider mb-1">Mailing Address</div>
                  <div className="font-semibold text-slate-800">{player.address}</div>
                </div>
              </div>
            )}
            {!player.dob && !player.date_of_birth && !player.dateOfBirth && !player.birth_date && !player.place && !player.phone && !player.email && !player.address && (
              <div className="sm:col-span-2 text-center py-8 text-slate-400 space-y-2">
                <FileText className="w-8 h-8 mx-auto text-slate-300 animate-pulse" />
                <p className="text-[11px] font-mono">No metadata registered for this player card.</p>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Timestamps Card */}
      <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl space-y-4">
        <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-750 flex items-center gap-2 border-b border-slate-100 pb-3">
          <Clock className="w-4 h-4 text-amber-500" />
          System Timestamps
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs font-mono">
          <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4">
            <div className="text-[10px] text-slate-455 uppercase tracking-wider mb-1">Record Created At</div>
            <div className="font-medium text-slate-700">{formatDate(player.created_at)}</div>
          </div>
          {player.updated_at && (
            <div className="bg-slate-50 border border-slate-200/60 rounded-xl p-4">
              <div className="text-[10px] text-slate-455 uppercase tracking-wider mb-1">Record Last Updated</div>
              <div className="font-medium text-slate-700">{formatDate(player.updated_at)}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
