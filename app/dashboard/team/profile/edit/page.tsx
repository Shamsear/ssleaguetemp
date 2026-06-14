'use client';

import { SoccerBallIcon } from '@/components/ui/CustomIcons';
import { Calendar, Search, Trophy, User, UserCheck, Users, XCircle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { uploadImage } from '@/lib/imagekit/upload';
import { useCachedSeasons } from '@/hooks/useCachedFirebase';

interface RealPlayer {
  id: string | number;
  player_id: string;
  name: string;
  position?: string | null;
  jersey_number?: number | null;
  overall_rating?: number;
  photo_url?: string | null;
}

export default function EditTeamProfilePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  
  // Form state - Team
  const [teamName, setTeamName] = useState('');
  const [currentLogoUrl, setCurrentLogoUrl] = useState('');
  const [newLogoFile, setNewLogoFile] = useState<File | null>(null);
  const [newLogoPreview, setNewLogoPreview] = useState('');
  
  // Form state - Owner
  const [ownerName, setOwnerName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [ownerDOB, setOwnerDOB] = useState('');
  const [ownerPlace, setOwnerPlace] = useState('');
  const [ownerNationality, setOwnerNationality] = useState('India');
  const [ownerBio, setOwnerBio] = useState('');
  const [ownerInstagram, setOwnerInstagram] = useState('');
  const [ownerTwitter, setOwnerTwitter] = useState('');
  const [ownerPhoto, setOwnerPhoto] = useState<File | null>(null);
  const [ownerPhotoPreview, setOwnerPhotoPreview] = useState('');
  const [currentOwnerPhoto, setCurrentOwnerPhoto] = useState('');
  
  // Form state - Manager
  const [managerMode, setManagerMode] = useState<'player' | 'non-player'>('player');
  const [selectedPlayer, setSelectedPlayer] = useState<RealPlayer | null>(null);
  const [managerName, setManagerName] = useState('');
  const [managerEmail, setManagerEmail] = useState('');
  const [managerPhone, setManagerPhone] = useState('');
  const [managerDOB, setManagerDOB] = useState('');
  const [managerPlace, setManagerPlace] = useState('');
  const [managerNationality, setManagerNationality] = useState('India');
  const [managerJerseyNumber, setManagerJerseyNumber] = useState('');
  const [managerPhoto, setManagerPhoto] = useState<File | null>(null);
  const [managerPhotoPreview, setManagerPhotoPreview] = useState('');
  const [currentManagerPhoto, setCurrentManagerPhoto] = useState('');
  
  // Data
  const [realPlayers, setRealPlayers] = useState<RealPlayer[]>([]);
  const [seasonId, setSeasonId] = useState('');
  const [teamId, setTeamId] = useState('');
  
  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [activeSection, setActiveSection] = useState<'team' | 'owner' | 'manager'>('team');
  
  const keralaDistricts = [
    'Alappuzha', 'Ernakulam', 'Idukki', 'Kannur', 'Kasaragod',
    'Kollam', 'Kottayam', 'Kozhikode', 'Malappuram', 'Palakkad',
    'Pathanamthitta', 'Thiruvananthapuram', 'Thrissur', 'Wayanad'
  ];

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'team') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch active season using the same hook as profile page
  const { data: activeSeasons, isLoading: seasonsLoading } = useCachedSeasons(
    user?.role === 'team' ? { isActive: 'true' } : undefined
  );

  useEffect(() => {
    console.log('🔄 useEffect triggered, user:', user?.uid, 'seasons:', activeSeasons?.length);
    const fetchData = async () => {
      if (!user) {
        console.log('⚠️ No user, skipping fetch');
        return;
      }

      if (!activeSeasons || activeSeasons.length === 0) {
        console.log('⚠️ No active seasons found yet');
        return;
      }

      console.log('✅ User found, fetching data...');
      try {
        const activeSeasonId = activeSeasons[0].id;
        console.log('<Calendar className="w-4 h-4 text-slate-500" /> Active season ID:', activeSeasonId);
        setSeasonId(activeSeasonId);

        // Fetch dashboard data
        console.log('<Search className="w-4 h-4 text-slate-500" /> Fetching dashboard data...');
        const response = await fetch(`/api/team/dashboard?season_id=${activeSeasonId}`);
        const result = await response.json();
        console.log('📦 Full API response:', result);
        const { success, data } = result;

        if (success && data) {
          console.log('✅ Data received successfully');
          console.log('<User className="w-4 h-4 text-slate-500" /> Team data:', data.team);
          console.log('<Trophy className="w-4 h-4 text-amber-500 fill-amber-500" /> Owner data:', data.owner);
          console.log('<SoccerBallIcon className="w-4 h-4" /> Manager data:', data.manager);
          console.log('<Users className="w-4 h-4 text-slate-500" /> Real players data:', data.realPlayers);
          // Team data
          setTeamId(data.team.id);
          setTeamName(data.team.name);
          setCurrentLogoUrl(data.team.logo_url || '');
          console.log('✅ Team state updated:', { teamId: data.team.id, teamName: data.team.name });
          
          // Owner data
          console.log('🔄 Setting owner data...');
          if (data.owner) {
            console.log('✅ Owner data exists:', data.owner);
            setOwnerName(data.owner.name || '');
            setOwnerEmail(data.owner.email || '');
            setOwnerPhone(data.owner.phone || '');
            setOwnerDOB(data.owner.date_of_birth || '');
            setOwnerPlace(data.owner.place || '');
            setOwnerNationality(data.owner.nationality || 'India');
            setOwnerBio(data.owner.bio || '');
            setOwnerInstagram(data.owner.instagram_handle || '');
            setOwnerTwitter(data.owner.twitter_handle || '');
            setCurrentOwnerPhoto(data.owner.photo_url || '');
            console.log('✅ Owner state updated');
          } else {
            console.log('⚠️ No owner data in response');
          }
          
          // Manager data
          console.log('🔄 Setting manager data...');
          if (data.manager) {
            console.log('✅ Manager data exists:', data.manager);
            if (data.manager.is_player) {
              console.log('<User className="w-4 h-4 text-slate-500" /> Manager is a player, searching for player_id:', data.manager.player_id);
              setManagerMode('player');
              // Find the real player in the squad
              const managerPlayer = data.realPlayers?.find((p: any) => p.player_id === data.manager.player_id);
              console.log('<Search className="w-4 h-4 text-slate-500" /> Manager player found:', managerPlayer);
              if (managerPlayer) {
                setSelectedPlayer(managerPlayer);
                console.log('✅ Selected player set:', managerPlayer.name);
              } else {
                console.log('⚠️ Manager player not found in real players squad');
              }
            } else {
              console.log('<UserCheck className="w-4 h-4 text-blue-500" /> Manager is non-playing');
              setManagerMode('non-player');
              setManagerName(data.manager.name || '');
              setManagerEmail(data.manager.email || '');
              setManagerPhone(data.manager.phone || '');
              setManagerDOB(data.manager.date_of_birth || '');
              setManagerPlace(data.manager.place || '');
              setManagerNationality(data.manager.nationality || 'India');
              setManagerJerseyNumber(data.manager.jersey_number?.toString() || '');
              setCurrentManagerPhoto(data.manager.photo_url || '');
              console.log('✅ Non-playing manager state updated');
            }
          } else {
            console.log('⚠️ No manager data in response');
          }
          
          // Real Players list - filter out any players with null/undefined critical fields
          console.log('🔄 Setting real players list...');
          console.log('<Users className="w-4 h-4 text-slate-500" /> Real players count:', data.realPlayers?.length || 0);
          console.log('<Users className="w-4 h-4 text-slate-500" /> Real players data:', data.realPlayers);
          const validPlayers = (data.realPlayers || []).filter((p: any) => 
            p && p.id && p.player_id && p.name
          );
          setRealPlayers(validPlayers);
          console.log('✅ Real players state updated, valid players:', validPlayers.length);
        } else {
          console.log('[ERROR] API returned error:', result.error);
        }
      } catch (error) {
        console.error('[ERROR] Error fetching data:', error);
      }
    };

    fetchData();
  }, [user, activeSeasons]);

  const handleLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    setNewLogoFile(file);
    setNewLogoPreview(URL.createObjectURL(file));
  };

  const handleOwnerPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    setOwnerPhoto(file);
    setOwnerPhotoPreview(URL.createObjectURL(file));
  };

  const handleManagerPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setError('File size must be less than 5MB');
      return;
    }

    setManagerPhoto(file);
    setManagerPhotoPreview(URL.createObjectURL(file));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    // Validation
    if (!teamName.trim()) {
      setError('Team name is required');
      return;
    }

    if (!ownerName.trim()) {
      setError('Owner name is required');
      return;
    }

    if (managerMode === 'non-player' && !managerName.trim()) {
      setError('Manager name is required');
      return;
    }

    if (managerMode === 'player' && !selectedPlayer) {
      setError('Please select a player as manager');
      return;
    }

    try {
      setIsSubmitting(true);

      // Upload team logo if changed
      let logoUrl = currentLogoUrl;
      if (newLogoFile) {
        const result = await uploadImage({
          file: newLogoFile,
          fileName: `team_${teamId}_${Date.now()}_${newLogoFile.name}`,
          folder: '/team-logos',
          tags: ['team', teamId],
          useUniqueFileName: true,
        });
        logoUrl = result.url;
      }

      // Upload owner photo if changed
      let ownerPhotoUrl = currentOwnerPhoto;
      if (ownerPhoto) {
        const result = await uploadImage({
          file: ownerPhoto,
          fileName: `owner_${teamId}_${Date.now()}_${ownerPhoto.name}`,
          folder: '/owner-photos',
          tags: ['owner', teamId],
          useUniqueFileName: true,
        });
        ownerPhotoUrl = result.url;
      }

      // Upload manager photo if changed (non-player only)
      let managerPhotoUrl = currentManagerPhoto;
      if (managerMode === 'non-player' && managerPhoto) {
        const result = await uploadImage({
          file: managerPhoto,
          fileName: `manager_${teamId}_${Date.now()}_${managerPhoto.name}`,
          folder: '/manager-photos',
          tags: ['manager', teamId],
          useUniqueFileName: true,
        });
        managerPhotoUrl = result.url;
      }

      // Prepare manager data
      let managerData;
      if (managerMode === 'player' && selectedPlayer) {
        managerData = {
          name: selectedPlayer.name,
          is_player: true,
          player_id: selectedPlayer.player_id,
          photo_url: null, // Use player's photo
        };
      } else {
        managerData = {
          name: managerName,
          email: managerEmail,
          phone: managerPhone,
          date_of_birth: managerDOB || null,
          place: managerPlace || null,
          nationality: managerNationality,
          jersey_number: managerJerseyNumber ? parseInt(managerJerseyNumber) : null,
          is_player: false,
          player_id: null,
          photo_url: managerPhotoUrl,
        };
      }

      // Call API
      const response = await fetch('/api/team/profile/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          teamName: teamName.trim(),
          logoUrl,
          seasonId,
          owner: {
            name: ownerName,
            email: ownerEmail,
            phone: ownerPhone,
            date_of_birth: ownerDOB || null,
            place: ownerPlace || null,
            nationality: ownerNationality,
            bio: ownerBio || null,
            instagram_handle: ownerInstagram || null,
            twitter_handle: ownerTwitter || null,
            photo_url: ownerPhotoUrl,
          },
          manager: managerData,
        }),
      });

      const result = await response.json();
      console.log('📦 Update response:', result);

      if (!result.success) {
        const errorMessage = result.error || 'Failed to update profile';
        const errorDetails = result.details ? `\n\nDetails: ${result.details}` : '';
        throw new Error(errorMessage + errorDetails);
      }

      setSuccess('Profile updated successfully!');
      setTimeout(() => {
        router.push('/dashboard/team/profile');
      }, 2000);
    } catch (err: any) {
      console.error('<XCircle className="w-4 h-4 text-rose-500" /> Error updating profile:', err);
      console.error('<XCircle className="w-4 h-4 text-rose-500" /> Error stack:', err.stack);
      setError(err.message || 'Failed to update profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading || seasonsLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'team') {
    return null;
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Back Link */}
        <Link
          href="/dashboard/team/profile"
          className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center w-fit mb-4"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Profile
        </Link>

        {/* Header Title Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm font-mono relative overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/10 flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-slate-800">
                  Edit Team Profile
                </h1>
                <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                  Update your team info, owner, and manager details
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Flash Messages */}
        {error && (
          <div className="console-card bg-rose-50/60 border border-rose-200 p-4 rounded-xl flex gap-3 items-center mb-6">
            <span className="text-lg flex-shrink-0">⚠️</span>
            <div>
              <span className="font-extrabold text-rose-800 text-[10px] uppercase tracking-wider block mb-0.5">Error</span>
              <p className="text-xs text-rose-900 leading-relaxed font-semibold">
                {error}
              </p>
            </div>
          </div>
        )}

        {success && (
          <div className="console-card bg-emerald-50/60 border border-emerald-200 p-4 rounded-xl flex gap-3 items-center mb-6">
            <span className="text-lg flex-shrink-0">✅</span>
            <div>
              <span className="font-extrabold text-emerald-800 text-[10px] uppercase tracking-wider block mb-0.5">Success</span>
              <p className="text-xs text-emerald-900 leading-relaxed font-semibold">
                {success}
              </p>
            </div>
          </div>
        )}

        {/* Section Navigation */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-2 shadow-sm mb-6">
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => setActiveSection('team')}
              className={`p-3 rounded-xl font-extrabold uppercase tracking-wider text-xs transition-all cursor-pointer ${
                activeSection === 'team'
                  ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                  : 'bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/30'
              }`}
            >
              Team Info
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('owner')}
              className={`p-3 rounded-xl font-extrabold uppercase tracking-wider text-xs transition-all cursor-pointer ${
                activeSection === 'owner'
                  ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                  : 'bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/30'
              }`}
            >
              Owner
            </button>
            <button
              type="button"
              onClick={() => setActiveSection('manager')}
              className={`p-3 rounded-xl font-extrabold uppercase tracking-wider text-xs transition-all cursor-pointer ${
                activeSection === 'manager'
                  ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                  : 'bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/30'
              }`}
            >
              Manager
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Team Info Section */}
          {activeSection === 'team' && (
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-6 pb-2 border-b border-slate-100">Team Information</h2>
              
              <div className="space-y-6">
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Team Name *</label>
                  <input
                    type="text"
                    value={teamName}
                    onChange={(e) => setTeamName(e.target.value)}
                    className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Team Logo</label>
                  <div className="flex items-center gap-4 mb-4">
                    {(newLogoPreview || currentLogoUrl) && (
                      <div className="w-24 h-24 rounded-xl overflow-hidden border border-slate-200/60 shadow-md relative bg-white flex items-center justify-center p-2">
                        <img
                          src={newLogoPreview || currentLogoUrl}
                          alt="Team logo"
                          className="w-full h-full object-contain"
                        />
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="file"
                      id="logo-upload"
                      accept="image/*"
                      onChange={handleLogoChange}
                      className="hidden"
                    />
                    <label
                      htmlFor="logo-upload"
                      className="inline-flex items-center px-4 py-2 bg-white border border-slate-200/80 rounded-xl cursor-pointer hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold shadow-sm"
                    >
                      <svg className="w-5 h-5 mr-2 text-slate-655" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs font-extrabold uppercase tracking-wider">Choose Logo</span>
                    </label>
                  </div>
                  <p className="text-[9px] text-slate-400 font-bold uppercase mt-2">Max size: 5MB</p>
                </div>
              </div>
            </div>
          )}

          {/* Owner Section */}
          {activeSection === 'owner' && (
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm">
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-6 pb-2 border-b border-slate-100">Owner Information</h2>
              
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Name *</label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email *</label>
                  <input
                    type="email"
                    value={ownerEmail}
                    onChange={(e) => setOwnerEmail(e.target.value)}
                    className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Phone *</label>
                  <input
                    type="tel"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Date of Birth</label>
                  <input
                    type="date"
                    value={ownerDOB}
                    onChange={(e) => setOwnerDOB(e.target.value)}
                    className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Place</label>
                  <select
                    value={ownerPlace}
                    onChange={(e) => setOwnerPlace(e.target.value)}
                    className="w-full py-2.5 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono cursor-pointer"
                  >
                    <option value="">Select District</option>
                    {keralaDistricts.map(district => (
                      <option key={district} value={district}>{district}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Nationality</label>
                  <input
                    type="text"
                    value={ownerNationality}
                    onChange={(e) => setOwnerNationality(e.target.value)}
                    className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Bio</label>
                  <textarea
                    value={ownerBio}
                    onChange={(e) => setOwnerBio(e.target.value)}
                    rows={3}
                    className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Instagram Handle</label>
                  <input
                    type="text"
                    value={ownerInstagram}
                    onChange={(e) => setOwnerInstagram(e.target.value)}
                    placeholder="@username"
                    className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Twitter Handle</label>
                  <input
                    type="text"
                    value={ownerTwitter}
                    onChange={(e) => setOwnerTwitter(e.target.value)}
                    placeholder="@username"
                    className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Photo</label>
                  <div className="flex items-center gap-4 mb-4">
                    {(ownerPhotoPreview || currentOwnerPhoto) && (
                      <div className="w-24 h-24 rounded-xl overflow-hidden border border-slate-200/60 shadow-md relative bg-white flex items-center justify-center p-1">
                        <img
                          src={ownerPhotoPreview || currentOwnerPhoto}
                          alt="Owner"
                          className="w-full h-full object-cover rounded-lg"
                        />
                      </div>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type="file"
                      id="owner-photo-upload"
                      accept="image/*"
                      onChange={handleOwnerPhotoChange}
                      className="hidden"
                    />
                    <label
                      htmlFor="owner-photo-upload"
                      className="inline-flex items-center px-4 py-2 bg-white border border-slate-200/80 rounded-xl cursor-pointer hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold shadow-sm"
                    >
                      <svg className="w-5 h-5 mr-2 text-slate-655" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span className="text-xs font-extrabold uppercase tracking-wider">Choose Photo</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Manager Section */}
          {activeSection === 'manager' && (
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm mb-6">
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-6 pb-2 border-b border-slate-100">Manager Information</h2>
              
              {/* Manager Type Selection */}
              <div className="mb-6">
                <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Manager Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setManagerMode('player')}
                    className={`p-3 rounded-xl font-extrabold uppercase tracking-wider text-xs transition-all cursor-pointer ${
                      managerMode === 'player'
                        ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                        : 'bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/30'
                    }`}
                  >
                    Playing Manager
                  </button>
                  <button
                    type="button"
                    onClick={() => setManagerMode('non-player')}
                    className={`p-3 rounded-xl font-extrabold uppercase tracking-wider text-xs transition-all cursor-pointer ${
                      managerMode === 'non-player'
                        ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                        : 'bg-slate-50 text-slate-500 hover:text-slate-800 hover:bg-slate-100 border border-slate-200/30'
                    }`}
                  >
                    Non-Playing Manager
                  </button>
                </div>
              </div>

              {managerMode === 'player' ? (
                <div>
                  <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-3">Select Player *</label>
                  
                  {selectedPlayer && (
                    <div className="mb-6 p-4 bg-amber-50/40 border border-amber-200/60 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <span className="font-extrabold text-amber-800 text-[9px] uppercase tracking-wider block mb-1">Current Selected Manager</span>
                        <p className="text-sm font-black text-slate-850 uppercase tracking-wider">{selectedPlayer.name || 'Unknown'}</p>
                        <p className="text-[10px] text-slate-500 uppercase mt-0.5 font-bold">
                          {selectedPlayer.position || 'Player'} • <span className="text-amber-600">{selectedPlayer.overall_rating || 0} OVR</span>
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedPlayer(null)}
                        className="px-4 py-2 bg-rose-50 text-rose-600 border border-rose-200 rounded-xl hover:bg-rose-100/60 hover:text-rose-700 transition-all font-mono text-xs uppercase tracking-wider font-extrabold cursor-pointer"
                      >
                        Change Manager
                      </button>
                    </div>
                  )}
                  
                  {!selectedPlayer && (
                    <div>
                      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {realPlayers.map(player => (
                          <button
                            key={player.id}
                            type="button"
                            onClick={() => setSelectedPlayer(player)}
                            className="p-4 rounded-xl border border-slate-200 bg-white text-left transition-all hover:border-amber-400 hover:shadow-md cursor-pointer flex items-center justify-between group"
                          >
                            <div>
                              <div className="text-xs font-black text-slate-800 uppercase tracking-wider group-hover:text-amber-600 transition-colors">{player.name || 'Unknown'}</div>
                              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mt-1">{player.position || 'Player'}</div>
                            </div>
                            {player.overall_rating && (
                              <div className="w-8 h-8 rounded-lg bg-slate-800 text-amber-400 flex items-center justify-center font-black text-xs border border-slate-900">
                                {player.overall_rating}
                              </div>
                            )}
                          </button>
                        ))}
                      </div>
                      {realPlayers.length === 0 && (
                        <div className="text-center py-8 border border-dashed border-slate-200 rounded-xl">
                          <p className="text-slate-400 text-xs font-bold uppercase tracking-wider leading-relaxed">No real players in squad yet.</p>
                          <p className="text-[10px] text-slate-400 uppercase mt-1">Add real players first before selecting a playing manager.</p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Name *</label>
                    <input
                      type="text"
                      value={managerName}
                      onChange={(e) => setManagerName(e.target.value)}
                      className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                      required={managerMode === 'non-player'}
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Email</label>
                    <input
                      type="email"
                      value={managerEmail}
                      onChange={(e) => setManagerEmail(e.target.value)}
                      className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Phone</label>
                    <input
                      type="tel"
                      value={managerPhone}
                      onChange={(e) => setManagerPhone(e.target.value)}
                      className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Date of Birth</label>
                    <input
                      type="date"
                      value={managerDOB}
                      onChange={(e) => setManagerDOB(e.target.value)}
                      className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Place</label>
                    <select
                      value={managerPlace}
                      onChange={(e) => setManagerPlace(e.target.value)}
                      className="w-full py-2.5 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono cursor-pointer"
                    >
                      <option value="">Select District</option>
                      {keralaDistricts.map(district => (
                        <option key={district} value={district}>{district}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Nationality</label>
                    <input
                      type="text"
                      value={managerNationality}
                      onChange={(e) => setManagerNationality(e.target.value)}
                      className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                    />
                  </div>

                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Jersey Number</label>
                    <input
                      type="number"
                      value={managerJerseyNumber}
                      onChange={(e) => setManagerJerseyNumber(e.target.value)}
                      className="w-full py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">Photo</label>
                    <div className="flex items-center gap-4 mb-4">
                      {(managerPhotoPreview || currentManagerPhoto) && (
                        <div className="w-24 h-24 rounded-xl overflow-hidden border border-slate-200/60 shadow-md relative bg-white flex items-center justify-center p-1">
                          <img
                            src={managerPhotoPreview || currentManagerPhoto}
                            alt="Manager"
                            className="w-full h-full object-cover rounded-lg"
                          />
                        </div>
                      )}
                    </div>
                    <div className="relative">
                      <input
                        type="file"
                        id="manager-photo-upload"
                        accept="image/*"
                        onChange={handleManagerPhotoChange}
                        className="hidden"
                      />
                      <label
                        htmlFor="manager-photo-upload"
                        className="inline-flex items-center px-4 py-2 bg-white border border-slate-200/80 rounded-xl cursor-pointer hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold shadow-sm"
                      >
                        <svg className="w-5 h-5 mr-2 text-slate-655" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                        <span className="text-xs font-extrabold uppercase tracking-wider">Choose Photo</span>
                      </label>
                    </div>
                    <p className="text-[9px] text-slate-400 font-bold uppercase mt-2">Max size: 5MB</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 sm:p-5 shadow-sm flex justify-between items-center gap-4">
            <Link
              href="/dashboard/team/profile"
              className="px-5 py-2.5 bg-white border border-slate-200 rounded-xl hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold text-center shadow-sm"
            >
              Cancel
            </Link>
            
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-slate-800 text-amber-400 border border-slate-900 rounded-xl hover:bg-slate-700 hover:shadow-md transition-all font-mono text-xs uppercase tracking-wider font-extrabold disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer shadow-sm"
            >
              {isSubmitting ? 'Updating...' : 'Update Profile'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
