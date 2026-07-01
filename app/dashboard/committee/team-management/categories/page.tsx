'use client';

import { Suspense } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { ArrowLeft, Plus, CheckCircle, AlertCircle, Trash2, Edit2, Info, X, Layers } from 'lucide-react';

const getCategoryColor = (name: string) => {
  const normalized = name.trim().toLowerCase();
  if (normalized.includes('red')) return 'red';
  if (normalized.includes('black')) return 'black';
  if (normalized.includes('blue')) return 'blue';
  if (normalized.includes('white')) return 'white';
  return 'slate';
};

const getColorDotStyles = (name: string) => {
  const color = getCategoryColor(name);
  const styles: { [key: string]: string } = {
    red: 'bg-rose-500 border border-rose-600 ring-rose-500/20',
    blue: 'bg-blue-500 border border-blue-600 ring-blue-500/20',
    black: 'bg-slate-800 border border-slate-900 ring-slate-800/20',
    white: 'bg-white border border-slate-350 ring-slate-200/20',
  };
  return styles[color] || 'bg-slate-400 border border-slate-500 ring-slate-400/20';
};

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

interface Category {
  id: string;
  name: string;
  icon?: string;
  priority: number;
  points_same_category: number;
  points_one_level_diff: number;
  points_two_level_diff: number;
  points_three_level_diff: number;
  draw_same_category: number;
  draw_one_level_diff: number;
  draw_two_level_diff: number;
  draw_three_level_diff: number;
  loss_same_category: number;
  loss_one_level_diff: number;
  loss_two_level_diff: number;
  loss_three_level_diff: number;
}

function CategoriesPageContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Modal system
  const { alertState, showAlert, closeAlert } = useModal();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'committee_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const response = await fetchWithTokenRefresh('/api/categories');
        const result = await response.json();
        
        if (result.success) {
          setCategories(result.data);
        }
      } catch (error) {
        console.error('Error fetching categories:', error);
      } finally {
        setIsLoadingCategories(false);
      }
    };

    if (user && user.role === 'committee_admin') {
      fetchCategories();
    }
  }, [user]);

  useEffect(() => {
    const success = searchParams.get('success');
    if (success === 'created') {
      setSuccessMessage('Category created successfully!');
      setTimeout(() => setSuccessMessage(null), 5000);
    } else if (success === 'updated') {
      setSuccessMessage('Category updated successfully!');
      setTimeout(() => setSuccessMessage(null), 5000);
    } else if (success === 'deleted') {
      setSuccessMessage('Category deleted successfully!');
      setTimeout(() => setSuccessMessage(null), 5000);
    }
  }, [searchParams]);

  const handleDelete = async (categoryId: string) => {
    try {
      const response = await fetchWithTokenRefresh(`/api/categories/${categoryId}`, {
        method: 'DELETE',
      });
      
      const result = await response.json();
      
      if (result.success) {
        setCategories(categories.filter(c => c.id !== categoryId));
        setSuccessMessage('Category deleted successfully!');
        setTimeout(() => setSuccessMessage(null), 5000);
      } else {
        showAlert({
          type: 'error',
          title: 'Delete Failed',
          message: `Error: ${result.error}`
        });
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      showAlert({
        type: 'error',
        title: 'Delete Failed',
        message: 'Failed to delete category'
      });
    } finally {
      setDeleteConfirm(null);
    }
  };

  if (loading || isLoadingCategories) {
    return (
      <div className="min-h-screen flex items-center justify-center console-bg font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono font-mono">Loading categories console...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'committee_admin') {
    return null;
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Decorative glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation */}
        <div className="flex justify-between items-center">
          <Link
            href="/dashboard/committee/team-management"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
          
          <Link 
            href="/dashboard/committee/team-management/categories/new" 
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl font-mono text-xs uppercase font-extrabold shadow-sm transition-all cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" /> New Category
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
                Categories Console
              </h1>
              <p className="text-xs text-slate-550 font-mono mt-1">
                Manage player skill categories, colors, and priority-based scoring offsets.
              </p>
            </div>
          </div>
        </div>

        {/* Success Message */}
        {successMessage && (
          <div className="console-card bg-emerald-50/30 border border-emerald-200 rounded-3xl p-5 shadow-sm flex items-center justify-between gap-3 text-emerald-800">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              <p className="text-xs font-bold uppercase tracking-wide">{successMessage}</p>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="text-emerald-500 hover:text-emerald-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Categories Grid/List */}
        {categories.length === 0 ? (
          <div className="text-center py-12 text-slate-400 border border-dashed border-slate-200 rounded-2xl bg-white p-12">
            <div className="w-12 h-12 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-center mx-auto mb-4">
              <Info className="w-6 h-6 text-slate-400" />
            </div>
            <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider mb-1">
              No Categories Found
            </h3>
            <p className="text-xs text-slate-550 font-mono mb-6">
              Create your first skill category to start organizing players into tiers.
            </p>
            <Link
              href="/dashboard/committee/team-management/categories/new"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-mono text-xs uppercase font-extrabold shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4 text-amber-400" /> Create First Category
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {categories.map((category) => (
              <div key={category.id} className="console-card bg-white border border-slate-200/60 rounded-3xl overflow-hidden shadow-sm flex flex-col justify-between hover:shadow-md transition-all duration-350">
                
                {/* Category Header */}
                <div className="bg-slate-50/50 px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`w-3.5 h-3.5 rounded-full ring-4 ${getColorDotStyles(category.name)} flex-shrink-0`} />
                    <div>
                      <h3 className="font-extrabold text-slate-900 text-sm uppercase tracking-wide truncate max-w-[140px]">{category.name}</h3>
                      <span className="inline-flex text-[9px] font-black uppercase bg-slate-200/60 text-slate-750 border border-slate-300 px-1.5 py-0.5 rounded mt-1">
                        Priority {category.priority}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Category Details Breakdown */}
                <div className="p-6 space-y-4">
                  {/* Win Points */}
                  <div className="bg-emerald-50/10 border border-emerald-100/80 rounded-2xl p-3.5">
                    <h4 className="text-[10px] font-black uppercase text-emerald-800 tracking-wider flex items-center gap-1 mb-2">
                      <CheckCircle className="w-3.5 h-3.5 text-emerald-500" /> Win Points
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      {getRelativeLevels(category.priority).map(({ fieldSuffix, label }) => {
                        const val = category[`points_${fieldSuffix}` as keyof Category];
                        return (
                          <div key={fieldSuffix} className="flex items-center justify-between bg-white border border-slate-100 rounded-lg px-2 py-1">
                            <span className="text-slate-500 text-[9px] truncate max-w-[80px]" title={label}>{label}:</span>
                            <span className="font-bold text-emerald-700">{val}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Draw Points */}
                  <div className="bg-blue-50/10 border border-blue-100/80 rounded-2xl p-3.5">
                    <h4 className="text-[10px] font-black uppercase text-blue-800 tracking-wider flex items-center gap-1 mb-2">
                      <Info className="w-3.5 h-3.5 text-blue-500" /> Draw Points
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      {getRelativeLevels(category.priority).map(({ fieldSuffix, label }) => {
                        const val = category[`draw_${fieldSuffix}` as keyof Category];
                        return (
                          <div key={fieldSuffix} className="flex items-center justify-between bg-white border border-slate-100 rounded-lg px-2 py-1">
                            <span className="text-slate-500 text-[9px] truncate max-w-[80px]" title={label}>{label}:</span>
                            <span className="font-bold text-blue-700">{val}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Loss Points */}
                  <div className="bg-rose-50/10 border border-rose-100/80 rounded-2xl p-3.5">
                    <h4 className="text-[10px] font-black uppercase text-rose-800 tracking-wider flex items-center gap-1 mb-2">
                      <AlertCircle className="w-3.5 h-3.5 text-rose-500" /> Loss Points
                    </h4>
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                      {getRelativeLevels(category.priority).map(({ fieldSuffix, label }) => {
                        const val = category[`loss_${fieldSuffix}` as keyof Category];
                        return (
                          <div key={fieldSuffix} className="flex items-center justify-between bg-white border border-slate-100 rounded-lg px-2 py-1">
                            <span className="text-slate-500 text-[9px] truncate max-w-[80px]" title={label}>{label}:</span>
                            <span className="font-bold text-rose-700">{val}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Footer Controls */}
                <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 flex items-center justify-end gap-2.5">
                  <Link
                    href={`/dashboard/committee/team-management/categories/${category.id}/edit`}
                    className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-extrabold text-blue-600 hover:text-blue-700 bg-white border border-slate-200 hover:border-blue-200 rounded-xl uppercase transition-all"
                  >
                    <Edit2 className="w-3.5 h-3.5" /> Edit
                  </Link>
                  {deleteConfirm === category.id ? (
                    <div className="flex gap-1.5">
                      <button
                        onClick={() => handleDelete(category.id)}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-black text-white bg-rose-600 hover:bg-rose-700 rounded-xl uppercase transition-all cursor-pointer"
                      >
                        Confirm
                      </button>
                      <button
                        onClick={() => setDeleteConfirm(null)}
                        className="inline-flex items-center px-3 py-1.5 text-xs font-black text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl uppercase transition-all cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setDeleteConfirm(category.id)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-extrabold text-rose-600 hover:text-rose-700 bg-white border border-slate-200 hover:border-rose-200 rounded-xl uppercase transition-all cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal Component */}
      <AlertModal
        isOpen={alertState.isOpen}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />
    </div>
  );
}

export default function CategoriesPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center console-bg font-mono">
          <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
          <div className="text-center relative z-10">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
            <p className="mt-4 text-xs text-slate-550 uppercase tracking-wider font-extrabold font-mono font-mono">Loading categories console...</p>
          </div>
        </div>
      }
    >
      <CategoriesPageContent />
    </Suspense>
  );
}
