'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { 
  ArrowLeft, 
  AlertCircle, 
  CheckCircle, 
  ExternalLink, 
  Edit3, 
  Plus, 
  Trophy, 
  Award as AwardIcon, 
  Activity, 
  HelpCircle,
  Clock
} from 'lucide-react';

interface TrophyData {
  id: number;
  team_name: string;
  season_id: string;
  trophy_type: string;
  trophy_name: string;
  trophy_position: string | null;
  instagram_link: string | null;
}

interface Award {
  id: string;
  award_type: string;
  season_id: string;
  player_name?: string;
  team_name?: string;
  round_number?: number;
  week_number?: number;
  instagram_link: string | null;
}

interface PlayerAward {
  id: number;
  player_name: string;
  season_id: string;
  award_category: string;
  award_type: string;
  award_position: string | null;
  instagram_link: string | null;
}

type AwardType = 'trophies' | 'awards' | 'player_awards';

export default function AwardPhotosManagement() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<AwardType>('trophies');
  const [seasons, setSeasons] = useState<any[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Data states
  const [trophies, setTrophies] = useState<TrophyData[]>([]);
  const [awards, setAwards] = useState<Award[]>([]);
  const [playerAwards, setPlayerAwards] = useState<PlayerAward[]>([]);

  // Edit states
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [editingLink, setEditingLink] = useState<string>('');

  useEffect(() => {
    if (!authLoading && !user) {
      router.push('/login');
    }
    if (!authLoading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, authLoading, router]);

  useEffect(() => {
    fetchSeasons();
  }, []);

  useEffect(() => {
    if (selectedSeason) {
      fetchData();
    }
  }, [selectedSeason, activeTab]);

  const fetchSeasons = async () => {
    try {
      const res = await fetchWithTokenRefresh('/api/seasons/list');
      const data = await res.json();
      if (data.success && data.seasons) {
        setSeasons(data.seasons);
        if (data.seasons.length > 0) {
          setSelectedSeason(data.seasons[0].id);
        }
      }
    } catch (err) {
      console.error('Error fetching seasons:', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'trophies') {
        const res = await fetchWithTokenRefresh(`/api/trophies?season_id=${selectedSeason}`);
        const data = await res.json();
        if (data.success) {
          setTrophies(data.trophies || []);
        }
      } else if (activeTab === 'awards') {
        const res = await fetchWithTokenRefresh(`/api/awards?season_id=${selectedSeason}`);
        const data = await res.json();
        if (data.success) {
          setAwards(data.awards || []);
        }
      } else if (activeTab === 'player_awards') {
        const res = await fetchWithTokenRefresh(`/api/player-awards?season_id=${selectedSeason}`);
        const data = await res.json();
        if (data.success) {
          setPlayerAwards(data.awards || []);
        }
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (id: string | number, currentLink: string | null) => {
    setEditingId(id);
    setEditingLink(currentLink || '');
  };

  const handleSave = async () => {
    if (editingId === null) return;

    setError(null);
    setSuccess(null);

    try {
      let endpoint = '';
      let body: any = { instagram_link: editingLink };

      if (activeTab === 'trophies') {
        endpoint = `/api/trophies/${editingId}`;
      } else if (activeTab === 'awards') {
        endpoint = `/api/awards/${editingId}`;
      } else if (activeTab === 'player_awards') {
        endpoint = `/api/player-awards/${editingId}`;
      }

      const res = await fetchWithTokenRefresh(endpoint, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      const data = await res.json();
      if (data.success) {
        setSuccess('Instagram link updated successfully!');
        setEditingId(null);
        setEditingLink('');
        fetchData();
        setTimeout(() => setSuccess(null), 3000);
      } else {
        setError(data.error || 'Failed to update');
        setTimeout(() => setError(null), 4000);
      }
    } catch (err) {
      console.error('Error updating:', err);
      setError('Failed to update Instagram link');
      setTimeout(() => setError(null), 4000);
    }
  };

  const handleCancel = () => {
    setEditingId(null);
    setEditingLink('');
  };

  const getAwardDisplayName = (award: Award) => {
    const typeNames: Record<string, string> = {
      POTD: 'Player of the Day',
      POTW: 'Player of the Week',
      POTS: 'Player of the Season',
      TOD: 'Team of the Day',
      TOW: 'Team of the Week',
      TOTS: 'Team of the Season'
    };
    
    let name = typeNames[award.award_type] || award.award_type;
    if (award.round_number) name += ` (Round ${award.round_number})`;
    if (award.week_number) name += ` (Week ${award.week_number})`;
    return name;
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center pt-32">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-550 font-mono text-xs tracking-widest uppercase animate-pulse">Syncing Media Settings...</p>
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
              Award Photos Management
            </h1>
            <p className="text-xs text-slate-505 font-mono mt-1">
              Add Instagram embedded visual links for tournament awards, weekly achievements, and team trophies.
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

      {/* Season Selector */}
      <div className="console-card bg-white border border-slate-200/60 p-5 shadow-sm rounded-2xl">
        <label className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-2">Select Active Season Context</label>
        <select
          value={selectedSeason}
          onChange={(e) => setSelectedSeason(e.target.value)}
          className="w-full sm:w-64 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-700 focus:border-amber-400 outline-none text-xs"
        >
          {seasons.map((season) => (
            <option key={season.id} value={season.id}>
              {season.name || season.short_name || season.id}
            </option>
          ))}
        </select>
      </div>

      {/* Tabs Layout */}
      <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl space-y-6">
        
        {/* Navigation Switchers */}
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setActiveTab('trophies')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'trophies'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700'
            }`}
          >
            <Trophy className="w-4 h-4" />
            Franchise Trophies ({trophies.length})
          </button>
          <button
            onClick={() => setActiveTab('awards')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'awards'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700'
            }`}
          >
            <AwardIcon className="w-4 h-4" />
            General Awards ({awards.length})
          </button>
          <button
            onClick={() => setActiveTab('player_awards')}
            className={`px-4 py-2 rounded-xl text-xs font-mono font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'player_awards'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700'
            }`}
          >
            <Activity className="w-4 h-4" />
            Player Awards ({playerAwards.length})
          </button>
        </div>

        {/* Content Lists */}
        {loading ? (
          <div className="text-center py-8 text-slate-400">
            <span className="inline-block w-6 h-6 border-2 border-slate-400 border-t-transparent rounded-full animate-spin"></span>
          </div>
        ) : (
          <div className="space-y-4">
            
            {/* Team Trophies */}
            {activeTab === 'trophies' && trophies.map((trophy) => (
              <div key={trophy.id} className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-4 hover:shadow-sm transition-all space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">
                      {trophy.trophy_name} {trophy.trophy_position && `• ${trophy.trophy_position}`}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">Assigned Franchise: <span className="font-semibold text-slate-700">{trophy.team_name}</span></p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-mono font-bold uppercase self-start">
                    {trophy.trophy_type}
                  </span>
                </div>
                
                {editingId === trophy.id ? (
                  <div className="space-y-2 max-w-2xl">
                    <input
                      type="text"
                      value={editingLink}
                      onChange={(e) => setEditingLink(e.target.value)}
                      placeholder="Instagram embed link (e.g., https://www.instagram.com/p/ABC123/embed)"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 outline-none text-slate-800 font-mono text-xs transition-all"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSave}
                        className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancel}
                        className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold rounded-xl transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100">
                    <div className="flex-1 min-w-0">
                      {trophy.instagram_link ? (
                        <a
                          href={trophy.instagram_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-amber-600 hover:underline truncate flex items-center gap-1"
                        >
                          {trophy.instagram_link}
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400 font-mono">No Instagram embedded asset configured.</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleEdit(trophy.id, trophy.instagram_link)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-850 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all flex-shrink-0"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      {trophy.instagram_link ? 'Edit' : 'Add'} Link
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* General Awards */}
            {activeTab === 'awards' && awards.map((award) => (
              <div key={award.id} className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-4 hover:shadow-sm transition-all space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">
                      {getAwardDisplayName(award)}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono mt-0.5">Recipient: <span className="font-semibold text-slate-700">{award.player_name || award.team_name}</span></p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-mono font-bold uppercase self-start">
                    {award.award_type}
                  </span>
                </div>
                
                {editingId === award.id ? (
                  <div className="space-y-2 max-w-2xl">
                    <input
                      type="text"
                      value={editingLink}
                      onChange={(e) => setEditingLink(e.target.value)}
                      placeholder="Instagram embed link"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 outline-none text-slate-800 font-mono text-xs transition-all"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSave}
                        className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancel}
                        className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-55 text-slate-700 text-xs font-bold rounded-xl transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100">
                    <div className="flex-1 min-w-0">
                      {award.instagram_link ? (
                        <a
                          href={award.instagram_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-amber-600 hover:underline truncate flex items-center gap-1"
                        >
                          {award.instagram_link}
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400 font-mono">No Instagram embedded asset configured.</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleEdit(award.id, award.instagram_link)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-850 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all flex-shrink-0"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      {award.instagram_link ? 'Edit' : 'Add'} Link
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Player Awards */}
            {activeTab === 'player_awards' && playerAwards.map((award) => (
              <div key={award.id} className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-4 hover:shadow-sm transition-all space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                  <div>
                    <h3 className="font-bold text-slate-900 text-sm">
                      {award.award_type} {award.award_position && `• ${award.award_position}`}
                    </h3>
                    <p className="text-xs text-slate-505 font-mono mt-0.5">Player: <span className="font-semibold text-slate-700">{award.player_name}</span></p>
                  </div>
                  <span className="px-2 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 text-[9px] font-mono font-bold uppercase self-start">
                    {award.award_category}
                  </span>
                </div>
                
                {editingId === award.id ? (
                  <div className="space-y-2 max-w-2xl">
                    <input
                      type="text"
                      value={editingLink}
                      onChange={(e) => setEditingLink(e.target.value)}
                      placeholder="Instagram embed link"
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400/20 outline-none text-slate-800 font-mono text-xs transition-all"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={handleSave}
                        className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-xl transition-all shadow-sm"
                      >
                        Save
                      </button>
                      <button
                        onClick={handleCancel}
                        className="px-3.5 py-1.5 bg-white border border-slate-200 hover:bg-slate-55 text-slate-700 text-xs font-bold rounded-xl transition-all"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-4 pt-1 border-t border-slate-100">
                    <div className="flex-1 min-w-0">
                      {award.instagram_link ? (
                        <a
                          href={award.instagram_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-amber-600 hover:underline truncate flex items-center gap-1"
                        >
                          {award.instagram_link}
                          <ExternalLink className="w-3 h-3 flex-shrink-0" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400 font-mono">No Instagram embedded asset configured.</span>
                      )}
                    </div>
                    <button
                      onClick={() => handleEdit(award.id, award.instagram_link)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-850 hover:bg-slate-900 text-white rounded-xl text-xs font-bold transition-all flex-shrink-0"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      {award.instagram_link ? 'Edit' : 'Add'} Link
                    </button>
                  </div>
                )}
              </div>
            ))}

            {/* Empty States */}
            {activeTab === 'trophies' && trophies.length === 0 && (
              <div className="text-center py-12 text-slate-500 font-mono">
                <Trophy className="w-12 h-12 mx-auto text-slate-300 mb-3 animate-pulse" />
                <p className="text-xs">No trophies registered for this season context.</p>
              </div>
            )}
            {activeTab === 'awards' && awards.length === 0 && (
              <div className="text-center py-12 text-slate-500 font-mono">
                <AwardIcon className="w-12 h-12 mx-auto text-slate-300 mb-3 animate-pulse" />
                <p className="text-xs">No awards registered for this season context.</p>
              </div>
            )}
            {activeTab === 'player_awards' && playerAwards.length === 0 && (
              <div className="text-center py-12 text-slate-500 font-mono">
                <Activity className="w-12 h-12 mx-auto text-slate-300 mb-3 animate-pulse" />
                <p className="text-xs">No player specific awards registered for this season.</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Helper documentation guide */}
      <div className="console-card bg-amber-500/5 border border-amber-200/60 p-5 shadow-sm rounded-2xl space-y-3">
        <h3 className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
          <HelpCircle className="w-4 h-4 text-amber-500" />
          Instagram Link Formatting Guild
        </h3>
        <ol className="list-decimal list-inside space-y-2 text-xs text-slate-700 leading-relaxed font-mono">
          <li>Open the target Instagram post on a desktop web browser.</li>
          <li>Click the options menu button (<code className="font-bold">•••</code>) on the post.</li>
          <li>Select the <code className="bg-amber-100 px-1 py-0.5 rounded font-bold text-amber-800">Embed</code> option from the dialog.</li>
          <li>Copy the full code snippet or extract the source URL.</li>
          <li>Ensure the URL contains the embed path suffix (e.g., <code className="bg-slate-100 px-1 py-0.5 rounded text-amber-600">/embed</code>).</li>
        </ol>
        <p className="text-[10px] text-slate-450 mt-1">
          Example: <code className="bg-slate-100 px-1.5 py-0.5 rounded text-amber-600">https://www.instagram.com/p/CeFghTyvK9d/embed</code>
        </p>
      </div>

    </div>
  );
}
