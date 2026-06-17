'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { getIdToken } from 'firebase/auth';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { 
  ArrowLeft, 
  Calendar, 
  Trophy, 
  Award, 
  Save, 
  AlertCircle, 
  CheckCircle2,
  FileText
} from 'lucide-react';

interface Season {
  id: string;
  name: string;
  short_name: string;
  description: string;
  champion_team_name?: string;
  runner_up_team_name?: string;
  top_scorer_player_name?: string;
  top_scorer_goals?: number;
  best_goalkeeper_player_name?: string;
  best_goalkeeper_clean_sheets?: number;
  most_assists_player_name?: string;
  most_assists_count?: number;
  mvp_player_name?: string;
  potm?: number;
  notes?: string;
}

export default function EditHistoricalSeasonPage() {
  const { user, firebaseUser, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const seasonId = params?.id as string;

  const [season, setSeason] = useState<Season | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const [formData, setFormData] = useState({
    name: '',
    short_name: '',
    description: '',
    champion_team_name: '',
    runner_up_team_name: '',
    top_scorer_player_name: '',
    top_scorer_goals: '',
    best_goalkeeper_player_name: '',
    best_goalkeeper_clean_sheets: '',
    most_assists_player_name: '',
    most_assists_count: '',
    mvp_player_name: '',
    potm: '',
    notes: ''
  });

  // Auth check
  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Fetch season data
  useEffect(() => {
    if (!seasonId || loading || !user) return;
    
    const fetchSeasonData = async () => {
      try {
        setIsLoading(true);
        const response = await fetchWithTokenRefresh(`/api/seasons/historical/${seasonId}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch season data');
        }
        
        const { success, data } = await response.json();
        
        if (!success) {
          throw new Error('Failed to load season');
        }
        
        setSeason(data.season);
        
        // Populate form
        setFormData({
          name: data.season.name || '',
          short_name: data.season.short_name || '',
          description: data.season.description || '',
          champion_team_name: data.season.champion_team_name || '',
          runner_up_team_name: data.season.runner_up_team_name || '',
          top_scorer_player_name: data.season.top_scorer_player_name || '',
          top_scorer_goals: data.season.top_scorer_goals?.toString() || '',
          best_goalkeeper_player_name: data.season.best_goalkeeper_player_name || '',
          best_goalkeeper_clean_sheets: data.season.best_goalkeeper_clean_sheets?.toString() || '',
          most_assists_player_name: data.season.most_assists_player_name || '',
          most_assists_count: data.season.most_assists_count?.toString() || '',
          mvp_player_name: data.season.mvp_player_name || '',
          potm: data.season.potm?.toString() || '',
          notes: data.season.notes || ''
        });
        
        setIsLoading(false);
      } catch (error: any) {
        console.error('Error fetching season:', error);
        setError(error.message);
        setIsLoading(false);
      }
    };

    fetchSeasonData();
  }, [seasonId, loading, user]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!firebaseUser) {
      setError('Not authenticated');
      return;
    }

    try {
      setIsSaving(true);
      setError('');
      setSuccessMessage('');

      const token = await getIdToken(firebaseUser);
      
      // Prepare update data
      const updateData: any = {
        name: formData.name,
        short_name: formData.short_name,
        description: formData.description,
        champion_team_name: formData.champion_team_name,
        runner_up_team_name: formData.runner_up_team_name,
        top_scorer_player_name: formData.top_scorer_player_name,
        best_goalkeeper_player_name: formData.best_goalkeeper_player_name,
        most_assists_player_name: formData.most_assists_player_name,
        mvp_player_name: formData.mvp_player_name,
        notes: formData.notes
      };

      // Add numeric fields only if they have values
      if (formData.top_scorer_goals) {
        updateData.top_scorer_goals = parseInt(formData.top_scorer_goals);
      }
      if (formData.best_goalkeeper_clean_sheets) {
        updateData.best_goalkeeper_clean_sheets = parseInt(formData.best_goalkeeper_clean_sheets);
      }
      if (formData.most_assists_count) {
        updateData.most_assists_count = parseInt(formData.most_assists_count);
      }
      if (formData.potm) {
        updateData.potm = parseInt(formData.potm);
      }

      const response = await fetchWithTokenRefresh(`/api/seasons/historical/${seasonId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updateData)
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to update season');
      }

      console.log('✅ Season updated successfully');
      setSuccessMessage('Season updated successfully!');
      
      // Redirect back to season detail page after 1.5 seconds
      setTimeout(() => {
        router.push(`/dashboard/superadmin/historical-seasons/${seasonId}`);
      }, 1500);
      
    } catch (err: any) {
      console.error('❌ Error updating season:', err);
      setError(err.message || 'Failed to update season');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading || isLoading) {
    return (
      <div className="flex items-center justify-center pt-32">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-500 font-mono text-xs tracking-widest uppercase animate-pulse">Loading season data...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  if (!season) {
    return (
      <div className="flex items-center justify-center pt-32 font-mono">
        <div className="text-center space-y-4">
          <p className="text-slate-600 text-sm">Season not found</p>
          <button
            onClick={() => router.push('/dashboard/superadmin/historical-seasons')}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm"
          >
            Return to Historical Seasons
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-fade-in font-mono">
      {/* Header */}
      <div className="console-card bg-white border border-slate-200/60 p-6 shadow-sm rounded-2xl">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push(`/dashboard/superadmin/historical-seasons/${seasonId}`)}
            className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-600 hover:text-slate-950 transition-all shadow-sm flex-shrink-0"
            title="Back to Season Details"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-500/10 border border-amber-500/20 text-amber-600 rounded-xl">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Edit Season Details
              </h1>
              <p className="text-xs text-slate-500 mt-1">Update champions, awards, and other metadata</p>
            </div>
          </div>
        </div>
      </div>

      {/* Form */}
      <form onSubmit={handleSubmit} className="console-card bg-white border border-slate-200/60 p-8 shadow-sm rounded-2xl space-y-8">
        {/* Success Message */}
        {successMessage && (
          <div className="rounded-2xl p-4 bg-emerald-50 border border-emerald-250 text-emerald-700 text-xs flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-500 flex-shrink-0" />
            <p className="font-semibold">{successMessage}</p>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="rounded-2xl p-4 bg-rose-50 border border-rose-250 text-rose-700 text-xs flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
            <p className="font-semibold">{error}</p>
          </div>
        )}

        {/* Basic Information */}
        <div className="space-y-4">
          <h3 className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider pb-2 border-b border-slate-200/60">
            📋 Basic Information
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                Season Name *
              </label>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleChange}
                required
                className="block w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 font-mono text-xs"
                placeholder="e.g., Season 2024"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                Short Name
              </label>
              <input
                type="text"
                name="short_name"
                value={formData.short_name}
                onChange={handleChange}
                className="block w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 font-mono text-xs"
                placeholder="e.g., S24"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
              Description
            </label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
              className="block w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 font-mono text-xs"
              placeholder="Season description..."
            />
          </div>
        </div>

        {/* Champions */}
        <div className="space-y-4">
          <h3 className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider pb-2 border-b border-slate-200/60">
            🏆 Champions & Runner-up
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                Champion Team
              </label>
              <input
                type="text"
                name="champion_team_name"
                value={formData.champion_team_name}
                onChange={handleChange}
                className="block w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 font-mono text-xs"
                placeholder="Winning team name"
              />
            </div>

            <div className="space-y-2">
              <label className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                Runner-up Team
              </label>
              <input
                type="text"
                name="runner_up_team_name"
                value={formData.runner_up_team_name}
                onChange={handleChange}
                className="block w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 font-mono text-xs"
                placeholder="Second place team"
              />
            </div>
          </div>
        </div>

        {/* Individual Awards */}
        <div className="space-y-6">
          <h3 className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider pb-2 border-b border-slate-200/60">
            ⭐ Individual Awards
          </h3>

          <div className="grid grid-cols-1 gap-6">
            {/* Top Scorer */}
            <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-5 space-y-4">
              <h4 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <span>⚽</span> Top Scorer
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-2">
                  <label className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                    Player Name
                  </label>
                  <input
                    type="text"
                    name="top_scorer_player_name"
                    value={formData.top_scorer_player_name}
                    onChange={handleChange}
                    className="block w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 font-mono text-xs"
                    placeholder="Player name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                    Goals
                  </label>
                  <input
                    type="number"
                    name="top_scorer_goals"
                    value={formData.top_scorer_goals}
                    onChange={handleChange}
                    className="block w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 font-mono text-xs"
                    placeholder="0"
                    min="0"
                  />
                </div>
              </div>
            </div>

            {/* Best Goalkeeper */}
            <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-5 space-y-4">
              <h4 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <span>🧤</span> Best Goalkeeper
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-2">
                  <label className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                    Player Name
                  </label>
                  <input
                    type="text"
                    name="best_goalkeeper_player_name"
                    value={formData.best_goalkeeper_player_name}
                    onChange={handleChange}
                    className="block w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 font-mono text-xs"
                    placeholder="Player name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                    Clean Sheets
                  </label>
                  <input
                    type="number"
                    name="best_goalkeeper_clean_sheets"
                    value={formData.best_goalkeeper_clean_sheets}
                    onChange={handleChange}
                    className="block w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 font-mono text-xs"
                    placeholder="0"
                    min="0"
                  />
                </div>
              </div>
            </div>

            {/* Most Assists */}
            <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-5 space-y-4">
              <h4 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <span>🎯</span> Most Assists
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2 space-y-2">
                  <label className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                    Player Name
                  </label>
                  <input
                    type="text"
                    name="most_assists_player_name"
                    value={formData.most_assists_player_name}
                    onChange={handleChange}
                    className="block w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 font-mono text-xs"
                    placeholder="Player name"
                  />
                </div>
                <div className="space-y-2">
                  <label className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                    Assists
                  </label>
                  <input
                    type="number"
                    name="most_assists_count"
                    value={formData.most_assists_count}
                    onChange={handleChange}
                    className="block w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 font-mono text-xs"
                    placeholder="0"
                    min="0"
                  />
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* MVP */}
              <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-5 space-y-4">
                <h4 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <span>👑</span> MVP
                </h4>
                <div className="space-y-2">
                  <label className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                    Player Name
                  </label>
                  <input
                    type="text"
                    name="mvp_player_name"
                    value={formData.mvp_player_name}
                    onChange={handleChange}
                    className="block w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 font-mono text-xs"
                    placeholder="Player name"
                  />
                </div>
              </div>

              {/* POTM */}
              <div className="bg-slate-50/50 border border-slate-200/60 rounded-xl p-5 space-y-4">
                <h4 className="text-xs font-mono font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <span>🌟</span> Player of the Match (POTM)
                </h4>
                <div className="space-y-2">
                  <label className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                    Player ID
                  </label>
                  <input
                    type="number"
                    name="potm"
                    value={formData.potm}
                    onChange={handleChange}
                    className="block w-full px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 font-mono text-xs"
                    placeholder="Enter Player ID"
                    min="0"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="space-y-4">
          <h3 className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider pb-2 border-b border-slate-200/60">
            📝 Additional Notes
          </h3>
          
          <div className="space-y-2">
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={4}
              className="block w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 font-mono text-xs"
              placeholder="Any additional notes about this season..."
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between gap-4 pt-6 border-t border-slate-250/60">
          <button
            type="button"
            onClick={() => router.push(`/dashboard/superadmin/historical-seasons/${seasonId}`)}
            className="px-5 py-2.5 bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-700 font-mono text-xs font-bold rounded-xl transition-all shadow-sm"
            disabled={isSaving}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="px-6 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2"
          >
            {isSaving ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Saving...</span>
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                <span>Save Changes</span>
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

