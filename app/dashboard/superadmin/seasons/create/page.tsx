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
  Activity 
} from 'lucide-react';

export default function CreateSeason() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [formData, setFormData] = useState({
    seasonNumber: '',
    year: new Date().getFullYear().toString(),
    description: '',
    type: 'single' as 'single' | 'multi',
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
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-950 text-slate-100 animate-pulse">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="mt-4 text-slate-400 font-mono text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="min-h-screen py-6 sm:py-10 px-4 sm:px-6 bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-950 text-slate-100 animate-fade-in font-sans">
      <div className="container mx-auto max-w-4xl">
        
        {/* Page Header */}
        <header className="mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6 border-b border-white/10 pb-8">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => router.push('/dashboard/superadmin/seasons')}
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 transition-all duration-300 hover:scale-105"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shadow-inner hidden sm:flex">
                <PlusCircle className="w-8 h-8" />
              </div>
              <div>
                <h1 className="text-3xl md:text-5xl font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent mb-2">
                  Create Season
                </h1>
                <p className="text-slate-400 text-sm font-mono">Initialize a new season with customizable draft controls</p>
              </div>
            </div>
          </div>
        </header>

        {/* Error Message */}
        {error && (
          <div className="rounded-2xl p-4 mb-6 bg-rose-500/10 border border-rose-500/20 text-rose-200 font-mono text-sm">
            <p>{error}</p>
          </div>
        )}

        {/* Form Container */}
        <div className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md shadow-xl">
          <form onSubmit={handleSubmit} className="space-y-0">
            <div className="px-8 py-6 bg-white/5 border-b border-white/10">
              <div className="flex items-center gap-2">
                <Calendar className="w-6 h-6 text-indigo-400" />
                <h3 className="text-lg font-bold text-slate-200">Season Configuration</h3>
              </div>
              <p className="mt-1 text-xs text-slate-400 font-mono">Configure the core details of your auction environment</p>
            </div>

            <div className="p-8 space-y-8">
              {/* Season Number */}
              <div className="group">
                <label htmlFor="seasonNumber" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 group-focus-within:text-indigo-400 transition-colors font-mono">
                  Season Number *
                </label>
                <div className="relative">
                  <input
                    type="number"
                    name="seasonNumber"
                    id="seasonNumber"
                    value={formData.seasonNumber}
                    onChange={handleChange}
                    min="1"
                    max="999"
                    className="block w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-900/60 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 sm:text-sm font-mono"
                    placeholder="e.g., 16"
                    required
                  />
                </div>
                <p className="mt-2 text-[10px] text-slate-500 font-mono">
                  {formData.seasonNumber ? `Created as "Season ${formData.seasonNumber}"` : 'The name is auto-derived from this number'}
                </p>
              </div>

              {/* Year */}
              <div className="group">
                <label htmlFor="year" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 group-focus-within:text-indigo-400 transition-colors font-mono">
                  Year *
                </label>
                <div className="relative">
                  <input
                    type="text"
                    name="year"
                    id="year"
                    value={formData.year}
                    onChange={handleChange}
                    className="block w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-900/60 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 sm:text-sm font-mono"
                    placeholder="e.g., 2024"
                    required
                  />
                </div>
                <p className="mt-2 text-[10px] text-slate-500 font-mono">Compact year identification for stats mapping</p>
              </div>

              {/* Season Type */}
              <div className="group">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 font-mono">
                  Season Type *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div
                    onClick={() => setFormData({ ...formData, type: 'single' })}
                    className={`cursor-pointer p-5 rounded-2xl border transition-all duration-200 ${
                      formData.type === 'single'
                        ? 'border-indigo-500 bg-indigo-500/10 shadow-md shadow-indigo-500/10'
                        : 'border-white/10 bg-slate-900/40 hover:bg-slate-900/60 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-slate-200 text-sm">Single Currency Season</h4>
                      {formData.type === 'single' && (
                        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-mono leading-relaxed">Standard bidding engine with one global balance (e.g. legacy seasons 1-15)</p>
                  </div>
                  <div
                    onClick={() => setFormData({ ...formData, type: 'multi' })}
                    className={`cursor-pointer p-5 rounded-2xl border transition-all duration-200 ${
                      formData.type === 'multi'
                        ? 'border-indigo-500 bg-indigo-500/10 shadow-md shadow-indigo-500/10'
                        : 'border-white/10 bg-slate-900/40 hover:bg-slate-900/60 hover:border-white/20'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-bold text-slate-200 text-sm">Multi-Currency & Roster</h4>
                      {formData.type === 'multi' && (
                        <span className="w-2 h-2 rounded-full bg-indigo-400 animate-pulse" />
                      )}
                    </div>
                    <p className="text-xs text-slate-400 font-mono leading-relaxed">Advanced rules (Season 16+): separate dollar and euro wallets for player registration and draft rounds</p>
                  </div>
                </div>
              </div>

              {/* Multi-Season Configurations */}
              {formData.type === 'multi' && (
                <div className="space-y-6 p-6 rounded-2xl bg-white/5 border border-white/10 animate-fade-in">
                  <div className="flex items-center gap-2 mb-2">
                    <Coins className="w-5 h-5 text-indigo-400" />
                    <h4 className="font-bold text-slate-200 text-sm uppercase tracking-wider font-mono"> Roster & Financial Budget Allocations</h4>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono">
                    <div className="group">
                      <label className="block text-xs font-bold text-slate-400 mb-2">Dollar Wallet Budget ($)</label>
                      <input
                        type="number"
                        value={formData.dollar_budget}
                        onChange={(e) => setFormData({ ...formData, dollar_budget: parseInt(e.target.value) || 0 })}
                        className="block w-full px-4 py-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-slate-200 focus:outline-none focus:border-indigo-500 sm:text-xs"
                      />
                      <p className="mt-1 text-[9px] text-slate-500">Maximum budget limit for bidding on registered local players</p>
                    </div>
                    
                    <div className="group">
                      <label className="block text-xs font-bold text-slate-400 mb-2">Euro Wallet Budget (€)</label>
                      <input
                        type="number"
                        value={formData.euro_budget}
                        onChange={(e) => setFormData({ ...formData, euro_budget: parseInt(e.target.value) || 0 })}
                        className="block w-full px-4 py-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-slate-200 focus:outline-none focus:border-indigo-500 sm:text-xs"
                      />
                      <p className="mt-1 text-[9px] text-slate-500">Maximum budget limit for bidding on foreign league players</p>
                    </div>
                    
                    <div className="group">
                      <label className="block text-xs font-bold text-slate-400 mb-2">Required Real Players (Exact count)</label>
                      <input
                        type="number"
                        value={formData.required_real_players}
                        onChange={(e) => setFormData({ ...formData, required_real_players: parseInt(e.target.value) || 0 })}
                        className="block w-full px-4 py-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-slate-200 focus:outline-none focus:border-indigo-500 sm:text-xs"
                      />
                      <p className="mt-1 text-[9px] text-slate-500">Every team roster must contain exactly this count of real members</p>
                    </div>
                    
                    <div className="group">
                      <label className="block text-xs font-bold text-slate-400 mb-2">Max Football Players Limit</label>
                      <input
                        type="number"
                        value={formData.max_football_players}
                        onChange={(e) => setFormData({ ...formData, max_football_players: parseInt(e.target.value) || 0 })}
                        className="block w-full px-4 py-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-slate-200 focus:outline-none focus:border-indigo-500 sm:text-xs"
                      />
                      <p className="mt-1 text-[9px] text-slate-500">Maximum overall team squad size limit</p>
                    </div>
                    
                    <div className="group">
                      <label className="block text-xs font-bold text-slate-400 mb-2">Category Lineup Fine Amount</label>
                      <input
                        type="number"
                        value={formData.category_fine_amount}
                        onChange={(e) => setFormData({ ...formData, category_fine_amount: parseInt(e.target.value) || 0 })}
                        className="block w-full px-4 py-2.5 rounded-xl border border-white/10 bg-slate-900/60 text-slate-200 focus:outline-none focus:border-indigo-500 sm:text-xs"
                      />
                      <p className="mt-1 text-[9px] text-slate-500">Deduction amount for weekly lineup rule infractions</p>
                    </div>
                    
                    <div className="group">
                      <label className="block text-xs font-bold text-slate-400 mb-2">Fine Deduct Currency</label>
                      <select
                        value={formData.category_fine_currency}
                        onChange={(e) => setFormData({ ...formData, category_fine_currency: e.target.value as 'dollar' | 'euro' })}
                        className="block w-full px-4 py-2.5 rounded-xl border border-white/10 bg-slate-900 text-slate-200 focus:outline-none focus:border-indigo-500 sm:text-xs"
                      >
                        <option value="dollar">Dollar Wallet ($)</option>
                        <option value="euro">Euro Wallet (€)</option>
                      </select>
                      <p className="mt-1 text-[9px] text-slate-500">Target wallet for violation penalty collection</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Description */}
              <div className="group">
                <label htmlFor="description" className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 group-focus-within:text-indigo-400 transition-colors font-mono">
                  Description <span className="text-slate-500 font-normal lowercase">(optional)</span>
                </label>
                <div className="relative">
                  <textarea
                    name="description"
                    id="description"
                    rows={4}
                    value={formData.description}
                    onChange={handleChange}
                    className="block w-full px-4 py-3 rounded-xl border border-white/10 bg-slate-900/60 text-slate-200 focus:outline-none focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/20 sm:text-sm resize-none"
                    placeholder="Provide description details, tournament rules, or scheduling briefs..."
                  />
                </div>
                <p className="mt-2 text-[10px] text-slate-500 font-mono">General description text shown to all system participants</p>
              </div>
            </div>

            {/* Footer Form Actions */}
            <div className="px-8 py-6 bg-white/5 border-t border-white/10 flex flex-col sm:flex-row justify-between items-center gap-4 font-mono">
              <button
                type="button"
                onClick={() => router.push('/dashboard/superadmin/seasons')}
                className="inline-flex items-center px-6 py-3 border border-white/10 text-xs font-bold uppercase tracking-wider rounded-xl text-slate-300 bg-white/5 hover:bg-white/10 transition-all duration-200 w-full sm:w-auto justify-center"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex items-center px-8 py-3 border border-transparent text-sm font-semibold rounded-2xl text-white bg-gradient-to-r from-indigo-500 to-blue-600 hover:from-indigo-600 hover:to-blue-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 w-full sm:w-auto justify-center group disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
              >
                {submitting ? 'Creating...' : 'Create Season'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
