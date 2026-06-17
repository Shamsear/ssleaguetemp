'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase/config';
import { collection, query, getDocs, doc, updateDoc, orderBy } from 'firebase/firestore';
import Image from 'next/image';
import { 
  ArrowLeft, 
  Search, 
  Upload, 
  Circle, 
  Square, 
  AlertCircle, 
  CheckCircle, 
  Sparkles, 
  Image as ImageIcon, 
  User, 
  Move,
  Maximize2
} from 'lucide-react';

interface Player {
  id: string;
  player_id: string;
  name: string;
  photo_url?: string;
  photo_file_id?: string;
  email?: string;
  // Circle shape settings
  photo_position_circle?: string; // Quick presets or custom 'X% Y%'
  photo_scale_circle?: number;
  photo_position_x_circle?: number; // 0-100 percentage for fine control
  photo_position_y_circle?: number; // 0-100 percentage for fine control
  // Square shape settings
  photo_position_square?: string;
  photo_scale_square?: number;
  photo_position_x_square?: number;
  photo_position_y_square?: number;
}

export default function PlayerPhotosManagement() {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  const [players, setPlayers] = useState<Player[]>([]);
  const [filteredPlayers, setFilteredPlayers] = useState<Player[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [loadingData, setLoadingData] = useState(true);
  const [uploadingPlayerId, setUploadingPlayerId] = useState<string | null>(null);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'all' | 'with-photo' | 'without-photo'>('all');
  const [previewShape, setPreviewShape] = useState<'circle' | 'square'>('circle');
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [modalShape, setModalShape] = useState<'circle' | 'square'>('circle');
  const [isDragging, setIsDragging] = useState(false);
  const [overlayPosition, setOverlayPosition] = useState({ x: 50, y: 50 });
  const [overlayScale, setOverlayScale] = useState(1);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchPlayers = async () => {
      if (!user || user.role !== 'super_admin') return;

      try {
        setLoadingData(true);
        const playersQuery = query(collection(db, 'realplayers'), orderBy('name'));
        const snapshot = await getDocs(playersQuery);
        
        const playersList = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        } as Player));
        
        setPlayers(playersList);
        setFilteredPlayers(playersList);
      } catch (err) {
        console.error('Error fetching players:', err);
        setError('Failed to load players');
      } finally {
        setLoadingData(false);
      }
    };

    fetchPlayers();
  }, [user]);

  useEffect(() => {
    let filtered = players;

    // Apply photo filter
    if (filterType === 'with-photo') {
      filtered = filtered.filter(p => p.photo_url);
    } else if (filterType === 'without-photo') {
      filtered = filtered.filter(p => !p.photo_url);
    }

    // Apply search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(p => 
        p.name.toLowerCase().includes(term) ||
        p.player_id.toLowerCase().includes(term) ||
        (p.email && p.email.toLowerCase().includes(term))
      );
    }

    setFilteredPlayers(filtered);
  }, [players, searchTerm, filterType]);

  const handlePhotoUpload = async (playerId: string, file: File) => {
    setUploadingPlayerId(playerId);
    setError(null);
    setSuccess(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('playerId', playerId);

      const response = await fetch('/api/players/photos/upload', {
        method: 'POST',
        body: formData,
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed');
      }

      // Update Firestore
      const playerDoc = players.find(p => p.player_id === playerId);
      if (playerDoc) {
        await updateDoc(doc(db, 'realplayers', playerDoc.id), {
          photo_url: result.url,
          photo_file_id: result.fileId,
          updated_at: new Date(),
        });

        // Update local state
        setPlayers(players.map(p => 
          p.player_id === playerId 
            ? { ...p, photo_url: result.url, photo_file_id: result.fileId }
            : p
        ));

        setSuccess(`Photo uploaded successfully for ${playerDoc.name}`);
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err.message || 'Failed to upload photo');
      setTimeout(() => setError(null), 5000);
    } finally {
      setUploadingPlayerId(null);
    }
  };

  const openAdjustmentModal = (player: Player, shape: 'circle' | 'square') => {
    setEditingPlayer(player);
    setModalShape(shape);
    
    // Load existing position
    const posX = shape === 'circle' ? (player.photo_position_x_circle ?? 50) : (player.photo_position_x_square ?? 50);
    const posY = shape === 'circle' ? (player.photo_position_y_circle ?? 50) : (player.photo_position_y_square ?? 50);
    const scale = shape === 'circle' ? (player.photo_scale_circle || 1) : (player.photo_scale_square || 1);
    
    setOverlayPosition({ x: posX, y: posY });
    setOverlayScale(scale);
  };

  const closeModal = () => {
    setEditingPlayer(null);
    setIsDragging(false);
  };

  const handlePhotoSettings = async (playerId: string, shape: 'circle' | 'square', position: string, scale: number, posX?: number, posY?: number) => {
    try {
      const playerDoc = players.find(p => p.player_id === playerId);
      if (!playerDoc) return;

      const fieldPosition = shape === 'circle' ? 'photo_position_circle' : 'photo_position_square';
      const fieldScale = shape === 'circle' ? 'photo_scale_circle' : 'photo_scale_square';
      const fieldPosX = shape === 'circle' ? 'photo_position_x_circle' : 'photo_position_x_square';
      const fieldPosY = shape === 'circle' ? 'photo_position_y_circle' : 'photo_position_y_square';

      // Update Firestore
      const updateData: any = {
        [fieldPosition]: position,
        [fieldScale]: scale,
        updated_at: new Date(),
      };
      
      if (posX !== undefined) updateData[fieldPosX] = posX;
      if (posY !== undefined) updateData[fieldPosY] = posY;

      await updateDoc(doc(db, 'realplayers', playerDoc.id), updateData);

      // Update local state
      setPlayers(players.map(p => {
        if (p.player_id === playerId) {
          const updated: any = { ...p, [fieldPosition]: position, [fieldScale]: scale };
          if (posX !== undefined) updated[fieldPosX] = posX;
          if (posY !== undefined) updated[fieldPosY] = posY;
          return updated;
        }
        return p;
      }));

      setSuccess(`${shape === 'circle' ? 'Circle' : 'Square'} photo settings updated`);
      setTimeout(() => setSuccess(null), 2000);
    } catch (err: any) {
      console.error('Update error:', err);
      setError(err.message || 'Failed to update photo settings');
      setTimeout(() => setError(null), 3000);
    }
  };

  const saveModalSettings = async () => {
    if (!editingPlayer) return;
    
    await handlePhotoSettings(
      editingPlayer.player_id,
      modalShape,
      'custom',
      overlayScale,
      overlayPosition.x,
      overlayPosition.y
    );
    
    closeModal();
  };

  const handleBulkUpload = async (files: FileList) => {
    setBulkUploading(true);
    setError(null);
    
    const results = {
      success: 0,
      failed: 0,
      errors: [] as string[],
    };

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = file.name.toLowerCase();
      const playerId = fileName.split('.')[0];

      const player = players.find(p => p.player_id.toLowerCase() === playerId);
      
      if (!player) {
        results.failed++;
        results.errors.push(`${file.name}: Player not found`);
        continue;
      }

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('playerId', player.player_id);

        const response = await fetch('/api/players/photos/upload', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.error);
        }

        // Update Firestore
        await updateDoc(doc(db, 'realplayers', player.id), {
          photo_url: result.url,
          photo_file_id: result.fileId,
          updated_at: new Date(),
        });

        // Update local state
        setPlayers(prev => prev.map(p => 
          p.id === player.id 
            ? { ...p, photo_url: result.url, photo_file_id: result.fileId }
            : p
        ));

        results.success++;
      } catch (err: any) {
        results.failed++;
        results.errors.push(`${file.name}: ${err.message}`);
      }
    }

    setBulkUploading(false);
    
    if (results.success > 0) {
      setSuccess(`Uploaded ${results.success} photo(s) successfully`);
    }
    if (results.failed > 0) {
      setError(`Failed: ${results.failed}. ${results.errors.slice(0, 3).join(', ')}`);
    }
  };

  const stats = {
    total: players.length,
    withPhoto: players.filter(p => p.photo_url).length,
    withoutPhoto: players.filter(p => !p.photo_url).length,
  };

  if (loading || loadingData) {
    return (
      <div className="flex items-center justify-center pt-32">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-550 font-mono text-xs tracking-widest uppercase animate-pulse">Loading player registry...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="space-y-8 animate-fade-in font-mono">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/60">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/superadmin')}
            className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-650 hover:text-slate-950 transition-all flex-shrink-0 shadow-sm"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Player Photos Management
            </h1>
            <p className="text-xs text-slate-505 font-mono mt-1">
              Upload raw player assets, configure positioning offsets, and preview circular/square shapes.
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="rounded-2xl p-4 bg-rose-50 border border-rose-200 text-rose-700 font-mono text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
          <p className="flex-1">{error}</p>
        </div>
      )}

      {success && (
        <div className="rounded-2xl p-4 bg-emerald-50 border border-emerald-250 text-emerald-700 font-mono text-xs flex items-center gap-3">
          <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
          <p className="flex-1">{success}</p>
        </div>
      )}

      {/* Stats Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="console-card bg-white border border-slate-200/60 p-5 shadow-sm rounded-2xl">
          <div className="text-[10px] text-slate-450 uppercase tracking-wider mb-1">Total Players</div>
          <div className="text-2xl font-extrabold text-slate-800">{stats.total}</div>
        </div>
        <div className="console-card bg-white border border-slate-200/60 p-5 shadow-sm rounded-2xl text-emerald-650">
          <div className="text-[10px] text-slate-450 uppercase tracking-wider mb-1">With Photo</div>
          <div className="text-2xl font-extrabold">{stats.withPhoto}</div>
        </div>
        <div className="console-card bg-white border border-slate-200/60 p-5 shadow-sm rounded-2xl text-amber-600">
          <div className="text-[10px] text-slate-450 uppercase tracking-wider mb-1">Without Photo</div>
          <div className="text-2xl font-extrabold">{stats.withoutPhoto}</div>
        </div>
      </div>

      {/* Bulk Upload Section */}
      <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl space-y-4">
        <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
          <Upload className="w-4 h-4 text-amber-500" />
          Bulk Upload Photos
        </h2>
        <p className="text-xs text-slate-500 leading-relaxed">
          Upload multiple photos concurrently. Filenames must exactly match player registry ID keys (e.g., <code className="bg-slate-100 px-1.5 py-0.5 rounded text-amber-600 font-bold">sspslpsl0001.jpg</code>).
        </p>
        <div className="max-w-md">
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={bulkUploading}
            onChange={(e) => e.target.files && handleBulkUpload(e.target.files)}
            className="block w-full text-xs text-slate-700 border border-slate-200 rounded-xl cursor-pointer bg-slate-50 focus:outline-none file:mr-4 file:py-2.5 file:px-4 file:border-0 file:text-xs file:font-bold file:bg-slate-850 file:text-white hover:file:bg-slate-900"
          />
        </div>
        {bulkUploading && (
          <div className="text-xs text-amber-600 flex items-center gap-2">
            <div className="w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full animate-spin"></div>
            Uploading files...
          </div>
        )}
      </div>

      {/* Search and Filters Console */}
      <div className="console-card bg-white border border-slate-200/60 p-5 shadow-sm rounded-2xl space-y-4">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-stretch md:items-center">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, registry ID, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 outline-none text-slate-850 font-mono text-xs transition-all placeholder-slate-400"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-mono">
            <button
              onClick={() => setFilterType('all')}
              className={`px-4 py-2 rounded-xl font-bold transition-all ${
                filterType === 'all'
                  ? 'bg-slate-800 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              All Players
            </button>
            <button
              onClick={() => setFilterType('with-photo')}
              className={`px-4 py-2 rounded-xl font-bold transition-all ${
                filterType === 'with-photo'
                  ? 'bg-slate-800 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              With Photo
            </button>
            <button
              onClick={() => setFilterType('without-photo')}
              className={`px-4 py-2 rounded-xl font-bold transition-all ${
                filterType === 'without-photo'
                  ? 'bg-slate-800 text-white'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
            >
              No Photo
            </button>
          </div>
        </div>
        
        {/* Shape Preview Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center gap-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Preview Shape:</span>
            <div className="flex gap-2">
              <button
                onClick={() => setPreviewShape('circle')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  previewShape === 'circle'
                    ? 'bg-amber-500/10 text-amber-700 border border-amber-500/20'
                    : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Circle className="w-3.5 h-3.5" />
                Circle View
              </button>
              <button
                onClick={() => setPreviewShape('square')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                  previewShape === 'square'
                    ? 'bg-amber-500/10 text-amber-700 border border-amber-500/20'
                    : 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700'
                }`}
              >
                <Square className="w-3.5 h-3.5" />
                Square View
              </button>
            </div>
          </div>
          <span className="text-[10px] text-slate-450 font-mono">Showing {filteredPlayers.length} of {players.length} matching records</span>
        </div>
      </div>

      {/* Players Grid */}
      {filteredPlayers.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
          {filteredPlayers.map(player => {
            const currentScale = previewShape === 'circle'
              ? (player.photo_scale_circle || 1)
              : (player.photo_scale_square || 1);
            const currentPosX = previewShape === 'circle'
              ? (player.photo_position_x_circle ?? 50)
              : (player.photo_position_x_square ?? 50);
            const currentPosY = previewShape === 'circle'
              ? (player.photo_position_y_circle ?? 50)
              : (player.photo_position_y_square ?? 50);
            
            return (
              <div key={player.id} className="console-card bg-white border border-slate-200/60 p-4 shadow-sm rounded-2xl hover:shadow-md transition-all flex flex-col justify-between space-y-4">
                
                {/* Photo Aspect Frame */}
                <div 
                  className={`relative w-full aspect-square overflow-hidden bg-slate-50 border border-slate-100 flex-shrink-0 ${
                    previewShape === 'circle' ? 'rounded-full shadow-inner' : 'rounded-xl'
                  }`}
                >
                  {player.photo_url ? (
                    <Image
                      src={player.photo_url}
                      alt={player.name}
                      fill
                      className="object-cover"
                      style={{
                        objectPosition: `${currentPosX}% ${currentPosY}%`,
                        transform: `scale(${currentScale})`,
                        transformOrigin: `${currentPosX}% ${currentPosY}%`
                      }}
                      unoptimized
                      draggable={false}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-slate-300">
                      <User className="w-16 h-16 stroke-[1.2]" />
                    </div>
                  )}
                </div>

                {/* Player Metadata */}
                <div className="min-w-0">
                  <h3 className="font-bold text-slate-905 truncate text-sm">{player.name}</h3>
                  <p className="text-[10px] text-slate-450 font-mono mt-0.5">{player.player_id}</p>
                </div>

                {/* Adjuster controls */}
                {player.photo_url && (
                  <div className="grid grid-cols-2 gap-2 font-mono text-[10px] text-slate-700">
                    <button
                      onClick={() => openAdjustmentModal(player, 'circle')}
                      className="py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center gap-1 font-bold"
                    >
                      <Circle className="w-3 h-3 text-slate-450" />
                      Circle
                    </button>
                    <button
                      onClick={() => openAdjustmentModal(player, 'square')}
                      className="py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 flex items-center justify-center gap-1 font-bold"
                    >
                      <Square className="w-3 h-3 text-slate-450" />
                      Square
                    </button>
                  </div>
                )}

                {/* File Upload Selector */}
                <label className="block">
                  <input
                    type="file"
                    accept="image/*"
                    disabled={uploadingPlayerId === player.player_id}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        handlePhotoUpload(player.player_id, file);
                      }
                    }}
                    className="hidden"
                  />
                  <div className={`py-2 rounded-xl text-center cursor-pointer text-xs font-mono font-bold transition-all ${
                    uploadingPlayerId === player.player_id
                      ? 'bg-slate-100 text-slate-400 cursor-not-allowed border border-slate-200'
                      : player.photo_url
                      ? 'bg-white border border-slate-200 hover:bg-slate-50 text-slate-700'
                      : 'bg-slate-800 hover:bg-slate-900 text-white shadow-sm'
                  }`}>
                    {uploadingPlayerId === player.player_id ? (
                      <span className="flex items-center justify-center gap-1.5">
                        <span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span>
                        Uploading
                      </span>
                    ) : player.photo_url ? (
                      'Change Asset'
                    ) : (
                      'Upload Asset'
                    )}
                  </div>
                </label>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="console-card bg-white border border-slate-200/60 p-16 text-center text-slate-500">
          <ImageIcon className="w-12 h-12 mx-auto text-slate-300 mb-4 animate-pulse" />
          <h3 className="font-extrabold text-slate-805 mb-1 text-sm">No Player Records Found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Try adjusting your search criteria or toggling photo filtering switches.
          </p>
        </div>
      )}

      {/* Draggable Adjustment Modal Dialog */}
      {editingPlayer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={closeModal}>
          <div 
            className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-slate-200/60 flex flex-col font-mono"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between border-b border-slate-800">
              <div>
                <h2 className="text-lg font-bold">{editingPlayer.name}</h2>
                <p className="text-[10px] text-slate-450 mt-0.5">
                  Adjust Focus Offset & Zoom Level — {modalShape === 'circle' ? '⭕ Circular crop preview' : '⬜ Square crop preview'}
                </p>
              </div>
              <button
                onClick={closeModal}
                className="p-2 hover:bg-white/10 rounded-xl transition-all text-slate-450 hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 overflow-y-auto flex-1 space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                
                {/* Left: Raw Image viewport with Draggable Overlay Focus */}
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Move className="w-3.5 h-3.5" />
                    Drag & Focus Pointer
                  </h3>
                  <div 
                    className="relative w-full aspect-square bg-slate-100 rounded-2xl overflow-hidden cursor-move border border-slate-200/60 shadow-inner select-none"
                    onMouseDown={(e) => {
                      setIsDragging(true);
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = ((e.clientX - rect.left) / rect.width) * 100;
                      const y = ((e.clientY - rect.top) / rect.height) * 100;
                      setOverlayPosition({ x, y });
                    }}
                    onMouseMove={(e) => {
                      if (!isDragging) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
                      const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
                      setOverlayPosition({ x, y });
                    }}
                    onMouseUp={() => setIsDragging(false)}
                    onMouseLeave={() => setIsDragging(false)}
                  >
                    {/* Full source image */}
                    {editingPlayer.photo_url && (
                      <Image
                        src={editingPlayer.photo_url}
                        alt={editingPlayer.name}
                        fill
                        className="object-cover"
                        unoptimized
                        draggable={false}
                      />
                    )}
                    
                    {/* Draggable boundary mask overlay */}
                    <div 
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: `radial-gradient(circle at ${overlayPosition.x}% ${overlayPosition.y}%, transparent 0%, transparent ${(modalShape === 'circle' ? 150 : 200) / overlayScale}px, rgba(15,23,42,0.7) ${(modalShape === 'circle' ? 150 : 200) / overlayScale}px)`
                      }}
                    >
                      {/* Anchor marker */}
                      <div
                        className={`absolute border-2 border-amber-500 shadow-2xl ${
                          modalShape === 'circle' ? 'rounded-full' : 'rounded-xl'
                        }`}
                        style={{
                          width: `${300 / overlayScale}px`,
                          height: `${300 / overlayScale}px`,
                          left: `calc(${overlayPosition.x}% - ${150 / overlayScale}px)`,
                          top: `calc(${overlayPosition.y}% - ${150 / overlayScale}px)`,
                        }}
                      >
                        <div className="absolute inset-0 flex items-center justify-center">
                          <div className="w-0.5 h-6 bg-amber-500"></div>
                          <div className="w-6 h-0.5 bg-amber-500 absolute"></div>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Position details */}
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-3 text-xs text-slate-500 flex justify-between font-mono">
                    <span>Active Alignment:</span>
                    <span className="font-bold text-amber-600">
                      X: {overlayPosition.x.toFixed(1)}% / Y: {overlayPosition.y.toFixed(1)}%
                    </span>
                  </div>
                </div>

                {/* Right: Crop result preview and zoom controller */}
                <div className="space-y-5">
                  <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Maximize2 className="w-3.5 h-3.5" />
                    Cropped Aspect Preview
                  </h3>
                  
                  {/* Aspect viewport */}
                  <div className="p-4 border border-slate-100 bg-slate-50 rounded-2xl">
                    <div 
                      className={`relative w-60 h-60 mx-auto bg-white border border-slate-200 shadow-md overflow-hidden ${
                        modalShape === 'circle' ? 'rounded-full' : 'rounded-2xl'
                      }`}
                    >
                      {editingPlayer.photo_url && (
                        <Image
                          src={editingPlayer.photo_url}
                          alt={editingPlayer.name}
                          fill
                          className="object-cover"
                          style={{
                            objectPosition: `${overlayPosition.x}% ${overlayPosition.y}%`,
                            transform: `scale(${overlayScale})`,
                            transformOrigin: `${overlayPosition.x}% ${overlayPosition.y}%`
                          }}
                          unoptimized
                          draggable={false}
                        />
                      )}
                    </div>
                  </div>

                  {/* Mode switcher */}
                  <div className="space-y-2">
                    <label className="block text-xs font-bold text-slate-550 uppercase tracking-wider">Adjustment mode shape:</label>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <button
                        onClick={() => {
                          setModalShape('circle');
                          const posX = editingPlayer.photo_position_x_circle ?? 50;
                          const posY = editingPlayer.photo_position_y_circle ?? 50;
                          const scale = editingPlayer.photo_scale_circle || 1;
                          setOverlayPosition({ x: posX, y: posY });
                          setOverlayScale(scale);
                        }}
                        className={`py-2 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 ${
                          modalShape === 'circle'
                            ? 'bg-amber-500/10 text-amber-700 border border-amber-500/20'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Circle className="w-3.5 h-3.5" />
                        Circle
                      </button>
                      <button
                        onClick={() => {
                          setModalShape('square');
                          const posX = editingPlayer.photo_position_x_square ?? 50;
                          const posY = editingPlayer.photo_position_y_square ?? 50;
                          const scale = editingPlayer.photo_scale_square || 1;
                          setOverlayPosition({ x: posX, y: posY });
                          setOverlayScale(scale);
                        }}
                        className={`py-2 rounded-xl font-bold transition-all flex items-center justify-center gap-1.5 ${
                          modalShape === 'square'
                            ? 'bg-amber-500/10 text-amber-700 border border-amber-500/20'
                            : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <Square className="w-3.5 h-3.5" />
                        Square
                      </button>
                    </div>
                  </div>

                  {/* Zoom slider */}
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-xs text-slate-500 font-mono">
                      <span>Zoom Magnifier:</span>
                      <span className="font-bold text-slate-805">{(overlayScale * 100).toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={() => setOverlayScale(Math.max(0.5, overlayScale - 0.1))}
                        className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-extrabold text-sm transition-all"
                      >
                        −
                      </button>
                      <input
                        type="range"
                        min="0.5"
                        max="2"
                        step="0.1"
                        value={overlayScale}
                        onChange={(e) => setOverlayScale(parseFloat(e.target.value))}
                        className="flex-1 accent-slate-800"
                      />
                      <button
                        onClick={() => setOverlayScale(Math.min(2, overlayScale + 0.1))}
                        className="w-8 h-8 flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-extrabold text-sm transition-all"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  {/* Centering button */}
                  <button
                    onClick={() => {
                      setOverlayPosition({ x: 50, y: 50 });
                      setOverlayScale(1);
                    }}
                    className="w-full py-2 bg-slate-100 hover:bg-slate-200/80 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 transition-all"
                  >
                    Reset Offset Focus
                  </button>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="bg-slate-50 px-6 py-4 flex justify-end gap-3 border-t border-slate-200/60">
              <button
                onClick={closeModal}
                className="px-5 py-2.5 bg-white border border-slate-200/60 hover:bg-slate-100/50 text-slate-700 text-xs font-bold rounded-xl transition-all"
              >
                Cancel
              </button>
              <button
                onClick={saveModalSettings}
                className="px-5 py-2.5 bg-slate-805 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
              >
                Save Adjustment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
