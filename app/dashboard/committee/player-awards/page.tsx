'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import Link from 'next/link';
import { 
  Award, 
  ArrowLeft, 
  Trophy, 
  Cpu, 
  Plus, 
  X, 
  Trash2, 
  Calendar, 
  Users, 
  Eye, 
  Sparkles, 
  AlertTriangle, 
  Check, 
  Info,
  ChevronDown
} from 'lucide-react';

interface PlayerAward {
  id: number;
  player_id: string;
  player_name: string;
  season_id: string;
  tournament_id?: string;
  award_category: string; // 'individual' or 'category'
  award_type: string;
  award_position: string | null;
  player_category: string | null; // For category awards
  awarded_by: string;
  notes: string | null;
  created_at: string;
}

interface Player {
  player_id: string;
  player_name: string;
  category: string;
}

interface Tournament {
  id: string;
  tournament_name: string;
  tournament_type: string;
  status: string;
}

interface AwardPreview {
  award_type: string;
  player_id: string;
  player_name: string;
  stats: any;
}

export default function PlayerAwardsManagementPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { isCommitteeAdmin, userSeasonId } = usePermissions();
  
  const [awards, setAwards] = useState<PlayerAward[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [awarding, setAwarding] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<'all' | 'individual' | 'category'>('all');
  const [preview, setPreview] = useState<AwardPreview[]>([]);
  
  // Selected award types
  const [selectedAwards, setSelectedAwards] = useState({
    'Golden Boot': true,
    'Golden Glove': true,
    'Golden Ball': true,
    'Manager of Season': true,
    'Best Attacker': true,
    'Best Midfielder': true,
    'Best Defender': true,
    'Best Goalkeeper': true,
  });
  
  // New award form
  const [newAward, setNewAward] = useState({
    player_id: '',
    player_name: '',
    award_category: 'individual' as 'individual' | 'category',
    award_type: '',
    award_position: '',
    player_category: '',
    notes: ''
  });

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
    if (!authLoading && user && !isCommitteeAdmin) {
      router.push('/dashboard');
    }
  }, [user, authLoading, router, isCommitteeAdmin]);

  // Load data when season is set
  useEffect(() => {
    if (userSeasonId) {
      fetchAwards();
      fetchPlayers();
      fetchTournaments();
    }
  }, [userSeasonId, filterCategory]);

  const fetchTournaments = async () => {
    if (!userSeasonId) return;
    
    try {
      const res = await fetchWithTokenRefresh(`/api/tournaments?season_id=${userSeasonId}`);
      const data = await res.json();
      if (data.success) {
        setTournaments(data.tournaments || []);
        // Auto-select first tournament
        if (data.tournaments && data.tournaments.length > 0) {
          setSelectedTournament(data.tournaments[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching tournaments:', err);
    }
  };

  const fetchAwards = async () => {
    if (!userSeasonId) return;
    
    setLoading(true);
    try {
      const url = filterCategory === 'all' 
        ? `/api/player-awards?season_id=${userSeasonId}`
        : `/api/player-awards?season_id=${userSeasonId}&award_category=${filterCategory}`;
      
      const res = await fetchWithTokenRefresh(url);
      const data = await res.json();
      if (data.success) {
        setAwards(data.awards || []);
      }
    } catch (err) {
      console.error('Error fetching awards:', err);
      setError('Failed to load awards');
    } finally {
      setLoading(false);
    }
  };

  const fetchPlayers = async () => {
    if (!userSeasonId) return;
    
    try {
      const res = await fetchWithTokenRefresh(`/api/stats/real-players?season_id=${userSeasonId}`);
      const data = await res.json();
      if (data.success && data.players) {
        setPlayers(data.players);
      }
    } catch (err) {
      console.error('Error fetching players:', err);
    }
  };

  const handlePreviewAwards = async () => {
    if (!userSeasonId || !selectedTournament) {
      setError('Please select a tournament');
      return;
    }
    
    setPreviewing(true);
    setError(null);
    setPreview([]);
    
    try {
      const selectedAwardTypes = Object.entries(selectedAwards)
        .filter(([_, selected]) => selected)
        .map(([type, _]) => type);
      
      if (selectedAwardTypes.length === 0) {
        setError('Please select at least one award type');
        setPreviewing(false);
        return;
      }
      
      const res = await fetchWithTokenRefresh('/api/player-awards/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          season_id: userSeasonId,
          tournament_id: selectedTournament,
          award_types: selectedAwardTypes
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setPreview(data.preview || []);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to preview awards');
    } finally {
      setPreviewing(false);
    }
  };

  const handleAutoAward = async () => {
    if (!userSeasonId || !selectedTournament) {
      setError('Please select a tournament');
      return;
    }
    
    const selectedAwardTypes = Object.entries(selectedAwards)
      .filter(([_, selected]) => selected)
      .map(([type, _]) => type);
    
    if (selectedAwardTypes.length === 0) {
      setError('Please select at least one award type');
      return;
    }
    
    if (!confirm(`This will award ${selectedAwardTypes.length} player awards for the selected tournament. Continue?`)) return;
    
    setAwarding(true);
    setError(null);
    setSuccess(null);
    
    try {
      const res = await fetchWithTokenRefresh('/api/player-awards/auto-award', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          season_id: userSeasonId,
          tournament_id: selectedTournament,
          award_types: selectedAwardTypes
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setSuccess(`Awarded ${data.awardsGiven} player awards!`);
        setPreview([]);
        fetchAwards();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to auto-award');
    } finally {
      setAwarding(false);
    }
  };

  const handleDeleteAward = async (awardId: number) => {
    if (!confirm('Delete this award?')) return;
    
    setError(null);
    setSuccess(null);
    
    try {
      const res = await fetchWithTokenRefresh(`/api/player-awards/${awardId}`, {
        method: 'DELETE'
      });
      
      const data = await res.json();
      if (data.success) {
        setSuccess('Award deleted successfully');
        fetchAwards();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to delete award');
    }
  };

  const handleAddAward = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userSeasonId || !newAward.player_id || !newAward.award_type || !newAward.award_position) {
      setError('Please fill all required fields');
      return;
    }
    
    // Validate category award requirements
    if (newAward.award_category === 'category' && !newAward.player_category) {
      setError('Player category is required for category awards');
      return;
    }
    
    setError(null);
    setSuccess(null);
    
    try {
      const res = await fetchWithTokenRefresh('/api/player-awards/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          season_id: userSeasonId,
          player_id: newAward.player_id,
          player_name: newAward.player_name,
          award_category: newAward.award_category,
          award_type: newAward.award_type,
          award_position: newAward.award_position,
          player_category: newAward.award_category === 'category' ? newAward.player_category : null,
          notes: newAward.notes
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setSuccess('Award added successfully!');
        setShowAddForm(false);
        setNewAward({
          player_id: '',
          player_name: '',
          award_category: 'individual',
          award_type: '',
          award_position: '',
          player_category: '',
          notes: ''
        });
        fetchAwards();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to add award');
    }
  };

  const handlePlayerSelect = (playerId: string) => {
    const player = players.find(p => p.player_id === playerId);
    if (player) {
      setNewAward({
        ...newAward,
        player_id: playerId,
        player_name: player.player_name,
        player_category: player.category
      });
    }
  };

  const getAwardIcon = (category: string) => {
    return category === 'individual' 
      ? <Trophy className="w-4 h-4 text-amber-500" />
      : <Award className="w-4 h-4 text-indigo-500" />;
  };

  const getAwardBadgeColor = (category: string) => {
    return category === 'individual' 
      ? 'from-amber-500 to-orange-500 border border-orange-600/35'
      : 'from-violet-500 to-indigo-500 border border-indigo-600/35';
  };

  if (authLoading || !user || !isCommitteeAdmin) {
    return (
      <div className="min-h-screen console-bg flex items-center justify-center font-mono">
        <div className="flex flex-col items-center gap-3">
          <div className="animate-spin rounded-full h-10 w-10 border-2 border-amber-500 border-t-transparent"></div>
          <span className="text-xs text-slate-400 uppercase tracking-widest font-bold">Booting Console...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Ambient Gold Glow Overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="container mx-auto max-w-7xl relative z-10">
        {/* Back Link */}
        <div className="mb-4">
          <Link
            href="/dashboard/committee"
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200/60 text-slate-500 hover:text-slate-800 rounded-xl text-xs font-extrabold uppercase tracking-wider tracking-wider transition-all shadow-sm cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Admin
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-slate-800 border border-slate-900 rounded-xl shadow-md">
              <Award className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <h1 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
                Player Awards Management
              </h1>
              <p className="text-[10px] text-slate-405 text-slate-400 font-bold uppercase mt-0.5">
                Award and manage player achievements for the season
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-center bg-slate-55 bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/40">
            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Active Season:</span>
            <span className="text-xs font-extrabold text-amber-500">{userSeasonId}</span>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mb-4 p-4 border border-rose-200 bg-rose-50/50 text-rose-800 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-sm">
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}
        
        {success && (
          <div className="mb-4 p-4 border border-emerald-200 bg-emerald-50/50 text-emerald-800 rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 shadow-sm">
            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        {/* Auto-Award Section */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm mb-6">
          <div className="flex items-center gap-3 mb-5 pb-3 border-b border-slate-100">
            <div className="p-2 bg-slate-50 border border-slate-200/40 rounded-xl">
              <Cpu className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Auto-Award Player Awards</h2>
              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Based on tournament statistics</p>
            </div>
          </div>
          
          {/* Tournament Selector */}
          <div className="mb-5">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Select Tournament *</label>
            <div className="relative">
              <select
                value={selectedTournament}
                onChange={(e) => setSelectedTournament(e.target.value)}
                className="w-full py-2.5 pl-4 pr-10 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-805 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold cursor-pointer appearance-none"
              >
                <option value="">-- SELECT TOURNAMENT --</option>
                {tournaments.map((tournament) => (
                  <option key={tournament.id} value={tournament.id}>
                    {tournament.tournament_name.toUpperCase()} ({tournament.status.toUpperCase()})
                  </option>
                ))}
              </select>
              <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                <ChevronDown className="w-4 h-4" />
              </div>
            </div>
          </div>
          
          {/* Award Type Selection */}
          <div className="bg-slate-50/50 border border-slate-200/40 p-4 rounded-xl mb-4 font-mono">
            <h3 className="text-xs font-extrabold text-slate-850 uppercase tracking-wider mb-3">Select Awards to Give:</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-extrabold text-purple-600 uppercase tracking-wider mb-2">Individual Awards:</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-955 select-none">
                    <input
                      type="checkbox"
                      checked={selectedAwards['Golden Boot']}
                      onChange={(e) => setSelectedAwards({...selectedAwards, 'Golden Boot': e.target.checked})}
                      className="w-4 h-4 accent-amber-500 rounded border-slate-300 text-slate-800 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span>Golden Boot (Top Scorer)</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-955 select-none">
                    <input
                      type="checkbox"
                      checked={selectedAwards['Golden Glove']}
                      onChange={(e) => setSelectedAwards({...selectedAwards, 'Golden Glove': e.target.checked})}
                      className="w-4 h-4 accent-amber-500 rounded border-slate-300 text-slate-800 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span>Golden Glove (Best Goalkeeper)</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-955 select-none">
                    <input
                      type="checkbox"
                      checked={selectedAwards['Golden Ball']}
                      onChange={(e) => setSelectedAwards({...selectedAwards, 'Golden Ball': e.target.checked})}
                      className="w-4 h-4 accent-amber-500 rounded border-slate-300 text-slate-800 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span>Golden Ball (Best Player)</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-955 select-none">
                    <input
                      type="checkbox"
                      checked={selectedAwards['Manager of Season']}
                      onChange={(e) => setSelectedAwards({...selectedAwards, 'Manager of Season': e.target.checked})}
                      className="w-4 h-4 accent-amber-500 rounded border-slate-300 text-slate-800 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span>Manager of Season</span>
                  </label>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider mb-2">Category Awards:</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-955 select-none">
                    <input
                      type="checkbox"
                      checked={selectedAwards['Best Attacker']}
                      onChange={(e) => setSelectedAwards({...selectedAwards, 'Best Attacker': e.target.checked})}
                      className="w-4 h-4 accent-amber-500 rounded border-slate-300 text-slate-800 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span>Best Attacker</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-955 select-none">
                    <input
                      type="checkbox"
                      checked={selectedAwards['Best Midfielder']}
                      onChange={(e) => setSelectedAwards({...selectedAwards, 'Best Midfielder': e.target.checked})}
                      className="w-4 h-4 accent-amber-500 rounded border-slate-300 text-slate-800 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span>Best Midfielder</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-955 select-none">
                    <input
                      type="checkbox"
                      checked={selectedAwards['Best Defender']}
                      onChange={(e) => setSelectedAwards({...selectedAwards, 'Best Defender': e.target.checked})}
                      className="w-4 h-4 accent-amber-505 rounded border-slate-300 text-slate-800 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span>Best Defender</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-955 select-none">
                    <input
                      type="checkbox"
                      checked={selectedAwards['Best Goalkeeper']}
                      onChange={(e) => setSelectedAwards({...selectedAwards, 'Best Goalkeeper': e.target.checked})}
                      className="w-4 h-4 accent-amber-505 rounded border-slate-300 text-slate-800 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span>Best Goalkeeper</span>
                  </label>
                </div>
              </div>
            </div>
          </div>
          
          {/* Preview Section */}
          {preview.length > 0 && (
            <div className="bg-amber-50/50 p-4 rounded-xl mb-4 border border-amber-200">
              <h3 className="text-xs font-extrabold text-amber-800 mb-3 flex items-center gap-1.5 uppercase tracking-wider">
                <Eye className="w-4 h-4 text-amber-600" />
                Award Winners Preview:
              </h3>
              <div className="space-y-2">
                {preview.map((award, idx) => (
                  <div key={idx} className="bg-white p-3 rounded-lg border border-slate-200/40 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-extrabold text-slate-800">{award.award_type}</span>
                      <span className="mx-2 text-slate-400">→</span>
                      <span className="text-amber-500 font-extrabold">{award.player_name}</span>
                    </div>
                    <div className="text-[10px] text-slate-500 font-bold uppercase">
                      {award.stats && Object.entries(award.stats).map(([key, value]) => (
                        <span key={key} className="ml-2">{key.replace('_', ' ')}: {value as string}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <button
              onClick={handlePreviewAwards}
              disabled={previewing || !selectedTournament}
              className="py-2.5 bg-slate-800 hover:bg-slate-900 border border-slate-950 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-md cursor-pointer"
            >
              <Eye className="w-4 h-4 text-amber-500" />
              {previewing ? 'Loading Preview...' : 'Preview Winners'}
            </button>
            <button
              onClick={handleAutoAward}
              disabled={awarding || !selectedTournament || preview.length === 0}
              className="py-2.5 bg-slate-800 text-amber-400 border border-slate-900 hover:bg-slate-900 font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-md cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-amber-500" />
              {awarding ? 'Awarding...' : 'Award Selected'}
            </button>
          </div>
        </div>

        {/* Awards List */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-50 border border-slate-200/40 rounded-xl">
                <Trophy className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                  Player Awards ({awards.length})
                </h2>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">List of all given awards</p>
              </div>
            </div>
            
            {/* Filter and Add Button */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative font-mono">
                <select
                  value={filterCategory}
                  onChange={(e) => setFilterCategory(e.target.value as any)}
                  className="py-1.5 pl-3 pr-8 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none transition-all font-bold cursor-pointer appearance-none"
                >
                  <option value="all">ALL AWARDS</option>
                  <option value="individual">INDIVIDUAL ONLY</option>
                  <option value="category">CATEGORY ONLY</option>
                </select>
                <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <ChevronDown className="w-3.5 h-3.5" />
                </div>
              </div>
            
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className={`px-4 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold transition-all border shadow-sm cursor-pointer flex items-center gap-1.5 ${
                showAddForm
                  ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                  : 'bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 border border-slate-200/60'
              }`}
            >
              {showAddForm ? (
                <>
                  <X className="w-4 h-4" />
                  Cancel
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 text-emerald-500" />
                  Add Award
                </>
              )}
            </button>
          </div>
        </div>

        {/* Add Award Form */}
          {showAddForm && (
            <form onSubmit={handleAddAward} className="mb-6 p-5 bg-slate-50/50 border border-slate-200/60 rounded-2xl shadow-inner font-mono">
              <div className="flex items-center gap-2 mb-4 pb-2 border-b border-slate-100">
                <Plus className="w-4.5 h-4.5 text-emerald-500" />
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Add New Award</h3>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Player Select */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Player *</label>
                  <div className="relative">
                    <select
                      value={newAward.player_id}
                      onChange={(e) => handlePlayerSelect(e.target.value)}
                      className="w-full py-2.5 pl-4 pr-10 bg-white border border-slate-200/60 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold cursor-pointer appearance-none"
                      required
                    >
                      <option value="">-- SELECT PLAYER --</option>
                      {players.map((player) => (
                        <option key={player.player_id} value={player.player_id}>
                          {player.player_name.toUpperCase()} ({player.category.toUpperCase()})
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>
                
                {/* Award Category */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Award Category *</label>
                  <div className="relative">
                    <select
                      value={newAward.award_category}
                      onChange={(e) => setNewAward({ ...newAward, award_category: e.target.value as any })}
                      className="w-full py-2.5 pl-4 pr-10 bg-white border border-slate-200/60 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold cursor-pointer appearance-none"
                    >
                      <option value="individual">INDIVIDUAL (SEASON-WIDE)</option>
                      <option value="category">CATEGORY (POSITION-SPECIFIC)</option>
                    </select>
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>
                
                {/* Award Type */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Award Type *</label>
                  <div className="relative">
                    <select
                      value={newAward.award_type}
                      onChange={(e) => setNewAward({ ...newAward, award_type: e.target.value })}
                      className="w-full py-2.5 pl-4 pr-10 bg-white border border-slate-200/60 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold cursor-pointer appearance-none"
                      required
                    >
                      <option value="">-- SELECT AWARD TYPE --</option>
                      {newAward.award_category === 'individual' ? (
                        <>
                          <option value="Golden Boot">GOLDEN BOOT</option>
                          <option value="Most Assists">MOST ASSISTS</option>
                          <option value="Most Clean Sheets">MOST CLEAN SHEETS</option>
                          <option value="Player of the Season">PLAYER OF THE SEASON</option>
                        </>
                      ) : (
                        <>
                          <option value="Best Attacker">BEST ATTACKER</option>
                          <option value="Best Midfielder">BEST MIDFIELDER</option>
                          <option value="Best Defender">BEST DEFENDER</option>
                          <option value="Best Goalkeeper">BEST GOAKEEPER</option>
                        </>
                      )}
                    </select>
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>
                
                {/* Position */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Position *</label>
                  <div className="relative">
                    <select
                      value={newAward.award_position}
                      onChange={(e) => setNewAward({ ...newAward, award_position: e.target.value })}
                      className="w-full py-2.5 pl-4 pr-10 bg-white border border-slate-200/60 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold cursor-pointer appearance-none"
                      required
                    >
                      <option value="">-- SELECT POSITION --</option>
                      <option value="Winner">WINNER</option>
                      <option value="Runner Up">RUNNER UP</option>
                      <option value="Third Place">THIRD PLACE</option>
                    </select>
                    <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                      <ChevronDown className="w-4 h-4" />
                    </div>
                  </div>
                </div>
                
                {/* Notes */}
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Notes (Optional)</label>
                  <input
                    type="text"
                    value={newAward.notes}
                    onChange={(e) => setNewAward({ ...newAward, notes: e.target.value })}
                    className="w-full py-2.5 px-4 bg-white border border-slate-200/60 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold font-mono"
                    placeholder="ENTER ADDITIONAL INFO"
                  />
                </div>
              </div>
              
              <button
                type="submit"
                className="w-full mt-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-white/90" />
                Add Award
              </button>
            </form>
          )}

          {/* Awards List */}
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-amber-500 border-t-transparent mx-auto"></div>
            </div>
          ) : awards.length === 0 ? (
            <div className="text-center py-8 text-slate-400 font-mono">
              <p className="text-xs uppercase tracking-wider font-extrabold">No player awards yet</p>
              <p className="text-[10px] uppercase font-bold mt-1">Use auto-award or add manually</p>
            </div>
          ) : (
            <div className="space-y-3 font-mono">
              {awards.map((award) => (
                <div key={award.id} className="console-card bg-white border border-slate-100 hover:border-slate-200/80 rounded-xl p-4 shadow-sm hover:shadow-md transition-all">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-2.5 mb-2">
                        <div className="p-1.5 bg-slate-50 border border-slate-200/40 rounded-lg">
                          {getAwardIcon(award.award_category)}
                        </div>
                        <div className={`px-2 py-0.5 rounded-md text-[9px] font-extrabold text-white bg-gradient-to-r ${getAwardBadgeColor(award.award_category)}`}>
                          {award.award_category.toUpperCase()}
                        </div>
                        <span className="font-extrabold text-slate-805 text-xs sm:text-sm uppercase tracking-wider">
                          {award.award_type} {award.award_position && `• ${award.award_position}`}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[10px] text-slate-500 font-bold uppercase ml-0 sm:ml-9">
                        <span>Player: <strong className="text-slate-800">{award.player_name}</strong></span>
                        <span>•</span>
                        <span>By: {award.awarded_by}</span>
                        {award.player_category && (
                          <>
                            <span>•</span>
                            <span>Category: {award.player_category}</span>
                          </>
                        )}
                      </div>
                      {award.notes && (
                        <p className="text-[10px] text-slate-400 font-medium italic mt-1.5 ml-0 sm:ml-9">{award.notes}</p>
                      )}
                    </div>
                    <button
                      onClick={() => handleDeleteAward(award.id)}
                      className="px-3.5 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all self-end sm:self-center cursor-pointer shadow-sm"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
