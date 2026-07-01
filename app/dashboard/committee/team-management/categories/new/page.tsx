'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { AlertCircle, ArrowLeft, CheckCircle, ChevronRight, Info, Layers, Plus, X } from 'lucide-react';

const getRelativeLevels = (priority: number) => {
  if (priority === 1) {
    return [
      { fieldSuffix: 'same_category', label: 'Same Level' },
      { fieldSuffix: 'one_level_diff', label: '1 Level Down' },
      { fieldSuffix: 'two_level_diff', label: '2 Levels Down' },
      { fieldSuffix: 'three_level_diff', label: '3 Levels Down' },
    ];
  } else if (priority === 2) {
    return [
      { fieldSuffix: 'one_level_diff', label: '1 Level Up' },
      { fieldSuffix: 'same_category', label: 'Same Level' },
      { fieldSuffix: 'two_level_diff', label: '1 Level Down' },
      { fieldSuffix: 'three_level_diff', label: '2 Levels Down' },
    ];
  } else if (priority === 3) {
    return [
      { fieldSuffix: 'two_level_diff', label: '2 Levels Up' },
      { fieldSuffix: 'one_level_diff', label: '1 Level Up' },
      { fieldSuffix: 'same_category', label: 'Same Level' },
      { fieldSuffix: 'three_level_diff', label: '1 Level Down' },
    ];
  } else { // priority === 4
    return [
      { fieldSuffix: 'three_level_diff', label: '3 Levels Up' },
      { fieldSuffix: 'two_level_diff', label: '2 Levels Up' },
      { fieldSuffix: 'one_level_diff', label: '1 Level Up' },
      { fieldSuffix: 'same_category', label: 'Same Level' },
    ];
  }
};

export default function NewCategoryPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [formData, setFormData] = useState({
    name: '',
    icon: '',
    priority: '1',
    points_same_category: '8',
    points_one_level_diff: '7',
    points_two_level_diff: '6',
    points_three_level_diff: '5',
    draw_same_category: '4',
    draw_one_level_diff: '3',
    draw_two_level_diff: '3',
    draw_three_level_diff: '2',
    loss_same_category: '1',
    loss_one_level_diff: '1',
    loss_two_level_diff: '1',
    loss_three_level_diff: '0',
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'committee_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetchWithTokenRefresh('/api/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        setError(result.error || 'Failed to create category');
        return;
      }

      router.push('/dashboard/committee/team-management/categories?success=created');
    } catch (err: any) {
      console.error('Error creating category:', err);
      setError(err.message || 'Failed to create category');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-500 uppercase tracking-wider font-extrabold font-mono">Loading categories console...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'committee_admin') {
    return null;
  }

  const priorityNum = parseInt(formData.priority) || 1;

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Decorative glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/committee/team-management/categories"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Categories
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <Layers className="w-6 h-6 text-amber-400" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">SYSTEM CONTROL</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Create New Category
              </h1>
              <p className="text-xs text-slate-500 font-mono mt-1">
                Define player tiers and priority-based point distribution rules.
              </p>
            </div>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="console-card bg-rose-50 border border-rose-200 rounded-3xl p-5 shadow-sm flex items-center justify-between gap-3 text-rose-800">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wide">Error Creating Category</h4>
                <p className="text-[11px] font-bold text-rose-750 uppercase mt-0.5">{error}</p>
              </div>
            </div>
            <button onClick={() => setError(null)} className="text-rose-500 hover:text-rose-750">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Step 1: Basic Information */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <h2 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <Info className="w-4 h-4 text-amber-550" /> Basic Information
              </h2>
              <span className="text-[10px] bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md font-bold uppercase tracking-wide border border-slate-200/50">
                Step 1/2
              </span>
            </div>

            <div className="space-y-6">
              {/* Category Name */}
              <div>
                <label htmlFor="name" className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                  Category Name *
                </label>
                <div className="relative">
                  <select
                    name="name"
                    id="name"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full px-4 py-2.5 pl-11 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all appearance-none cursor-pointer"
                    style={{ paddingLeft: '2.75rem' }}
                  >
                    <option value="" disabled>Select category name...</option>
                    <option value="Red">Red Category</option>
                    <option value="Black">Black Category</option>
                    <option value="Blue">Blue Category</option>
                    <option value="White">White Category</option>
                  </select>
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">
                    <ChevronRight className="w-4 h-4 rotate-90" />
                  </div>
                </div>
                <p className="mt-2 text-[10px] text-slate-500 font-mono">
                  Choose a descriptive name that reflects the skill tier level.
                </p>
              </div>

              <div className="max-w-md">
                {/* Priority Selector */}
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                    Priority Level *
                  </label>
                  <p className="text-[10px] text-slate-500 font-mono mb-4 flex items-start gap-1">
                    <ChevronRight className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />
                    <span>Priority defines skill hierarchy: 1 = Elite, 4 = Beginner</span>
                  </p>
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { num: 1, label: 'Elite', gradient: 'from-amber-500 to-orange-500' },
                      { num: 2, label: 'Advanced', gradient: 'from-blue-500 to-cyan-500' },
                      { num: 3, label: 'Intermediate', gradient: 'from-emerald-500 to-green-500' },
                      { num: 4, label: 'Beginner', gradient: 'from-purple-500 to-pink-500' }
                    ].map(({ num, label, gradient }) => (
                      <button
                        key={num}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, priority: String(num) }))}
                        className={`relative p-4 rounded-xl border transition-all cursor-pointer text-left ${
                          formData.priority === String(num)
                            ? 'border-amber-500 bg-amber-50/20 shadow-sm'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <div className={`text-2xl font-black bg-gradient-to-r ${gradient} bg-clip-text text-transparent mb-1 font-mono`}>
                          {num}
                        </div>
                        <div className="text-xs font-bold text-slate-800 uppercase tracking-wide">{label}</div>
                        {formData.priority === String(num) && (
                          <div className="absolute top-2 right-2 bg-amber-500 rounded-full p-0.5 shadow-sm">
                            <CheckCircle className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                      </button>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>

          {/* Step 2: Points Matrix */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 sm:p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500" /> Points Matrix
                </h2>
                <p className="text-[10px] text-slate-500 font-mono mt-1">Configure points awarded based on match results and opponent strength. Range: -20 to +20 points.</p>
              </div>
            </div>

            <div className="space-y-6">
              {/* Wins Section */}
              <div className="bg-emerald-50/10 border border-emerald-100 rounded-2xl p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-emerald-600 rounded-lg">
                    <CheckCircle className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-sm font-extrabold text-emerald-900 uppercase tracking-wider">Win Points</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {getRelativeLevels(priorityNum).map(({ fieldSuffix, label }) => {
                    const name = `points_${fieldSuffix}`;
                    return (
                      <div key={name}>
                        <label htmlFor={name} className="block text-[10px] font-black uppercase text-slate-550 tracking-wider mb-2">
                          {label}
                        </label>
                        <input
                          type="number"
                          name={name}
                          id={name}
                          min="-20"
                          max="20"
                          value={formData[name as keyof typeof formData]}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 rounded-xl text-center text-sm font-extrabold font-mono"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Draws Section */}
              <div className="bg-blue-50/10 border border-blue-100 rounded-2xl p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-blue-600 rounded-lg">
                    <Info className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-sm font-extrabold text-blue-900 uppercase tracking-wider">Draw Points</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {getRelativeLevels(priorityNum).map(({ fieldSuffix, label }) => {
                    const name = `draw_${fieldSuffix}`;
                    return (
                      <div key={name}>
                        <label htmlFor={name} className="block text-[10px] font-black uppercase text-slate-550 tracking-wider mb-2">
                          {label}
                        </label>
                        <input
                          type="number"
                          name={name}
                          id={name}
                          min="-20"
                          max="20"
                          value={formData[name as keyof typeof formData]}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 rounded-xl text-center text-sm font-extrabold font-mono"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Losses Section */}
              <div className="bg-rose-50/10 border border-rose-100 rounded-2xl p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-1.5 bg-rose-600 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-white" />
                  </div>
                  <h3 className="text-sm font-extrabold text-rose-900 uppercase tracking-wider">Loss Points</h3>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  {getRelativeLevels(priorityNum).map(({ fieldSuffix, label }) => {
                    const name = `loss_${fieldSuffix}`;
                    return (
                      <div key={name}>
                        <label htmlFor={name} className="block text-[10px] font-black uppercase text-slate-550 tracking-wider mb-2">
                          {label}
                        </label>
                        <input
                          type="number"
                          name={name}
                          id={name}
                          min="-20"
                          max="20"
                          value={formData[name as keyof typeof formData]}
                          onChange={handleInputChange}
                          className="w-full px-3 py-2 bg-white border border-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500 rounded-xl text-center text-sm font-extrabold font-mono"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {/* Sticky Actions Bar */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-4 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-3 sticky bottom-4">
            <Link 
              href="/dashboard/committee/team-management/categories"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 font-extrabold rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </Link>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-extrabold rounded-xl text-xs uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                  <span>Creating Category...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Create Category</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
