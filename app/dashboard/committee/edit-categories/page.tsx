'use client';


import { Check, ChevronDown, Pencil, Search, Tag, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useTournamentContext } from '@/contexts/TournamentContext';
import { usePermissions } from '@/hooks/usePermissions';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import OptimizedImage from '@/components/OptimizedImage';
import AuthGuard from '@/components/auth/AuthGuard';

interface Player {
  id: string;
  player_id: string;
  player_name: string;
  display_name?: string;
  photo_url?: string;
  category: string;
  points: number;
  matches_played: number;
}

interface Category {
  id: string;
  name: string;
  color?: string;
  priority: number;
}

const CATEGORY_STYLES: Record<string, { badge: string; border: string }> = {
  red: { badge: 'bg-rose-100 text-rose-800 border-rose-300', border: 'border-l-rose-400' },
  black: { badge: 'bg-slate-100 text-slate-800 border-slate-300', border: 'border-l-slate-400' },
  blue: { badge: 'bg-blue-100 text-blue-800 border-blue-300', border: 'border-l-blue-400' },
  white: { badge: 'bg-gray-100 text-gray-800 border-gray-300', border: 'border-l-gray-400' },
  iconic: { badge: 'bg-amber-100 text-amber-800 border-amber-300', border: 'border-l-amber-400' },
  legend: { badge: 'bg-purple-100 text-purple-800 border-purple-300', border: 'border-l-purple-400' },
  icon: { badge: 'bg-violet-100 text-violet-800 border-violet-300', border: 'border-l-violet-400' },
  star: { badge: 'bg-cyan-100 text-cyan-800 border-cyan-300', border: 'border-l-cyan-400' },
  rising: { badge: 'bg-emerald-100 text-emerald-800 border-emerald-300', border: 'border-l-emerald-400' },
};

const getCatStyle = (cat?: string) =>
  CATEGORY_STYLES[cat?.toLowerCase() ?? ''] ?? { badge: 'bg-slate-100 text-slate-500 border-slate-200', border: 'border-l-slate-300' };

export default function EditCategoriesPage() {
  const { user, loading } = useAuth();
  const { seasonId: contextSeason } = useTournamentContext();
  const { userSeasonId: permSeasonId } = usePermissions();
  const userSeasonId = contextSeason || permSeasonId;
  const router = useRouter();

  const [players, setPlayers] = useState<Player[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [pendingChanges, setPendingChanges] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveResult, setSaveResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const apiRes = await fetch('/api/categories');
        const { data: apiRows } = await apiRes.json();
        const categoriesData = (apiRows || []).map((row: any) => ({
          id: row.id,
          ...row
        })) as Category[];
        setCategories(categoriesData);
      } catch (error) {
        console.error('Failed to fetch categories:', error);
      }
    };

    if (user?.role === 'committee_admin') {
      fetchCategories();
    }
  }, [user]);

  useEffect(() => {
    const fetchPlayers = async () => {
      if (!userSeasonId) return;
      setIsLoading(true);
      try {
        const res = await fetchWithTokenRefresh(
          `/api/committee/player-categorization?seasonId=${userSeasonId}`
        );
        const data = await res.json();
        if (data.success) {
          // Fetch photos
          const activePlayers: Player[] = data.activePlayers || [];
          const ids = activePlayers.map((p) => p.player_id).filter(Boolean);
          if (ids.length > 0) {
            try {
              const photoRes = await fetchWithTokenRefresh(
                '/api/real-players?' + new URLSearchParams({ playerIds: ids.join(',') })
              );
              if (photoRes.ok) {
                const photoData = await photoRes.json();
                if (photoData.success && photoData.players) {
                  const photoMap = new Map(
                    photoData.players.map((p: any) => [p.player_id, p])
                  );
                  activePlayers.forEach((p) => {
                    const ph = photoMap.get(p.player_id) as any;
                    if (ph) {
                      p.photo_url = ph.photo_url;
                      p.display_name = ph.display_name;
                    }
                  });
                }
              }
            } catch {}
          }
          setPlayers(activePlayers);
        }
      } catch (err) {
        console.error('Failed to fetch players:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchPlayers();
  }, [userSeasonId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const setCategory = (playerId: string, cat: string) => {
    const player = players.find((p) => p.id === playerId);
    if (!player) return;
    if (cat === player.category) {
      // Revert to original if same as DB value
      setPendingChanges((prev) => {
        const copy = new Map(prev);
        copy.delete(playerId);
        return copy;
      });
    } else {
      setPendingChanges((prev) => new Map(prev).set(playerId, cat));
    }
    setOpenDropdown(null);
  };

  const getEffectiveCat = (player: Player) =>
    pendingChanges.get(player.id) ?? player.category ?? '';

  const filteredPlayers = useMemo(() => {
    return players.filter((p) => {
      const cat = getEffectiveCat(p);
      const name = (p.display_name || p.player_name).toLowerCase();
      const matchSearch = !searchTerm || name.includes(searchTerm.toLowerCase());
      const matchCat = filterCat === 'all' || cat?.toLowerCase() === filterCat.toLowerCase();
      return matchSearch && matchCat;
    });
  }, [players, pendingChanges, searchTerm, filterCat]);

  // Category counts
  const catCounts = useMemo(() => {
    const counts: Record<string, number> = { all: players.length };
    players.forEach((p) => {
      const cat = (getEffectiveCat(p) || '').toLowerCase();
      if (cat) counts[cat] = (counts[cat] || 0) + 1;
    });
    return counts;
  }, [players, pendingChanges]);

  const saveChanges = async () => {
    if (pendingChanges.size === 0) return;
    setIsSaving(true);
    setSaveResult(null);
    try {
      const updates = Array.from(pendingChanges.entries()).map(([id, category]) => ({
        id,
        category,
      }));
      const res = await fetchWithTokenRefresh('/api/committee/player-categorization', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ seasonId: userSeasonId, updates }),
      });
      const data = await res.json();
      if (data.success) {
        // Commit pending changes to local state
        setPlayers((prev) =>
          prev.map((p) => {
            const newCat = pendingChanges.get(p.id);
            return newCat ? { ...p, category: newCat } : p;
          })
        );
        setPendingChanges(new Map());
        setSaveResult({ ok: true, msg: `${updates.length} player(s) updated successfully.` });
      } else {
        setSaveResult({ ok: false, msg: data.error || 'Save failed.' });
      }
    } catch (err) {
      setSaveResult({ ok: false, msg: 'Network error. Please try again.' });
    } finally {
      setIsSaving(false);
      setTimeout(() => setSaveResult(null), 4000);
    }
  };

  const discardChanges = () => {
    setPendingChanges(new Map());
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center font-mono">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto" />
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading Players...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'committee_admin') return null;

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-10 px-4 sm:px-6">
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10 space-y-5 font-mono">
        {/* Back */}
        <Link
          href="/dashboard/committee"
          className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all text-xs uppercase tracking-wider font-extrabold flex items-center w-fit"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Committee
        </Link>

        {/* Header */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-violet-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg flex-shrink-0">
                <Tag className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-slate-800">
                  Edit Categories
                </h1>
                <p className="text-xs text-slate-500 uppercase font-semibold mt-0.5">
                  {players.length} players · {userSeasonId} · Change individual player categories
                </p>
              </div>
            </div>

            {/* Save / Discard bar */}
            {pendingChanges.size > 0 && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="px-2 py-1 bg-amber-50 border border-amber-200 text-amber-700 rounded-lg text-[10px] font-black uppercase">
                  {pendingChanges.size} unsaved
                </span>
                <button
                  onClick={discardChanges}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-xl text-xs font-extrabold uppercase text-slate-600 hover:bg-slate-50 transition-all cursor-pointer flex items-center gap-1"
                >
                  <X className="w-3 h-3" /> Discard
                </button>
                <button
                  onClick={saveChanges}
                  disabled={isSaving}
                  className="px-4 py-1.5 bg-slate-800 border border-slate-900 text-amber-400 rounded-xl text-xs font-extrabold uppercase hover:bg-slate-700 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
                >
                  {isSaving ? (
                    <><span className="animate-spin inline-block w-3 h-3 border-b border-amber-400 rounded-full" /> Saving...</>
                  ) : (
                    <><Check className="w-3 h-3" /> Save All</>
                  )}
                </button>
              </div>
            )}
          </div>

          {/* Save result toast */}
          {saveResult && (
            <div className={`mt-3 px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${saveResult.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-700'}`}>
              {saveResult.ok ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
              {saveResult.msg}
            </div>
          )}
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <button
            onClick={() => setFilterCat('all')}
            className={`console-card bg-white border border-slate-200/60 border-l-4 border-l-slate-400 rounded-xl p-3 shadow-sm text-left transition-all cursor-pointer hover:shadow-md ${filterCat === 'all' ? 'ring-2 ring-slate-800/10' : ''}`}
          >
            <p className="text-xl font-black text-slate-800">{catCounts.all || 0}</p>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">All</p>
          </button>
          {categories.map((cat) => {
            const catKey = cat.name.toLowerCase();
            const style = getCatStyle(catKey);
            return (
              <button
                key={cat.id}
                onClick={() => setFilterCat(catKey)}
                className={`console-card bg-white border border-slate-200/60 border-l-4 ${style.border} rounded-xl p-3 shadow-sm text-left transition-all cursor-pointer hover:shadow-md ${filterCat === catKey ? 'ring-2 ring-slate-800/10' : ''}`}
              >
                <p className="text-xl font-black text-slate-800">{catCounts[catKey] || 0}</p>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">{cat.name}</p>
              </button>
            );
          })}
        </div>

        {/* Search + filter row */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              placeholder="Search player name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all"
            />
          </div>
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="py-2 px-3 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500/20 cursor-pointer"
          >
            <option value="all">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.name.toLowerCase()}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {/* Player list */}
        <div ref={dropdownRef} className="space-y-2">
          {filteredPlayers.length === 0 ? (
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-10 text-center shadow-sm">
              <Pencil className="w-8 h-8 text-slate-300 mx-auto mb-3" />
              <p className="text-sm font-extrabold text-slate-500 uppercase">No players found</p>
            </div>
          ) : (
            filteredPlayers.map((player) => {
              const effectiveCat = getEffectiveCat(player);
              const isPending = pendingChanges.has(player.id);
              const style = getCatStyle(effectiveCat);
              const isOpen = openDropdown === player.id;

              return (
                <div
                  key={player.id}
                  className={`console-card bg-white border border-slate-200/60 border-l-4 ${style.border} rounded-xl shadow-sm transition-all ${isPending ? 'ring-2 ring-amber-400/30 bg-amber-50/30' : ''}`}
                  style={{ position: 'relative', zIndex: isOpen ? 50 : 1 }}
                >
                  <div className="flex items-center gap-3 p-3">
                    {/* Photo */}
                    <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 border border-slate-200 bg-slate-100">
                      {player.photo_url ? (
                        <OptimizedImage
                          src={player.photo_url}
                          alt={player.player_name}
                          width={80}
                          height={80}
                          quality={80}
                          className="w-full h-full object-cover"
                          fallback={
                            <div className="w-full h-full flex items-center justify-center bg-slate-800 text-amber-400 font-extrabold text-xs">
                              {player.player_name[0].toUpperCase()}
                            </div>
                          }
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center bg-slate-800 text-amber-400 font-extrabold text-xs">
                          {player.player_name[0].toUpperCase()}
                        </div>
                      )}
                    </div>

                    {/* Name + stats */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-xs font-extrabold text-slate-800 truncate">
                          {player.display_name || player.player_name}
                        </p>
                        {isPending && (
                          <span className="flex-shrink-0 px-1.5 py-0.5 bg-amber-100 text-amber-700 border border-amber-200 rounded text-[8px] font-black uppercase">
                            Modified
                          </span>
                        )}
                      </div>
                      <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">
                        {player.points} pts · {player.matches_played} matches
                      </p>
                    </div>

                    {/* Category dropdown */}
                    <div className="relative flex-shrink-0">
                      <button
                        onClick={() => setOpenDropdown(isOpen ? null : player.id)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-black uppercase cursor-pointer transition-all hover:shadow-sm ${style.badge}`}
                      >
                        {effectiveCat || 'Unset'}
                        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>

                      {isOpen && (
                        <div className="absolute right-0 top-full mt-1.5 w-40 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
                          {categories.map((category) => {
                            const catName = category.name;
                            const cs = getCatStyle(catName);
                            const isCurrent = effectiveCat?.toLowerCase() === catName.toLowerCase();
                            return (

                              <button
                                key={category.id}
                                onClick={() => setCategory(player.id, catName)}
                                className={`w-full flex items-center justify-between px-3 py-2 text-xs font-bold uppercase transition-colors cursor-pointer hover:bg-slate-50 ${isCurrent ? 'bg-slate-50' : ''}`}
                              >
                                <span className={`px-1.5 py-0.5 rounded border text-[9px] font-black ${cs.badge}`}>
                                  {catName}
                                </span>
                                {isCurrent && <Check className="w-3 h-3 text-slate-400" />}
                              </button>

  );
                          })}
                          {/* Revert option if pending */}
                          {isPending && (
                            <button
                              onClick={() => setCategory(player.id, player.category)}
                              className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold uppercase transition-colors cursor-pointer hover:bg-rose-50 text-rose-500 border-t border-slate-100"
                            >
                              <X className="w-3 h-3" /> Revert
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Floating save bar when changes pending */}
        {pendingChanges.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
            <div className="flex items-center gap-3 bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl border border-slate-700">
              <span className="text-xs font-black uppercase text-amber-400">{pendingChanges.size} unsaved change{pendingChanges.size > 1 ? 's' : ''}</span>
              <button
                onClick={discardChanges}
                className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-extrabold uppercase cursor-pointer transition-all"
              >
                Discard
              </button>
              <button
                onClick={saveChanges}
                disabled={isSaving}
                className="px-4 py-1 bg-amber-500 hover:bg-amber-400 text-slate-900 rounded-lg text-xs font-extrabold uppercase cursor-pointer transition-all disabled:opacity-60 flex items-center gap-1.5"
              >
                {isSaving ? 'Saving...' : <><Check className="w-3 h-3" /> Save All</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  
    </AuthGuard>
  );
}
