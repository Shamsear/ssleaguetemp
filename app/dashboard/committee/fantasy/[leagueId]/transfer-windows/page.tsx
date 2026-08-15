'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Calendar } from 'lucide-react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

interface TransferWindow {
  window_id: string;
  window_name: string;
  opens_at: string;
  closes_at: string;
  is_active: boolean;
  status: 'upcoming' | 'active' | 'closed';
}

export default function TransferWindowsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const leagueId = params?.leagueId as string;

  const [windows, setWindows] = useState<TransferWindow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  
  const [newWindowName, setNewWindowName] = useState('');
  const [newOpensAt, setNewOpensAt] = useState('');
  const [newClosesAt, setNewClosesAt] = useState('');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
      return;
    }
    if (!loading && user && user.role !== 'committee_admin' && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && leagueId) {
      loadWindows();
    }
  }, [user, leagueId]);

  const loadWindows = async () => {
    try {
      const response = await fetchWithTokenRefresh(`/api/fantasy/transfer-windows?league_id=${leagueId}`);
      if (!response.ok) throw new Error('Failed to load windows');
      
      const data = await response.json();
      setWindows(data.windows || []);
    } catch (error) {
      console.error('Error loading windows:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const createWindow = async () => {
    if (!newWindowName || !newOpensAt || !newClosesAt) {
      alert('Please fill in all fields');
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetchWithTokenRefresh('/api/fantasy/transfer-windows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          league_id: leagueId,
          window_name: newWindowName,
          opens_at: newOpensAt,
          closes_at: newClosesAt,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to create window');
      }

      alert('Transfer window created successfully!');
      setNewWindowName('');
      setNewOpensAt('');
      setNewClosesAt('');
      loadWindows();
    } catch (error) {
      console.error('Error creating window:', error);
      alert(error instanceof Error ? error.message : 'Failed to create window');
    } finally {
      setIsCreating(false);
    }
  };

  const toggleWindow = async (windowId: string) => {
    try {
      const response = await fetchWithTokenRefresh(`/api/fantasy/transfer-windows/${windowId}/toggle`, {
        method: 'POST',
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to toggle window');
      }

      loadWindows();
    } catch (error) {
      console.error('Error toggling window:', error);
      alert(error instanceof Error ? error.message : 'Failed to toggle window');
    }
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading transfer windows...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Navigation */}
        <div>
          <Link
            href={`/dashboard/committee/fantasy/${leagueId}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-6">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">FANTASY CONSOLE</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 uppercase">
              Transfer Windows
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Configure and open fantasy squad transfer phases
            </p>
          </div>
          <div className="w-16 h-16 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center text-amber-400 shadow-sm shrink-0">
            <Calendar className="w-8 h-8" />
          </div>
        </div>

        {/* Create Form */}
        <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
          <h2 className="text-xs font-black text-slate-850 uppercase tracking-wider">Create New Transfer Window</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] text-slate-450 font-bold uppercase tracking-wider mb-2">
                Window Name
              </label>
              <input
                type="text"
                value={newWindowName}
                onChange={(e) => setNewWindowName(e.target.value)}
                placeholder="e.g., Week 1 Transfers"
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none text-xs font-bold uppercase"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-450 font-bold uppercase tracking-wider mb-2">
                Opens At
              </label>
              <input
                type="datetime-local"
                value={newOpensAt}
                onChange={(e) => setNewOpensAt(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none text-xs font-bold uppercase"
              />
            </div>
            <div>
              <label className="block text-[10px] text-slate-450 font-bold uppercase tracking-wider mb-2">
                Closes At
              </label>
              <input
                type="datetime-local"
                value={newClosesAt}
                onChange={(e) => setNewClosesAt(e.target.value)}
                className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400 focus:ring-1 focus:ring-amber-400 outline-none text-xs font-bold uppercase"
              />
            </div>
          </div>
          <button
            onClick={createWindow}
            disabled={isCreating}
            className="w-full py-3 px-6 bg-slate-800 border border-slate-900 hover:bg-slate-700 text-amber-400 font-mono font-bold text-xs uppercase tracking-wider rounded-xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
          >
            {isCreating ? 'Creating Window...' : 'Create Transfer Window'}
          </button>
        </div>

        {/* Existing Windows */}
        <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm space-y-4">
          <h2 className="text-xs font-black text-slate-850 uppercase tracking-wider">Configured Windows</h2>
          
          {windows.length === 0 ? (
            <p className="text-center text-slate-400 py-12 text-xs font-bold uppercase italic">No transfer windows created yet</p>
          ) : (
            <div className="space-y-3">
              {windows.map((window) => (
                <div
                  key={window.window_id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 border border-slate-205 rounded-2xl gap-4"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-3">
                      <h3 className="font-bold text-xs uppercase text-slate-800">{window.window_name}</h3>
                      <span className={`px-2 py-0.5 rounded-lg border text-[9px] font-black uppercase tracking-wider ${
                        window.status === 'active' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                        window.status === 'upcoming' ? 'bg-amber-50 border-amber-200 text-amber-700' :
                        'bg-slate-100 border-slate-200 text-slate-600'
                      }`}>
                        {window.status}
                      </span>
                    </div>
                    <div className="text-[10px] font-bold text-slate-450 uppercase flex flex-wrap items-center gap-2">
                      <span>Opens: {new Date(window.opens_at).toLocaleString()}</span>
                      <span className="text-slate-300">•</span>
                      <span>Closes: {new Date(window.closes_at).toLocaleString()}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => toggleWindow(window.window_id)}
                    className={`px-5 py-2.5 rounded-xl font-mono font-bold text-xs uppercase tracking-wider border cursor-pointer transition-all shadow-sm ${
                      window.is_active
                        ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                        : 'bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100'
                    }`}
                  >
                    {window.is_active ? 'Force Close' : 'Force Open'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="console-card bg-slate-50 border border-slate-200/60 p-5 rounded-3xl shadow-sm text-slate-800 space-y-2">
          <h4 className="font-bold text-slate-905 text-xs uppercase tracking-wider">How Transfer Windows Work:</h4>
          <ul className="text-[10px] uppercase font-bold text-slate-500 space-y-1 ml-1">
            <li>• Create windows to define when teams can make transfers</li>
            <li>• Only one window can be active at a time</li>
            <li>• Teams can only swap players during active windows</li>
            <li>• After draft closes, transfers are the only way to modify squads</li>
          </ul>
        </div>
      </div>
    </div>
  );
}