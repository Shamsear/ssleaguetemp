'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { 
  ArrowLeft, 
  Upload, 
  Image as ImageIcon, 
  Link as LinkIcon, 
  Copy, 
  AlertCircle, 
  CheckCircle, 
  Sparkles,
  FileText,
  RefreshCw,
  Trophy,
  Award as AwardIcon,
  Layers
} from 'lucide-react';

interface Award {
  id: string;
  award_type: string;
  player_name?: string;
  team_name?: string;
  round_number?: number;
  week_number?: number;
  season_id?: string;
  instagram_link?: string;
  instagram_post_url?: string;
}

interface PlayerAward {
  id: string;
  award_type: string;
  player_name: string;
  team_name?: string;
  award_position?: string;
  season_id?: string;
  instagram_link?: string;
  instagram_post_url?: string;
}

interface Trophy {
  id: string;
  trophy_name: string;
  team_name: string;
  trophy_type: string;
  season_id?: string;
  instagram_link?: string;
  instagram_post_url?: string;
}

export default function UploadAwardImagesPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadedUrl, setUploadedUrl] = useState<string>('');
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [instagramPostUrl, setInstagramPostUrl] = useState<string>('');

  // Award selection
  const [awardType, setAwardType] = useState<'award' | 'player_award' | 'trophy'>('award');
  const [awards, setAwards] = useState<Award[]>([]);
  const [playerAwards, setPlayerAwards] = useState<PlayerAward[]>([]);
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
    if (!authLoading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, authLoading, router]);

  // Fetch awards on mount
  useEffect(() => {
    fetchAllData();
  }, []);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [awardsRes, playerAwardsRes, trophiesRes] = await Promise.all([
        fetch('/api/awards'),
        fetch('/api/player-awards'),
        fetch('/api/trophies')
      ]);

      const [awardsData, playerAwardsData, trophiesData] = await Promise.all([
        awardsRes.json(),
        playerAwardsRes.json(),
        trophiesRes.json()
      ]);

      const allAwards = Array.isArray(awardsData.data) ? awardsData.data : [];
      const allPlayerAwards = Array.isArray(playerAwardsData.awards) ? playerAwardsData.awards : [];
      const allTrophies = Array.isArray(trophiesData.trophies) ? trophiesData.trophies : [];

      if (awardsData.success) setAwards(allAwards);
      if (playerAwardsData.success) setPlayerAwards(allPlayerAwards);
      if (trophiesData.success) setTrophies(allTrophies);

      // Extract unique seasons from all sources
      const seasonSet = new Set<string>();
      allAwards.forEach((a: any) => a.season_id && seasonSet.add(a.season_id));
      allPlayerAwards.forEach((a: any) => a.season_id && seasonSet.add(a.season_id));
      allTrophies.forEach((t: any) => t.season_id && seasonSet.add(t.season_id));

      if (seasonSet.size > 0) {
        const getSeasonNum = (id: string) => parseInt(id.replace(/\D/g, '')) || 0;
        const uniqueSeasons = Array.from(seasonSet).sort((a, b) => getSeasonNum(b) - getSeasonNum(a));
        setSeasons(uniqueSeasons);
      }
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Get current image for selected item
  const getCurrentImage = () => {
    if (!selectedItemId) return null;

    // Convert selectedItemId to number for comparison (since DB returns numbers)
    const numericId = typeof selectedItemId === 'string' ? parseInt(selectedItemId, 10) : selectedItemId;

    if (awardType === 'award') {
      const award = awards.find(a => a.id == numericId);
      return award?.instagram_link || null;
    } else if (awardType === 'player_award') {
      const award = playerAwards.find(a => a.id == numericId);
      return award?.instagram_link || null;
    } else if (awardType === 'trophy') {
      const trophy = trophies.find(t => t.id == numericId);
      return trophy?.instagram_link || null;
    }
    return null;
  };

  // Get current Instagram post URL for selected item
  const getCurrentInstagramUrl = () => {
    if (!selectedItemId) return null;

    // Convert selectedItemId to number for comparison (since DB returns numbers)
    const numericId = typeof selectedItemId === 'string' ? parseInt(selectedItemId, 10) : selectedItemId;

    if (awardType === 'award') {
      const award = awards.find(a => a.id == numericId);
      return award?.instagram_post_url || null;
    } else if (awardType === 'player_award') {
      const award = playerAwards.find(a => a.id == numericId);
      return award?.instagram_post_url || null;
    } else if (awardType === 'trophy') {
      const trophy = trophies.find(t => t.id == numericId);
      return trophy?.instagram_post_url || null;
    }
    return null;
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setUploadedUrl('');
      setMessage(null);

      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setMessage({ type: 'error', text: 'Please select a file first' });
      return;
    }

    if (!selectedItemId) {
      setMessage({ type: 'error', text: 'Please select an award/trophy' });
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      // Upload image
      const formData = new FormData();
      formData.append('file', selectedFile);

      const uploadResponse = await fetch('/api/upload-award-image', {
        method: 'POST',
        body: formData,
      });

      const uploadData = await uploadResponse.json();

      if (!uploadData.success) {
        throw new Error(uploadData.error || 'Upload failed');
      }

      const imageUrl = uploadData.url;
      setUploadedUrl(imageUrl);

      // Show duplicate message if applicable
      if (uploadData.isDuplicate) {
        setMessage({
          type: 'success',
          text: '⚠️ This image already exists in ImageKit. Using existing file to avoid duplicates.'
        });
      }

      // Update database
      let updateEndpoint = '';
      let updateBody: any = {
        instagram_link: imageUrl,
        instagram_post_url: instagramPostUrl || null
      };

      if (awardType === 'award') {
        updateEndpoint = `/api/awards/${selectedItemId}`;
      } else if (awardType === 'player_award') {
        updateEndpoint = `/api/player-awards/${selectedItemId}`;
      } else if (awardType === 'trophy') {
        updateEndpoint = `/api/trophies/${selectedItemId}`;
      }

      const updateResponse = await fetch(updateEndpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updateBody),
      });

      const updateResult = await updateResponse.json();

      if (updateResult.success) {
        setMessage({ type: 'success', text: 'Image uploaded and linked successfully!' });
        // Refresh data
        await fetchAllData();
      } else {
        setMessage({ type: 'success', text: `Image uploaded to ${imageUrl}, but auto-link failed. Please update manually.` });
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || 'Upload failed' });
    } finally {
      setUploading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setMessage({ type: 'success', text: 'Copied to clipboard!' });
    setTimeout(() => setMessage(null), 2000);
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center pt-32">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-550 font-mono text-xs tracking-widest uppercase animate-pulse">Syncing Media Telemetry...</p>
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
            className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-600 hover:text-slate-950 transition-all flex-shrink-0 shadow-sm"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Upload Award Images
            </h1>
            <p className="text-xs text-slate-550 font-mono mt-1">
              Upload custom assets to ImageKit storage and auto-link them to awards, trophies, and player cards.
            </p>
          </div>
        </div>
      </div>

      {/* Award Selection Panel */}
      <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl space-y-5">
        <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 border-b border-slate-100 pb-3">
          <Layers className="w-4 h-4 text-amber-500" />
          Select Target Context
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 font-mono text-xs">
          {/* Season Selector */}
          <div className="space-y-2">
            <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
              Season Filter
            </label>
            <select
              value={selectedSeason}
              onChange={(e) => {
                setSelectedSeason(e.target.value);
                setSelectedItemId('');
              }}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-amber-400 outline-none"
            >
              <option value="">All Seasons</option>
              {seasons.map((season) => (
                <option key={season} value={season}>
                  {season}
                </option>
              ))}
            </select>
          </div>

          {/* Award Type Selector */}
          <div className="space-y-2">
            <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
              Asset Category Type
            </label>
            <select
              value={awardType}
              onChange={(e) => {
                setAwardType(e.target.value as any);
                setSelectedItemId('');
              }}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-amber-400 outline-none"
            >
              <option value="award">General Awards (POTD, POTW, TOTS)</option>
              <option value="player_award">Individual Player Awards (Golden Boot)</option>
              <option value="trophy">Franchise Trophies</option>
            </select>
          </div>

          {/* Item Selector */}
          <div className="space-y-2">
            <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
              Specific Award Item
            </label>
            <select
              value={selectedItemId}
              onChange={(e) => {
                setSelectedItemId(e.target.value);
                setSelectedFile(null);
                setPreview('');
                setUploadedUrl('');
                setMessage(null);
                const currentUrl = getCurrentInstagramUrl();
                setInstagramPostUrl(currentUrl || '');
              }}
              className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-amber-400 outline-none"
            >
              <option value="">-- Select {awardType === 'award' ? 'Award' : awardType === 'player_award' ? 'Player Award' : 'Trophy'} --</option>
              {awardType === 'award' && Array.isArray(awards) && awards
                .filter(award => (!selectedSeason || award.season_id === selectedSeason) && (award.player_name || award.team_name))
                .map((award) => (
                  <option key={award.id} value={award.id}>
                    {award.instagram_link ? '📸 ' : '⬜ '}
                    {award.award_type} - {award.player_name || award.team_name}
                    {award.round_number ? ` (Round ${award.round_number})` : ''}
                    {award.week_number ? ` (Week ${award.week_number})` : ''}
                    {!selectedSeason ? ` [${award.season_id}]` : ''}
                  </option>
                ))}
              {awardType === 'player_award' && Array.isArray(playerAwards) && playerAwards
                .filter(award => {
                  if (selectedSeason && award.season_id !== selectedSeason) return false;
                  const type = award.award_type?.trim();
                  if (!award.player_name && !award.team_name) return false;
                  if (!type || type === 'Category') return false;

                  const excludedTypes = ['POTD', 'TOD', 'POTW', 'TOTW', 'MOTM', 'Man of the Match', 'Player of the Day', 'Team of the Day'];
                  if (excludedTypes.some(t => {
                    const upperType = type.toUpperCase();
                    return upperType === t || upperType.includes('PLAYER OF THE DAY');
                  })) return false;

                  return true;
                })
                .map((award) => (
                  <option key={award.id} value={award.id}>
                    {award.instagram_link ? '📸 ' : '⬜ '}
                    {award.award_type} - {award.player_name} {award.award_position ? `(${award.award_position})` : ''}
                    {!selectedSeason ? ` [${award.season_id}]` : ''}
                  </option>
                ))}
              {awardType === 'trophy' && Array.isArray(trophies) && trophies
                .filter(trophy => !selectedSeason || trophy.season_id === selectedSeason)
                .map((trophy) => (
                  <option key={trophy.id} value={trophy.id}>
                    {trophy.instagram_link ? '📸 ' : '⬜ '}
                    {trophy.trophy_name} - {trophy.team_name} ({trophy.trophy_type})
                    {!selectedSeason ? ` [${trophy.season_id}]` : ''}
                  </option>
                ))}
            </select>
          </div>
        </div>
      </div>

      {/* Upload Section Panel */}
      <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl space-y-6">
        <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5 border-b border-slate-100 pb-3">
          <Upload className="w-4 h-4 text-amber-500" />
          Image Asset Payload
        </h2>

        {/* Existing Image Display */}
        {selectedItemId && getCurrentImage() && !preview && (
          <div className="space-y-2 max-w-md">
            <p className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">📸 Current Configured Asset:</p>
            <div className="relative group rounded-2xl overflow-hidden border border-slate-200/65 shadow-sm bg-slate-50 p-2">
              <img
                src={getCurrentImage()!}
                alt="Current award achievement image"
                className="w-full max-h-64 object-contain rounded-xl"
              />
            </div>
            {getCurrentInstagramUrl() && (
              <a
                href={getCurrentInstagramUrl()!}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] text-amber-600 hover:text-amber-800 hover:underline flex items-center gap-1 font-mono pt-1"
              >
                <LinkIcon className="w-3.5 h-3.5" />
                View Linked Instagram Post
              </a>
            )}
          </div>
        )}

        {/* Dropzone File Selector */}
        <div className="mb-4">
          <label className="flex flex-col items-center justify-center w-full h-64 border border-slate-200 border-dashed rounded-2xl cursor-pointer bg-slate-50 hover:bg-slate-100/50 hover:border-amber-400/50 transition duration-200">
            <div className="flex flex-col items-center justify-center pt-5 pb-6 px-4 text-center">
              {preview ? (
                <img src={preview} alt="Upload Preview" className="max-h-52 rounded-xl border border-slate-200 shadow-sm" />
              ) : (
                <>
                  <ImageIcon className="w-12 h-12 mb-4 text-slate-400 stroke-[1.2]" />
                  <p className="mb-2 text-xs text-slate-600 font-mono">
                    <span className="font-bold text-slate-800">Click to browse file</span> or drag and drop image here
                  </p>
                  <p className="text-[10px] text-slate-400 font-mono">PNG, JPG, WEBP formats (Max size: 10MB)</p>
                </>
              )}
            </div>
            <input
              type="file"
              className="hidden"
              accept="image/jpeg,image/jpg,image/png,image/webp"
              onChange={handleFileSelect}
            />
          </label>
        </div>

        {/* File Metadata Box */}
        {selectedFile && (
          <div className="p-4 bg-slate-50 border border-slate-200/60 rounded-xl text-xs font-mono text-slate-700 flex items-center justify-between">
            <div className="min-w-0">
              <p className="font-bold text-slate-800 truncate">Payload: {selectedFile.name}</p>
              <p className="text-[10px] text-slate-450 mt-0.5">Size: {(selectedFile.size / 1024).toFixed(2)} KB</p>
            </div>
          </div>
        )}

        {/* Instagram Post URL */}
        <div className="space-y-2 max-w-2xl text-xs font-mono">
          <label className="block text-[10px] font-mono font-bold text-slate-505 uppercase tracking-wider">
            Instagram Post Redirect Link (optional):
          </label>
          <input
            type="url"
            value={instagramPostUrl}
            onChange={(e) => setInstagramPostUrl(e.target.value)}
            placeholder="e.g. https://www.instagram.com/p/POST_ID/"
            className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 outline-none text-slate-800 font-mono text-xs transition-all placeholder-slate-400"
          />
          <p className="text-[10px] text-slate-450">
            Clicking this image on the site will redirect visitors to this Instagram post.
          </p>
        </div>

        {/* Action button */}
        <button
          onClick={handleUpload}
          disabled={!selectedFile || !selectedItemId || uploading}
          className={`w-full py-3 px-4 rounded-xl font-mono text-xs font-bold text-white transition-all shadow-sm flex items-center justify-center gap-2 ${
            !selectedFile || !selectedItemId || uploading
              ? 'bg-slate-100 text-slate-400 border border-slate-200 cursor-not-allowed'
              : getCurrentImage() ? 'bg-amber-600 hover:bg-amber-700' : 'bg-slate-800 hover:bg-slate-900'
          }`}
        >
          {uploading ? (
            <span className="flex items-center gap-1.5">
              <RefreshCw className="w-4 h-4 animate-spin" />
              {getCurrentImage() ? 'Replacing Storage Object...' : 'Uploading Asset payload...'}
            </span>
          ) : (
            getCurrentImage() ? '🔄 Replace Configured Asset' : '📤 Upload & Link Asset'
          )}
        </button>

        {/* Message Banner */}
        {message && (
          <div className={`rounded-xl p-4 font-mono text-xs flex items-center gap-3 border ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            {message.type === 'success' ? <CheckCircle className="w-4 h-4 text-emerald-550 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 text-rose-500 flex-shrink-0" />}
            <p className="flex-1">{message.text}</p>
          </div>
        )}
      </div>

      {/* Success Result Panel */}
      {uploadedUrl && (
        <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl space-y-6">
          <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-emerald-650 flex items-center gap-1.5 border-b border-slate-100 pb-3">
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            Asset Upload Telemetry Successful
          </h2>

          <div className="relative w-full max-w-md mx-auto rounded-2xl overflow-hidden border border-slate-200 shadow-sm p-2 bg-slate-50">
            <img
              src={uploadedUrl}
              alt="Uploaded Asset preview"
              className="w-full max-h-64 object-contain rounded-xl"
            />
          </div>

          <div className="space-y-4 font-mono text-xs max-w-3xl">
            <div className="space-y-2">
              <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                Target Image CDN URL:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={uploadedUrl}
                  readOnly
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-xl bg-slate-50 text-slate-600 font-mono text-xs select-all"
                />
                <button
                  onClick={() => copyToClipboard(uploadedUrl)}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm flex items-center gap-1.5"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </button>
              </div>
            </div>

            {/* SQL Examples */}
            <div className="bg-slate-50 border border-slate-200/60 p-4 rounded-xl space-y-4">
              <p className="text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <FileText className="w-3.5 h-3.5" />
                SQL Database Update Snippets
              </p>

              <div className="space-y-3">
                <div>
                  <p className="text-[10px] text-slate-450 uppercase mb-1">For Awards table updates:</p>
                  <code className="block bg-white p-3 rounded-xl border border-slate-200/65 overflow-x-auto text-[11px] font-mono text-slate-700">
                    UPDATE awards SET instagram_link = '{uploadedUrl}' WHERE id = '{selectedItemId || 'award_id'}';
                  </code>
                  <button
                    onClick={() => copyToClipboard(`UPDATE awards SET instagram_link = '${uploadedUrl}' WHERE id = '${selectedItemId || 'award_id'}';`)}
                    className="mt-1 text-amber-600 hover:text-amber-800 hover:underline text-[10px] font-bold"
                  >
                    Copy SQL Statement
                  </button>
                </div>

                <div>
                  <p className="text-[10px] text-slate-450 uppercase mb-1">For Player Awards table updates:</p>
                  <code className="block bg-white p-3 rounded-xl border border-slate-200/65 overflow-x-auto text-[11px] font-mono text-slate-700">
                    UPDATE player_awards SET instagram_link = '{uploadedUrl}' WHERE id = '{selectedItemId || 'award_id'}';
                  </code>
                  <button
                    onClick={() => copyToClipboard(`UPDATE player_awards SET instagram_link = '${uploadedUrl}' WHERE id = '${selectedItemId || 'award_id'}';`)}
                    className="mt-1 text-amber-600 hover:text-amber-800 hover:underline text-[10px] font-bold"
                  >
                    Copy SQL Statement
                  </button>
                </div>

                <div>
                  <p className="text-[10px] text-slate-455 uppercase mb-1">For Trophies table updates:</p>
                  <code className="block bg-white p-3 rounded-xl border border-slate-200/65 overflow-x-auto text-[11px] font-mono text-slate-700">
                    UPDATE team_trophies SET instagram_link = '{uploadedUrl}' WHERE id = '{selectedItemId || 'trophy_id'}';
                  </code>
                  <button
                    onClick={() => copyToClipboard(`UPDATE team_trophies SET instagram_link = '${uploadedUrl}' WHERE id = '${selectedItemId || 'trophy_id'}';`)}
                    className="mt-1 text-amber-600 hover:text-amber-800 hover:underline text-[10px] font-bold"
                  >
                    Copy SQL Statement
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
