'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { createSeason } from '@/lib/firebase/seasons';
import { 
  ArrowLeft, 
  Calendar, 
  Settings, 
  Coins, 
  Users, 
  Percent, 
  PlusCircle, 
  Activity,
  AlertCircle,
  Shield,
  FileText
} from 'lucide-react';

export default function CreateSeason() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [formData, setFormData] = useState({
    seasonNumber: '',
    year: new Date().getFullYear().toString(),
    description: '',
    type: 'multi' as 'single' | 'multi',
    dollar_budget: 1000,
    euro_budget: 10000,
    required_real_players: 5, // Exact count required
    max_football_players: 25,
    category_fine_amount: 20,
    category_fine_currency: 'dollar' as 'dollar' | 'euro',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.seasonNumber.trim()) {
      setError('Season number is required');
      return;
    }

    if (!formData.year.trim()) {
      setError('Season year is required');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const seasonNumber = parseInt(formData.seasonNumber);
      
      await createSeason({
        name: `Season ${seasonNumber}`,
        season_number: seasonNumber,
        year: formData.year.trim(),
        type: formData.type,
        ...(formData.type === 'multi' && {
          dollar_budget: formData.dollar_budget,
          euro_budget: formData.euro_budget,
          required_real_players: formData.required_real_players,
          max_football_players: formData.max_football_players,
          category_fine_amount: formData.category_fine_amount,
          category_fine_currency: formData.category_fine_currency,
        }),
      });

      // Redirect to seasons page after successful creation
      router.push('/dashboard/superadmin/seasons');
    } catch (err: any) {
      setError(err.message || 'Failed to create season');
      setSubmitting(false);
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center pt-32">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-500 font-mono text-xs tracking-widest uppercase animate-pulse">Preparing Wizard...</p>
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
      <div className="flex items-center gap-4 pb-6 border-b border-slate-200/60">
        <button
          type="button"
          onClick={() => router.push('/dashboard/superadmin/seasons')}
          className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-600 hover:text-slate-950 transition-all flex-shrink-0 shadow-sm"
          title="Back to Seasons"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Initialize New Season
          </h1>
          <p className="text-xs text-slate-500 font-mono mt-1">
            Set up rules, budgets, and validation parameters for drafts.
          </p>
        </div>
      </div>

      {/* Errors display */}
      {error && (
        <div className="rounded-2xl p-4 bg-rose-50 border border-rose-200 text-rose-700 font-mono text-xs flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Wizard Form Wrapper */}
      <form onSubmit={handleSubmit} className="console-card bg-white border border-slate-200/60 shadow-sm rounded-2xl overflow-hidden space-y-0">
        
        <div className="px-8 py-5 border-b border-slate-200/60 bg-slate-50/50 flex items-center gap-2.5">
          <Settings className="w-5 h-5 text-slate-500" />
          <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">
            Season Configuration Parameters
          </span>
        </div>

        <div className="p-8 space-y-8">
          
          {/* Form Fields Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Season Number */}
            <div className="space-y-2">
              <label htmlFor="seasonNumber" className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                Season Identifier Number *
              </label>
              <input
                type="number"
                name="seasonNumber"
                id="seasonNumber"
                value={formData.seasonNumber}
                onChange={handleChange}
                min="1"
                max="999"
                className="block w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 font-mono text-xs"
                placeholder="e.g., 16"
                required
              />
              <p className="text-[10px] text-slate-450 font-mono">
                Name will compile as: <span className="text-amber-600 font-semibold">{formData.seasonNumber ? `Season ${formData.seasonNumber}` : 'Season X'}</span>
              </p>
            </div>

            {/* Year */}
            <div className="space-y-2">
              <label htmlFor="year" className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                Season Year Calendar *
              </label>
              <input
                type="text"
                name="year"
                id="year"
                value={formData.year}
                onChange={handleChange}
                className="block w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 font-mono text-xs"
                placeholder="e.g., 2026"
                required
              />
              <p className="text-[10px] text-slate-450 font-mono">Compact year identification for stats mapping</p>
            </div>

          </div>

            {/* Advanced Multi-Currency Parameters */}
            <div className="p-6 rounded-2xl bg-slate-50/50 border border-slate-200/60 space-y-6 animate-fade-in">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-3">
                  <Coins className="w-4 h-4 text-amber-600" />
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-700">
                    Roster and Budget Configuration Limits
                  </span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 font-mono text-xs">
                  
                  {/* Dollar Budget */}
                  <div className="space-y-2">
                    <label className="block text-slate-500 font-bold">SSCoin Budget limit (SS)</label>
                    <input
                      type="number"
                      value={formData.dollar_budget}
                      onChange={(e) => setFormData({ ...formData, dollar_budget: parseInt(e.target.value) || 0 })}
                      className="block w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20"
                    />
                    <p className="text-[9px] text-slate-400">Maximum starting balance for local draft rounds.</p>
                  </div>
                  
                  {/* Euro Budget */}
                  <div className="space-y-2">
                    <label className="block text-slate-500 font-bold">ECoin Budget limit (E)</label>
                    <input
                      type="number"
                      value={formData.euro_budget}
                      onChange={(e) => setFormData({ ...formData, euro_budget: parseInt(e.target.value) || 0 })}
                      className="block w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20"
                    />
                    <p className="text-[9px] text-slate-400">Maximum starting balance for foreign league drafts.</p>
                  </div>
                  
                  {/* Required Real Players */}
                  <div className="space-y-2">
                    <label className="block text-slate-500 font-bold">Required Real Players (Exact)</label>
                    <input
                      type="number"
                      value={formData.required_real_players}
                      onChange={(e) => setFormData({ ...formData, required_real_players: parseInt(e.target.value) || 0 })}
                      className="block w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20"
                    />
                    <p className="text-[9px] text-slate-400">Number of live human players each squad must own.</p>
                  </div>
                  
                  {/* Max Football Players */}
                  <div className="space-y-2">
                    <label className="block text-slate-500 font-bold">Max Roster Players Limit</label>
                    <input
                      type="number"
                      value={formData.max_football_players}
                      onChange={(e) => setFormData({ ...formData, max_football_players: parseInt(e.target.value) || 0 })}
                      className="block w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20"
                    />
                    <p className="text-[9px] text-slate-400">Absolute maximum size limit of a single team squad roster.</p>
                  </div>
                  
                  {/* Lineup Fine Amount */}
                  <div className="space-y-2">
                    <label className="block text-slate-500 font-bold">Lineup Rule Penalty Amount</label>
                    <input
                      type="number"
                      value={formData.category_fine_amount}
                      onChange={(e) => setFormData({ ...formData, category_fine_amount: parseInt(e.target.value) || 0 })}
                      className="block w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20"
                    />
                    <p className="text-[9px] text-slate-400">Fine assessed to teams for illegal weekly rosters.</p>
                  </div>
                  
                  {/* Lineup Fine Currency */}
                  <div className="space-y-2">
                    <label className="block text-slate-500 font-bold">Lineup Penalty Wallet Currency</label>
                    <select
                      value={formData.category_fine_currency}
                      onChange={(e) => setFormData({ ...formData, category_fine_currency: e.target.value as 'dollar' | 'euro' })}
                      className="block w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20"
                    >
                      <option value="dollar">SSCoin Wallet (SS)</option>
                      <option value="euro">ECoin Wallet (E)</option>
                    </select>
                    <p className="text-[9px] text-slate-400">Target wallet for violation penalty collection.</p>
                  </div>

                </div>
              </div>

            {/* Description */}
            <div className="space-y-2">
              <label htmlFor="description" className="block text-[11px] font-mono font-bold text-slate-500 uppercase tracking-wider">
                Rules & Description Info <span className="text-slate-400 font-normal lowercase">(optional)</span>
              </label>
              <textarea
                name="description"
                id="description"
                rows={4}
                value={formData.description}
                onChange={handleChange}
                className="block w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 focus:outline-none focus:border-amber-400/50 focus:ring-1 focus:ring-amber-400/20 text-xs resize-none"
                placeholder="Include details about draft format, rules, tournament timelines, or registration details..."
              />
              <p className="text-[10px] text-slate-400 font-mono">Will be shown in detail view cards to all managers.</p>
            </div>

          </div>

          {/* Form Actions */}
          <div className="px-8 py-5 border-t border-slate-200/60 bg-slate-50/50 flex flex-col sm:flex-row justify-between items-center gap-4">
            <button
              type="button"
              onClick={() => router.push('/dashboard/superadmin/seasons')}
              className="w-full sm:w-auto px-6 py-2.5 bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-700 text-xs font-mono font-bold rounded-xl transition-all shadow-sm"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={submitting}
              className="w-full sm:w-auto px-6 py-2.5 bg-slate-800 hover:bg-slate-900 disabled:opacity-50 disabled:cursor-not-allowed text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
            >
              <PlusCircle className="w-4 h-4" />
              {submitting ? 'Creating Season...' : 'Initialize Season'}
            </button>
          </div>

        </form>

      </div>
  );
}
