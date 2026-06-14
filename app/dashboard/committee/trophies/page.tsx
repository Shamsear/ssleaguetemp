'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { Trophy as TrophyIcon, Settings, ArrowLeft, Info, Calendar, Clock, Lock, Plus, Trash2, CheckCircle, AlertCircle, Sparkles, X, ChevronRight, Award, Crown, Trophy, Star } from 'lucide-react';

interface Trophy {
  id: number;
  team_id: string;
  team_name: string;
  season_id: string;
  trophy_type: string;
  trophy_name: string;
  trophy_position: string | null;
  position: number | null;
  awarded_by: string;
  notes: string | null;
  created_at: string;
}

interface TrophyPreview {
  team_id: string;
  team_name: string;
  position: number;
  trophy_name: string;
  trophy_type: string;
  tournament_name: string;
  alreadyAwarded: boolean;
}

export default function TrophyManagementPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { isCommitteeAdmin, userSeasonId } = usePermissions();
  
  const [trophies, setTrophies] = useState<Trophy[]>([]);
  const [preview, setPreview] = useState<TrophyPreview[]>([]);
  const [selectedTrophies, setSelectedTrophies] = useState<Set<string>>(new Set());
  const [teams, setTeams] = useState<string[]>([]);
  const [trophyOptions, setTrophyOptions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [awarding, setAwarding] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // New trophy form
  const [newTrophy, setNewTrophy] = useState({
    team_name: '',
    trophy_type: 'cup',
    trophy_name: '',
    position: '',
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
      fetchTrophies();
      fetchPreview();
      fetchTeams();
      fetchSecondaryTournaments();
    }
  }, [userSeasonId]);

  const fetchTrophies = async () => {
    if (!userSeasonId) return;
    
    setLoading(true);
    try {
      const res = await fetchWithTokenRefresh(`/api/trophies?season_id=${userSeasonId}`);
      const data = await res.json();
      if (data.success) {
        setTrophies(data.trophies || []);
      }
    } catch (err) {
      console.error('Error fetching trophies:', err);
      setError('Failed to load trophies');
    } finally {
      setLoading(false);
    }
  };

  const fetchPreview = async () => {
    if (!userSeasonId) return;
    
    try {
      const res = await fetchWithTokenRefresh(`/api/trophies/preview?season_id=${userSeasonId}`);
      const data = await res.json();
      if (data.success) {
        setPreview(data.preview || []);
        // Auto-select trophies that haven't been awarded yet
        const notAwarded = new Set<string>();
        (data.preview || []).forEach((p: TrophyPreview, index: number) => {
          if (!p.alreadyAwarded) {
            notAwarded.add(`${index}`);
          }
        });
        setSelectedTrophies(notAwarded);
      }
    } catch (err) {
      console.error('Error fetching preview:', err);
    }
  };

  const fetchTeams = async () => {
    if (!userSeasonId) return;
    
    try {
      // Fetch teams from teamstats for current season
      const res = await fetchWithTokenRefresh(`/api/stats/teams?season_id=${userSeasonId}`);
      const data = await res.json();
      if (data.success && data.teams) {
        const teamNames = data.teams.map((t: any) => t.team_name).sort();
        setTeams(teamNames);
      }
    } catch (err) {
      console.error('Error fetching teams:', err);
    }
  };

  const fetchSecondaryTournaments = async () => {
    if (!userSeasonId) return;
    
    try {
      // Fetch all tournaments for the season
      const res = await fetchWithTokenRefresh(`/api/tournaments?season_id=${userSeasonId}`);
      const data = await res.json();
      if (data.success && data.tournaments) {
        // Generate trophy options from tournament names
        const options: string[] = data.tournaments.map((t: any) => t.tournament_name);
        // Add custom option at the end
        options.push('Other (Custom)');
        setTrophyOptions(options);
      } else {
        // Fallback to default options if API fails
        setTrophyOptions(['Other (Custom)']);
      }
    } catch (err) {
      console.error('Error fetching tournaments:', err);
      // Fallback to default options
      setTrophyOptions(['Other (Custom)']);
    }
  };

  const handleAutoAward = async () => {
    if (!userSeasonId) return;
    
    if (selectedTrophies.size === 0) {
      setError('Please select at least one trophy to award');
      return;
    }
    
    setAwarding(true);
    setError(null);
    setSuccess(null);
    
    try {
      // Build list of selected trophies to award
      const trophiesToAward = Array.from(selectedTrophies).map(index => preview[parseInt(index)]);
      
      const res = await fetchWithTokenRefresh('/api/trophies/award-selected', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          season_id: userSeasonId,
          trophies: trophiesToAward
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setSuccess(`<CheckCircle className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Awarded ${data.trophiesAwarded} trophies!`);
        fetchTrophies();
        fetchPreview();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to award trophies');
    } finally {
      setAwarding(false);
    }
  };

  const toggleTrophySelection = (index: number) => {
    const newSelected = new Set(selectedTrophies);
    const key = `${index}`;
    if (newSelected.has(key)) {
      newSelected.delete(key);
    } else {
      newSelected.add(key);
    }
    setSelectedTrophies(newSelected);
  };

  const toggleAllTrophies = () => {
    if (selectedTrophies.size === preview.length) {
      setSelectedTrophies(new Set());
    } else {
      setSelectedTrophies(new Set(preview.map((_, i) => `${i}`)));
    }
  };

  const handleDeleteTrophy = async (trophyId: number) => {
    if (!confirm('Delete this trophy?')) return;
    
    setError(null);
    setSuccess(null);
    
    try {
      const res = await fetchWithTokenRefresh(`/api/trophies/${trophyId}`, {
        method: 'DELETE'
      });
      
      const data = await res.json();
      if (data.success) {
        setSuccess('Trophy deleted successfully');
        fetchTrophies();
        fetchPreview();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to delete trophy');
    }
  };

  const handleAddTrophy = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!userSeasonId || !newTrophy.team_name || !newTrophy.trophy_name || !newTrophy.position) {
      setError('Please fill all required fields');
      return;
    }
    
    setError(null);
    setSuccess(null);
    
    try {
      const res = await fetchWithTokenRefresh('/api/trophies/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          season_id: userSeasonId,
          team_name: newTrophy.team_name,
          trophy_type: newTrophy.trophy_type,
          trophy_name: newTrophy.trophy_name,
          trophy_position: newTrophy.position,
          notes: newTrophy.notes
        })
      });
      
      const data = await res.json();
      if (data.success) {
        setSuccess('Trophy added successfully!');
        setShowAddForm(false);
        setNewTrophy({ team_name: '', trophy_type: 'cup', trophy_name: '', position: '', notes: '' });
        fetchTrophies();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Failed to add trophy');
    }
  };
  const getTrophyBadgeColor = (type: string) => {
    switch (type) {
      case 'league': return 'border-yellow-200 bg-yellow-50/50 text-yellow-800';
      case 'runner_up': return 'border-slate-200 bg-slate-50/50 text-slate-700';
      case 'cup': return 'border-blue-200 bg-blue-50/50 text-blue-800';
      case 'special': return 'border-purple-200 bg-purple-50/50 text-purple-800';
      default: return 'border-slate-200 bg-slate-50/50 text-slate-600';
    }
  };

  const getTrophyIcon = (type: string) => {
    switch (type) {
      case 'league': return <Crown className="w-5 h-5 text-amber-500" />;
      case 'runner_up': return <Award className="w-5 h-5 text-slate-400" />;
      case 'cup': return <TrophyIcon className="w-5 h-5 text-blue-500" />;
      case 'special': return <Sparkles className="w-5 h-5 text-purple-500" />;
      default: return <Award className="w-5 h-5 text-slate-500" />;
    }
  };

  if (authLoading || !user || !isCommitteeAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono font-mono">Loading trophies console...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Decorative glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/committee"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <TrophyIcon className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">SYSTEM CONTROL</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Trophy Management
              </h1>
              <p className="text-xs text-slate-550 font-mono mt-1">
                Award and manage team trophies for the current season.
              </p>
            </div>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="console-card bg-rose-50 border border-rose-200 rounded-3xl p-5 shadow-sm flex items-center gap-3 text-rose-800">
            <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
            <p className="text-xs font-bold uppercase tracking-wide">{error}</p>
          </div>
        )}

        {success && (
          <div className="console-card bg-emerald-50/30 border border-emerald-200 rounded-3xl p-5 shadow-sm flex items-center gap-3 text-emerald-800">
            <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <p className="text-xs font-bold uppercase tracking-wide">{success}</p>
          </div>
        )}

        {/* Auto-Award Section */}
        {preview.length > 0 && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-6">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4">
              <div className="w-10 h-10 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-amber-500 animate-pulse" />
              </div>
              <div>
                <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Auto-Award Trophies</h2>
                <p className="text-[10px] text-slate-500 font-mono">Based on tournament standings</p>
              </div>
            </div>
            
            {/* Group preview by tournament */}
            {Object.entries(
              preview.reduce((acc, p) => {
                if (!acc[p.tournament_name]) acc[p.tournament_name] = [];
                acc[p.tournament_name].push(p);
                return acc;
              }, {} as Record<string, TrophyPreview[]>)
            ).map(([tournamentName, trophies]) => (
              <div key={tournamentName} className="space-y-3">
                <h3 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-1.5 px-1">
                  <ChevronRight className="w-3.5 h-3.5 text-amber-550" /> {tournamentName}
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {trophies.map((p) => {
                    const globalIndex = preview.findIndex(item => item === p);
                    const isSelected = selectedTrophies.has(`${globalIndex}`);
                    return (
                      <div 
                        key={`${p.team_name}-${p.trophy_name}`} 
                        onClick={() => !p.alreadyAwarded && toggleTrophySelection(globalIndex)}
                        className={`flex items-center gap-3 bg-slate-50 p-4 rounded-2xl border transition-all cursor-pointer ${
                          isSelected ? 'border-amber-500 bg-amber-50/35 shadow-sm' : 'border-slate-200 hover:border-slate-300'
                        } ${p.alreadyAwarded ? 'opacity-60 cursor-not-allowed' : ''}`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => !p.alreadyAwarded && toggleTrophySelection(globalIndex)}
                          disabled={p.alreadyAwarded}
                          onClick={(e) => e.stopPropagation()}
                          className="w-4 h-4 rounded border-slate-350 text-amber-500 focus:ring-amber-500 disabled:opacity-50 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="font-extrabold text-sm text-slate-800 truncate">{p.team_name}</p>
                          <p className="text-xs text-slate-500 font-mono mt-0.5 font-bold">{p.trophy_name}</p>
                        </div>
                        {p.alreadyAwarded && (
                          <span className="flex-shrink-0 flex items-center gap-1 text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded uppercase font-black tracking-wide">
                            <CheckCircle className="w-3 h-3 text-emerald-500" /> Awarded
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
            
            <div className="flex items-center justify-between pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={toggleAllTrophies}
                className="text-xs text-slate-550 hover:text-slate-800 font-extrabold uppercase tracking-wider transition-colors cursor-pointer"
              >
                {selectedTrophies.size === preview.length ? '☐ Deselect All' : '☑ Select All'}
              </button>
              <span className="text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider">
                {selectedTrophies.size} of {preview.length} selected
              </span>
            </div>
            
            <button
              onClick={handleAutoAward}
              disabled={awarding || selectedTrophies.size === 0}
              className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-900 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
            >
              {awarding ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                  <span>Awarding Trophies...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                  <span>Award Selected Trophies ({selectedTrophies.size})</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Awarded Trophies List */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 border-b border-slate-100 pb-4">
            <h2 className="text-sm font-extrabold text-slate-950 uppercase tracking-tight flex items-center gap-2">
              <TrophyIcon className="w-5 h-5 text-amber-500" /> Awarded Trophies ({trophies.length})
            </h2>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className={`px-4 py-2 rounded-xl font-bold text-xs uppercase tracking-wider transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                showAddForm
                  ? 'bg-slate-105 hover:bg-slate-200 text-slate-700 border border-slate-300'
                  : 'bg-slate-800 hover:bg-slate-700 text-white border border-slate-900'
              }`}
            >
              {showAddForm ? (
                <>
                  <X className="w-3.5 h-3.5" /> Close Form
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" /> Add Trophy
                </>
              )}
            </button>
          </div>

          {/* Add Trophy Form */}
          {showAddForm && (
            <form onSubmit={handleAddTrophy} className="mb-6 p-4 sm:p-6 bg-slate-50 border border-slate-200 rounded-2xl space-y-4">
              <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">Add New Trophy</h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Team Name *</label>
                  <select
                    value={newTrophy.team_name}
                    onChange={(e) => setNewTrophy({ ...newTrophy, team_name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                    required
                  >
                    <option value="">-- Select Team --</option>
                    {teams.map((team) => (
                      <option key={team} value={team}>{team}</option>
                    ))}
                  </select>
                </div>
                
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Trophy Type *</label>
                  <select
                    value={newTrophy.trophy_type}
                    onChange={(e) => setNewTrophy({ ...newTrophy, trophy_type: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                  >
                    <option value="cup"><Trophy className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Cup</option>
                    <option value="special"><Star className="w-4 h-4 inline-block text-amber-400 fill-amber-400 mr-1 align-text-bottom" /> Special Award</option>
                    <option value="league"><Trophy className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> League</option>
                    <option value="runner_up"><Trophy className="w-4 h-4 inline-block text-slate-400 fill-slate-400 mr-1 align-text-bottom" /> Runner Up</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Trophy Name *</label>
                  <select
                    value={newTrophy.trophy_name}
                    onChange={(e) => setNewTrophy({ ...newTrophy, trophy_name: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                    required
                  >
                    <option value="">-- Select Trophy --</option>
                    {trophyOptions.map((trophy) => (
                      <option key={trophy} value={trophy === 'Other (Custom)' ? '' : trophy}>
                        {trophy}
                      </option>
                    ))}
                  </select>
                  {newTrophy.trophy_name === '' && trophyOptions.includes('Other (Custom)') && (
                    <input
                      type="text"
                      placeholder="Enter custom trophy name"
                      onChange={(e) => setNewTrophy({ ...newTrophy, trophy_name: e.target.value })}
                      className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all mt-2"
                    />
                  )}
                </div>
                
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Position *</label>
                  <select
                    value={newTrophy.position}
                    onChange={(e) => setNewTrophy({ ...newTrophy, position: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                    required
                  >
                    <option value="">-- Select Position --</option>
                    <option value="Winner"><Trophy className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Winner</option>
                    <option value="Runner Up"><Trophy className="w-4 h-4 inline-block text-slate-400 fill-slate-400 mr-1 align-text-bottom" /> Runner Up</option>
                    <option value="Champions"><Trophy className="w-4 h-4 inline-block text-amber-500 mr-1 align-text-bottom" /> Champions</option>
                    <option value="Third Place"><Trophy className="w-4 h-4 inline-block text-amber-700 fill-amber-700 mr-1 align-text-bottom" /> Third Place</option>
                  </select>
                </div>
                
                <div className="sm:col-span-2">
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">Notes (Optional)</label>
                  <input
                    type="text"
                    value={newTrophy.notes || ''}
                    onChange={(e) => setNewTrophy({ ...newTrophy, notes: e.target.value })}
                    className="w-full px-4 py-2.5 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all"
                    placeholder="e.g. Awarded for unbeaten run"
                  />
                </div>
              </div>
              
              <button
                type="submit"
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 border border-slate-900 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider shadow-sm transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-4"
              >
                <Plus className="w-3.5 h-3.5 text-amber-400" />
                <span>Add & Register Trophy</span>
              </button>
            </form>
          )}

          {/* Trophies List */}
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mx-auto"></div>
              <p className="mt-3 text-xs text-slate-550 font-mono font-extrabold uppercase tracking-wider">Loading awarded trophies...</p>
            </div>
          ) : trophies.length === 0 ? (
            <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-2xl">
              <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-4">
                <Info className="w-6 h-6 text-slate-400" />
              </div>
              <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-1">
                No Trophies Awarded Yet
              </h3>
              <p className="text-xs text-slate-500 font-mono">
                Trophies have not been distributed. Use auto-award or add a trophy manually.
              </p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Group trophies by tournament */}
              {Object.entries(
                trophies.reduce((acc, trophy) => {
                  if (!acc[trophy.trophy_name]) acc[trophy.trophy_name] = [];
                  acc[trophy.trophy_name].push(trophy);
                  return acc;
                }, {} as Record<string, Trophy[]>)
              ).map(([tournamentName, tournamentTrophies]) => (
                <div key={tournamentName} className="space-y-3">
                  <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5 px-1">
                    <TrophyIcon className="w-3.5 h-3.5 text-amber-500/70" /> {tournamentName}
                  </h3>
                  <div className="grid grid-cols-1 gap-3">
                    {tournamentTrophies.map((trophy) => (
                      <div key={trophy.id} className="bg-slate-50 border border-slate-200 rounded-2xl p-4 hover:shadow-sm transition-all duration-300">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                          <div className="flex items-start gap-3.5">
                            <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center flex-shrink-0 shadow-sm">
                              {getTrophyIcon(trophy.trophy_type)}
                            </div>
                            <div className="space-y-1 min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`border text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${getTrophyBadgeColor(trophy.trophy_type)}`}>
                                  {trophy.trophy_type}
                                </span>
                                <span className="font-extrabold text-sm text-slate-800">
                                  {trophy.trophy_position || trophy.trophy_name}
                                </span>
                              </div>
                              <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                                <span>Team: <strong className="text-slate-800 font-bold">{trophy.team_name}</strong></span>
                                {trophy.position && (
                                  <>
                                    <span>•</span>
                                    <span>Position: <strong className="text-slate-800 font-bold">{trophy.position}</strong></span>
                                  </>
                                )}
                                <span>•</span>
                                <span>Awarded By: {trophy.awarded_by}</span>
                              </div>
                              {trophy.notes && (
                                <p className="text-[11px] text-slate-400 italic mt-1 font-medium">“{trophy.notes}”</p>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => handleDeleteTrophy(trophy.id)}
                            className="w-full sm:w-auto px-4 py-2 bg-white hover:bg-rose-50 border border-slate-200 hover:border-rose-200 text-slate-500 hover:text-rose-600 rounded-xl font-mono text-xs uppercase font-extrabold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer self-end sm:self-center"
                          >
                            <Trash2 className="w-3.5 h-3.5" /> Delete
                          </button>
                        </div>
                      </div>
                    ))}
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
