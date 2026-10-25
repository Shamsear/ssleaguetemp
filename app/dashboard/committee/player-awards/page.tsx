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
  ChevronDown,
  Edit3,
  Save,
  UserCheck
} from 'lucide-react';
import AuthGuard from '@/components/auth/AuthGuard';

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
  performance_stats?: any;
}

interface Player {
  player_id: string;
  player_name: string;
  category: string;
  team?: string;
}

interface Manager {
  manager_id: string;
  name: string;
  team_id: string;
}

interface Tournament {
  id: string;
  tournament_name: string;
  tournament_type: string;
  status: string;
}

interface AwardPreview {
  award_type: string;
  award_category?: 'individual' | 'category';
  award_position?: string;
  player_id: string;
  player_name: string;
  player_category?: string | null;
  notes?: string;
  stats?: any;
}

export default function PlayerAwardsManagementPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { isCommitteeAdmin, userSeasonId } = usePermissions();
  
  const [awards, setAwards] = useState<PlayerAward[]>([]);
  const [players, setPlayers] = useState<Player[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [seasonCategories, setSeasonCategories] = useState<string[]>(['RED', 'BLACK', 'BLUE', 'WHITE']);
  const [tournaments, setTournaments] = useState<Tournament[]>([]);
  const [selectedTournament, setSelectedTournament] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [awarding, setAwarding] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingAward, setEditingAward] = useState<PlayerAward | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [filterCategory, setFilterCategory] = useState<'all' | 'individual' | 'category'>('all');
  const [preview, setPreview] = useState<AwardPreview[]>([]);
  
  // Selected award types
  const [selectedAwards, setSelectedAwards] = useState<Record<string, boolean>>({
    'Golden Boot': true,
    'Golden Glove': true,
    'Golden Ball': true,
    'Manager of Season': true,
    'Best RED': true,
    'Best BLACK': true,
    'Best BLUE': true,
    'Best WHITE': true,
  });
  
  // New award form
  const [newAward, setNewAward] = useState({
    player_id: '',
    player_name: '',
    award_category: 'individual' as 'individual' | 'category',
    award_type: '',
    award_position: 'Winner',
    player_category: '',
    notes: ''
  });

  useEffect(() => {
    if (userSeasonId) {
      fetchAwards();
      fetchPlayers();
      fetchManagers();
      fetchTournaments();
      fetchSeasonCategories();
    }
  }, [userSeasonId, filterCategory]);

  const fetchSeasonCategories = async () => {
    if (!userSeasonId) return;
    try {
      const res = await fetchWithTokenRefresh(`/api/categories`);
      const data = await res.json();
      if (data.success && Array.isArray(data.data) && data.data.length > 0) {
        const catNames = data.data.map((c: any) => c.name.toUpperCase());
        setSeasonCategories(prev => {
          const combined = Array.from(new Set([...catNames, ...prev]));
          return combined;
        });
        // initialize checkbox state for categories
        setSelectedAwards(prev => {
          const next = { ...prev };
          catNames.forEach((name: string) => {
            const key = `Best ${name}`;
            if (next[key] === undefined) {
              next[key] = true;
            }
          });
          return next;
        });
      }
    } catch (err) {
      console.warn('Could not fetch categories API, using defaults:', err);
    }
  };

  const fetchTournaments = async () => {
    if (!userSeasonId) return;
    try {
      const res = await fetchWithTokenRefresh(`/api/tournaments?season_id=${userSeasonId}`);
      const data = await res.json();
      if (data.success) {
        setTournaments(data.tournaments || []);
        if (data.tournaments && data.tournaments.length > 0) {
          setSelectedTournament(data.tournaments[0].id);
        }
      }
    } catch (err: any) {
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
    } catch (err: any) {
      console.error('Error fetching awards:', err);
      setError('Failed to load awards');
    } finally {
      setLoading(false);
    }
  };

  const fetchPlayers = async () => {
    if (!userSeasonId) return;
    try {
      const res = await fetchWithTokenRefresh(`/api/realplayers/season-players?seasonId=${userSeasonId}`);
      const data = await res.json();
      const playerList: Player[] = data.players || data.data || [];
      if (playerList.length > 0) {
        setPlayers(playerList);
        // Extract distinct categories from players
        const cats = Array.from(
          new Set(
            playerList
              .map((p: any) => p.category?.toUpperCase())
              .filter(Boolean)
          )
        ) as string[];
        if (cats.length > 0) {
          setSeasonCategories(cats);
          setSelectedAwards(prev => {
            const next = { ...prev };
            cats.forEach(c => {
              const k = `Best ${c}`;
              if (next[k] === undefined) next[k] = true;
            });
            return next;
          });
        }
      }
    } catch (err: any) {
      console.error('Error fetching players:', err);
    }
  };

  const fetchManagers = async () => {
    if (!userSeasonId) return;
    try {
      const res = await fetchWithTokenRefresh(`/api/managers?seasonId=${userSeasonId}`);
      const data = await res.json();
      if (data.success && data.data) {
        setManagers(data.data);
      }
    } catch (err: any) {
      console.error('Error fetching managers:', err);
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
        // Map preview items with default positions and categories
        const mappedPreview: AwardPreview[] = (data.preview || []).map((item: any) => ({
          ...item,
          award_position: item.award_position || 'Winner',
          award_category: item.award_category || (item.player_category ? 'category' : 'individual'),
          notes: item.notes || `Auto-awarded for ${item.award_type}`
        }));
        setPreview(mappedPreview);
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError('Failed to preview awards');
    } finally {
      setPreviewing(false);
    }
  };

  // Allow admin to change the winner/recipient of any previewed award
  const handleUpdatePreviewRecipient = (index: number, newPlayerId: string) => {
    const updated = [...preview];
    const target = updated[index];
    if (!target) return;

    if (target.award_type === 'Manager of Season') {
      const mgr = managers.find(m => m.team_id === newPlayerId || m.manager_id === newPlayerId);
      if (mgr) {
        updated[index] = {
          ...target,
          player_id: mgr.team_id,
          player_name: mgr.name,
          notes: `Manager of the Season (${mgr.name})`
        };
      } else {
        const pl = players.find(p => p.player_id === newPlayerId);
        updated[index] = {
          ...target,
          player_id: newPlayerId,
          player_name: pl ? pl.player_name : newPlayerId,
        };
      }
    } else {
      const player = players.find(p => p.player_id === newPlayerId);
      if (player) {
        updated[index] = {
          ...target,
          player_id: player.player_id,
          player_name: player.player_name,
          player_category: target.award_category === 'category' 
            ? (target.player_category || player.category) 
            : (player.category || target.player_category)
        };
      }
    }
    setPreview(updated);
  };

  const handleUpdatePreviewPosition = (index: number, newPosition: string) => {
    const updated = [...preview];
    if (updated[index]) {
      updated[index] = { ...updated[index], award_position: newPosition };
      setPreview(updated);
    }
  };

  const handleRemovePreviewItem = (index: number) => {
    setPreview(prev => prev.filter((_, idx) => idx !== index));
  };

  const handleAutoAward = async () => {
    if (!userSeasonId || !selectedTournament) {
      setError('Please select a tournament');
      return;
    }

    if (preview.length === 0) {
      setError('No awards in preview. Please preview winners first.');
      return;
    }
    
    if (!confirm(`Confirm and award ${preview.length} player awards for the selected tournament?`)) return;
    
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
          awards: preview
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setSuccess(`Successfully awarded ${data.awardsGiven} player awards!`);
        setPreview([]);
        fetchAwards();
      } else {
        setError(data.error);
      }
    } catch (err: any) {
      setError('Failed to auto-award');
    } finally {
      setAwarding(false);
    }
  };

  const handleDeleteAward = async (awardId: number) => {
    if (!confirm('Are you sure you want to delete this award?')) return;
    
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
    } catch (err: any) {
      setError('Failed to delete award');
    }
  };

  const handleSaveEditAward = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingAward) return;

    setSavingEdit(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetchWithTokenRefresh(`/api/player-awards/${editingAward.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          player_id: editingAward.player_id,
          player_name: editingAward.player_name,
          award_type: editingAward.award_type,
          award_category: editingAward.award_category,
          award_position: editingAward.award_position,
          player_category: editingAward.player_category,
          notes: editingAward.notes
        })
      });

      const data = await res.json();
      if (data.success) {
        setSuccess(`Award updated successfully! Awarded to ${editingAward.player_name}`);
        setEditingAward(null);
        fetchAwards();
      } else {
        setError(data.error || 'Failed to update award');
      }
    } catch (err: any) {
      setError('Failed to save award changes');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAddAward = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userSeasonId || !newAward.player_id || !newAward.award_type || !newAward.award_position) {
      setError('Please fill all required fields');
      return;
    }
    
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
          award_position: 'Winner',
          player_category: '',
          notes: ''
        });
        fetchAwards();
      } else {
        setError(data.error);
      }
    } catch (err: any) {
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
        player_category: player.category || ''
      });
    }
  };

  const toggleSelectAllAwards = (checked: boolean) => {
    const updated: Record<string, boolean> = {};
    Object.keys(selectedAwards).forEach(k => {
      updated[k] = checked;
    });
    setSelectedAwards(updated);
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
    <AuthGuard requiredRole="committee_admin">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Ambient Gold Glow Overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="container mx-auto max-w-7xl relative z-10">
        {/* Back Link */}
        <div className="mb-4">
          <Link
            href="/dashboard/committee"
            className="inline-flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200/60 text-slate-500 hover:text-slate-800 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all shadow-sm cursor-pointer"
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
              <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                Award, customize, and manage player achievements for the season
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-start sm:self-center bg-slate-50 px-3 py-1.5 rounded-xl border border-slate-200/40">
            <span className="text-[10px] text-slate-500 font-mono font-extrabold uppercase tracking-wider">Active Season:</span>
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

        {/* Auto-Award & Preview Section */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm mb-6">
          <div className="flex items-center justify-between mb-5 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-50 border border-slate-200/40 rounded-xl">
                <Cpu className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Auto-Award & Preview Winners</h2>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Calculate from stats, review, edit recipients, and give awards</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => toggleSelectAllAwards(true)}
                className="text-[10px] text-amber-600 hover:text-amber-700 font-bold uppercase underline cursor-pointer"
              >
                Select All
              </button>
              <span className="text-slate-300">|</span>
              <button
                type="button"
                onClick={() => toggleSelectAllAwards(false)}
                className="text-[10px] text-slate-500 hover:text-slate-700 font-bold uppercase underline cursor-pointer"
              >
                Clear
              </button>
            </div>
          </div>
          
          {/* Tournament Selector */}
          <div className="mb-5">
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Select Tournament *</label>
            <div className="relative">
              <select
                value={selectedTournament}
                onChange={(e) => setSelectedTournament(e.target.value)}
                className="w-full py-2.5 pl-4 pr-10 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold cursor-pointer appearance-none"
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
            <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider mb-3">Select Awards to Give:</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <p className="text-[10px] font-extrabold text-purple-600 uppercase tracking-wider mb-2">Individual Awards:</p>
                <div className="space-y-2">
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-900 select-none">
                    <input
                      type="checkbox"
                      checked={!!selectedAwards['Golden Boot']}
                      onChange={(e) => setSelectedAwards({...selectedAwards, 'Golden Boot': e.target.checked})}
                      className="w-4 h-4 accent-amber-500 rounded border-slate-300 text-slate-800 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span>Golden Boot (Top Scorer)</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-900 select-none">
                    <input
                      type="checkbox"
                      checked={!!selectedAwards['Golden Glove']}
                      onChange={(e) => setSelectedAwards({...selectedAwards, 'Golden Glove': e.target.checked})}
                      className="w-4 h-4 accent-amber-500 rounded border-slate-300 text-slate-800 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span>Golden Glove (Best Goalkeeper)</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-900 select-none">
                    <input
                      type="checkbox"
                      checked={!!selectedAwards['Golden Ball']}
                      onChange={(e) => setSelectedAwards({...selectedAwards, 'Golden Ball': e.target.checked})}
                      className="w-4 h-4 accent-amber-500 rounded border-slate-300 text-slate-800 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span>Golden Ball (Most Points)</span>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-900 select-none">
                    <input
                      type="checkbox"
                      checked={!!selectedAwards['Manager of Season']}
                      onChange={(e) => setSelectedAwards({...selectedAwards, 'Manager of Season': e.target.checked})}
                      className="w-4 h-4 accent-amber-500 rounded border-slate-300 text-slate-800 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                    />
                    <span>Manager of Season</span>
                  </label>
                </div>
              </div>
              <div>
                <p className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-wider mb-2">Category Awards (Season Tiers):</p>
                <div className="space-y-2">
                  {seasonCategories.map((cat) => {
                    const awardKey = `Best ${cat}`;
                    return (
                      <label key={cat} className="flex items-center gap-2.5 cursor-pointer text-xs font-bold text-slate-700 hover:text-slate-900 select-none">
                        <input
                          type="checkbox"
                          checked={!!selectedAwards[awardKey]}
                          onChange={(e) => setSelectedAwards({...selectedAwards, [awardKey]: e.target.checked})}
                          className="w-4 h-4 accent-amber-500 rounded border-slate-300 text-slate-800 focus:ring-0 focus:ring-offset-0 cursor-pointer"
                        />
                        <span className="flex items-center gap-1.5">
                          <span>Best {cat}</span>
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-600 border border-indigo-200">
                            {cat} Category
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          
          {/* Interactive Preview Section with Manual Override */}
          {preview.length > 0 && (
            <div className="bg-amber-50/50 p-4 rounded-xl mb-4 border border-amber-200">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-extrabold text-amber-800 flex items-center gap-1.5 uppercase tracking-wider">
                  <Eye className="w-4 h-4 text-amber-600" />
                  Award Winners Preview ({preview.length}):
                </h3>
                <span className="text-[10px] font-bold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded-lg border border-amber-300">
                  Tip: You can change the recipient or position for any award before confirming!
                </span>
              </div>
              
              <div className="space-y-3">
                {preview.map((item, idx) => (
                  <div key={idx} className="bg-white p-3.5 rounded-xl border border-slate-200/60 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                    {/* Award Info */}
                    <div className="min-w-[180px]">
                      <div className="flex items-center gap-2">
                        <div className={`px-2 py-0.5 rounded text-[9px] font-extrabold text-white bg-gradient-to-r ${getAwardBadgeColor(item.award_category || 'individual')}`}>
                          {(item.award_category || 'individual').toUpperCase()}
                        </div>
                        <span className="font-extrabold text-slate-800 text-xs uppercase">{item.award_type}</span>
                      </div>
                      {item.stats && (
                        <div className="text-[9px] text-slate-400 font-bold uppercase mt-1 flex flex-wrap gap-2">
                          {Object.entries(item.stats).map(([k, v]) => (
                            <span key={k}>{k.replace('_', ' ')}: <strong className="text-slate-600">{String(v)}</strong></span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Recipient Dropdown */}
                    <div className="flex-1 flex flex-col sm:flex-row items-start sm:items-center gap-2">
                      <div className="w-full sm:w-auto flex-1">
                        <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                          Recipient {item.award_type === 'Manager of Season' ? '(Manager / Team)' : '(Player)'}:
                          {item.player_name && (
                            <span className="text-amber-600 font-extrabold ml-1">
                              • {item.player_name.toUpperCase()}
                            </span>
                          )}
                        </label>
                        <div className="relative">
                          <select
                            value={item.player_id}
                            onChange={(e) => handleUpdatePreviewRecipient(idx, e.target.value)}
                            className="w-full py-1.5 pl-2.5 pr-8 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-bold text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-amber-500 cursor-pointer appearance-none"
                          >
                            {/* Selected recipient fallback if not yet matched in players array */}
                            {item.player_id && !players.some(p => p.player_id === item.player_id) && !managers.some(m => m.team_id === item.player_id || m.manager_id === item.player_id) && (
                              <option value={item.player_id}>
                                {(item.player_name || item.player_id).toUpperCase()} (Selected)
                              </option>
                            )}
                            {item.award_type === 'Manager of Season' ? (
                              <>
                                <optgroup label="Managers">
                                  {managers.map(m => (
                                    <option key={m.manager_id} value={m.team_id}>
                                      {m.name.toUpperCase()} (Manager)
                                    </option>
                                  ))}
                                </optgroup>
                                <optgroup label="All Players">
                                  {players.map(p => (
                                    <option key={p.player_id} value={p.player_id}>
                                      {p.player_name.toUpperCase()} ({p.category ? p.category.toUpperCase() : 'PLAYER'}{p.team ? ` • ${p.team}` : ''})
                                    </option>
                                  ))}
                                </optgroup>
                              </>
                            ) : (
                              players.map(p => (
                                <option key={p.player_id} value={p.player_id}>
                                  {p.player_name.toUpperCase()} ({p.category ? p.category.toUpperCase() : 'NO CAT'}{p.team ? ` • ${p.team}` : ''})
                                </option>
                              ))
                            )}
                          </select>
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>

                      {/* Position */}
                      <div className="w-full sm:w-32">
                        <label className="block text-[8px] font-bold text-slate-400 uppercase tracking-wider mb-1">Position:</label>
                        <div className="relative">
                          <select
                            value={item.award_position || 'Winner'}
                            onChange={(e) => handleUpdatePreviewPosition(idx, e.target.value)}
                            className="w-full py-1.5 pl-2.5 pr-7 bg-slate-50 border border-slate-200/80 rounded-lg text-xs font-bold text-slate-800 focus:bg-white focus:outline-none cursor-pointer appearance-none"
                          >
                            <option value="Winner">Winner</option>
                            <option value="Runner Up">Runner Up</option>
                            <option value="Third Place">Third Place</option>
                          </select>
                          <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                        </div>
                      </div>
                    </div>

                    {/* Remove Action */}
                    <button
                      type="button"
                      onClick={() => handleRemovePreviewItem(idx)}
                      title="Remove from batch"
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all self-end md:self-center cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
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
              {previewing ? 'Calculating Preview...' : 'Preview Winners'}
            </button>
            <button
              onClick={handleAutoAward}
              disabled={awarding || !selectedTournament || preview.length === 0}
              className="py-2.5 bg-amber-500 text-slate-950 hover:bg-amber-400 border border-amber-600 font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-md cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-slate-950" />
              {awarding ? 'Saving Awards...' : `Confirm & Give Selected (${preview.length})`}
            </button>
          </div>
        </div>

        {/* Awards List Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-50 border border-slate-200/40 rounded-xl">
                <Trophy className="w-5 h-5 text-amber-500" />
              </div>
              <div>
                <h2 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">
                  Given Player Awards ({awards.length})
                </h2>
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">List of all awarded achievements for this season</p>
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
                <Plus className="w-5 h-5 text-emerald-500" />
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Add New Award Manually</h3>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Player Select */}
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-2">Recipient Player *</label>
                  <div className="relative">
                    <select
                      value={newAward.player_id}
                      onChange={(e) => handlePlayerSelect(e.target.value)}
                      className="w-full py-2.5 pl-4 pr-10 bg-white border border-slate-200/60 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold cursor-pointer appearance-none"
                      required
                    >
                      <option value="">-- SELECT RECIPIENT --</option>
                      {players.map((player) => (
                        <option key={player.player_id} value={player.player_id}>
                          {player.player_name.toUpperCase()} ({player.category ? player.category.toUpperCase() : 'NO CAT'})
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
                      onChange={(e) => {
                        const cat = e.target.value as 'individual' | 'category';
                        setNewAward({ 
                          ...newAward, 
                          award_category: cat,
                          award_type: cat === 'category' ? `Best ${seasonCategories[0] || 'RED'}` : 'Golden Boot',
                          player_category: cat === 'category' ? (seasonCategories[0] || 'RED') : ''
                        });
                      }}
                      className="w-full py-2.5 pl-4 pr-10 bg-white border border-slate-200/60 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold cursor-pointer appearance-none"
                    >
                      <option value="individual">INDIVIDUAL (SEASON-WIDE)</option>
                      <option value="category">CATEGORY (TIER-SPECIFIC)</option>
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
                      onChange={(e) => {
                        const val = e.target.value;
                        const matchedCat = seasonCategories.find(c => val === `Best ${c}`);
                        setNewAward({ 
                          ...newAward, 
                          award_type: val,
                          ...(matchedCat ? { player_category: matchedCat } : {})
                        });
                      }}
                      className="w-full py-2.5 pl-4 pr-10 bg-white border border-slate-200/60 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-bold cursor-pointer appearance-none"
                      required
                    >
                      <option value="">-- SELECT AWARD TYPE --</option>
                      {newAward.award_category === 'individual' ? (
                        <>
                          <option value="Golden Boot">GOLDEN BOOT</option>
                          <option value="Golden Glove">GOLDEN GLOVE</option>
                          <option value="Golden Ball">GOLDEN BALL</option>
                          <option value="Manager of Season">MANAGER OF SEASON</option>
                          <option value="Most Assists">MOST ASSISTS</option>
                          <option value="Most Clean Sheets">MOST CLEAN SHEETS</option>
                          <option value="Player of the Season">PLAYER OF THE SEASON</option>
                        </>
                      ) : (
                        seasonCategories.map(cat => (
                          <option key={cat} value={`Best ${cat}`}>BEST {cat}</option>
                        ))
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

          {/* Awards List Content */}
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-2 border-amber-500 border-t-transparent mx-auto"></div>
            </div>
          ) : awards.length === 0 ? (
            <div className="text-center py-8 text-slate-400 font-mono">
              <p className="text-xs uppercase tracking-wider font-extrabold">No player awards given yet</p>
              <p className="text-[10px] uppercase font-bold mt-1">Use the Auto-Award generator above or add manually</p>
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
                        <span className="font-extrabold text-slate-800 text-xs sm:text-sm uppercase tracking-wider">
                          {award.award_type} {award.award_position && `• ${award.award_position}`}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-[10px] text-slate-500 font-bold uppercase ml-0 sm:ml-9">
                        <span>Recipient: <strong className="text-slate-800">{award.player_name}</strong></span>
                        <span>•</span>
                        <span>Awarded By: {award.awarded_by}</span>
                        {award.player_category && (
                          <>
                            <span>•</span>
                            <span className="text-indigo-600 font-black">Category: {award.player_category}</span>
                          </>
                        )}
                      </div>
                      {award.notes && (
                        <p className="text-[10px] text-slate-400 font-medium italic mt-1.5 ml-0 sm:ml-9">{award.notes}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center">
                      <button
                        onClick={() => setEditingAward({ ...award })}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
                      >
                        <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteAward(award.id)}
                        className="px-3 py-1.5 bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200 rounded-xl text-xs font-extrabold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-sm"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit Award Modal */}
      {editingAward && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs font-mono">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg p-5 sm:p-6 overflow-hidden">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
              <div className="flex items-center gap-2">
                <Edit3 className="w-5 h-5 text-amber-500" />
                <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
                  Edit Award Recipient & Details
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setEditingAward(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditAward} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Award Type & Title
                </label>
                <input
                  type="text"
                  value={editingAward.award_type}
                  onChange={(e) => setEditingAward({ ...editingAward, award_type: e.target.value })}
                  className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 uppercase"
                  required
                />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Give Award To (Select Player or Manager) *
                </label>
                <div className="relative">
                  <select
                    value={editingAward.player_id}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      const p = players.find(x => x.player_id === selectedId);
                      if (p) {
                        setEditingAward({
                          ...editingAward,
                          player_id: p.player_id,
                          player_name: p.player_name,
                          player_category: editingAward.award_category === 'category'
                            ? (editingAward.player_category || p.category)
                            : (p.category || editingAward.player_category)
                        });
                      } else {
                        const m = managers.find(x => x.team_id === selectedId || x.manager_id === selectedId);
                        if (m) {
                          setEditingAward({
                            ...editingAward,
                            player_id: m.team_id,
                            player_name: m.name
                          });
                        }
                      }
                    }}
                    className="w-full py-2.5 pl-3 pr-10 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none cursor-pointer appearance-none"
                    required
                  >
                    {editingAward.player_id && !players.some(p => p.player_id === editingAward.player_id) && !managers.some(m => m.team_id === editingAward.player_id || m.manager_id === editingAward.player_id) && (
                        <option value={editingAward.player_id}>
                          {(editingAward.player_name || editingAward.player_id).toUpperCase()} (Current Recipient)
                        </option>
                      )}
                      <optgroup label="Season Players">
                      {players.map(p => (
                        <option key={p.player_id} value={p.player_id}>
                          {p.player_name.toUpperCase()} ({p.category ? p.category.toUpperCase() : 'PLAYER'}{p.team ? ` • ${p.team}` : ''})
                        </option>
                      ))}
                    </optgroup>
                    {managers.length > 0 && (
                      <optgroup label="Team Managers">
                        {managers.map(m => (
                          <option key={m.manager_id} value={m.team_id}>
                            {m.name.toUpperCase()} (Manager)
                          </option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                  <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Position
                  </label>
                  <div className="relative">
                    <select
                      value={editingAward.award_position || 'Winner'}
                      onChange={(e) => setEditingAward({ ...editingAward, award_position: e.target.value })}
                      className="w-full py-2 pl-3 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none cursor-pointer appearance-none"
                    >
                      <option value="Winner">Winner</option>
                      <option value="Runner Up">Runner Up</option>
                      <option value="Third Place">Third Place</option>
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                    Category Tag
                  </label>
                  <div className="relative">
                    <select
                      value={editingAward.player_category || ''}
                      onChange={(e) => setEditingAward({ ...editingAward, player_category: e.target.value || null })}
                      className="w-full py-2 pl-3 pr-8 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:bg-white focus:outline-none cursor-pointer appearance-none"
                    >
                      <option value="">None / Individual</option>
                      {seasonCategories.map(cat => (
                        <option key={cat} value={cat}>{cat.toUpperCase()}</option>
                      ))}
                    </select>
                    <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                  Notes
                </label>
                <input
                  type="text"
                  value={editingAward.notes || ''}
                  onChange={(e) => setEditingAward({ ...editingAward, notes: e.target.value })}
                  placeholder="Notes or reason for award"
                  className="w-full py-2 px-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingAward(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs uppercase rounded-xl transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingEdit}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-extrabold text-xs uppercase rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                >
                  <Save className="w-4 h-4" />
                  {savingEdit ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
    </AuthGuard>
  );
}
