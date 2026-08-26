'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useParams } from 'next/navigation';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { ArrowLeft, Plus, Clock, Users, CheckCircle, XCircle, Lock, Play, Pause, Trash2, Pencil, Crown, Star } from 'lucide-react';
import Link from 'next/link';
import AlertModal from '@/components/modals/AlertModal';
import { useModal } from '@/hooks/useModal';
import AuthGuard from '@/components/auth/AuthGuard';

const formatToIST = (dateStr: string) => {
  if (!dateStr) return '—';
  try {
    return new Date(dateStr).toLocaleString('en-US', {
      timeZone: 'Asia/Kolkata',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    }) + ' IST';
  } catch (e) {
    return new Date(dateStr).toLocaleString();
  }
};

const formatToLocalISTInput = (dateStr: string) => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    const istTime = new Date(date.getTime() + 5.5 * 60 * 60 * 1000);
    return istTime.toISOString().substring(0, 16);
  } catch (e) {
    return '';
  }
};

interface CaptainWindow {
  window_id: string;
  league_id: string;
  round_id: string;
  round_number: number | null;
  round_name: string | null;
  window_status: 'pending' | 'open' | 'closed' | 'locked';
  opens_at: string;
  closes_at: string;
  total_teams: number;
  teams_with_captain_set: number;
  created_at: string;
  updated_at: string;
  notes: string | null;
  start_round: number | null;
  end_round: number | null;
}

export default function CaptainWindowsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const params = useParams();
  const leagueId = params?.leagueId as string;

  const [windows, setWindows] = useState<CaptainWindow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  // Create form state
  const [createForm, setCreateForm] = useState({
    round_id: '',
    round_number: '',
    round_name: '',
    opens_at: '',
    closes_at: '',
    notes: '',
    start_round: '',
    end_round: ''
  });

  // Edit form state
  const [showEditModal, setShowEditModal] = useState(false);
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [editingWindow, setEditingWindow] = useState<CaptainWindow | null>(null);
  const [editForm, setEditForm] = useState({
    round_id: '',
    round_number: '',
    round_name: '',
    opens_at: '',
    closes_at: '',
    notes: '',
    start_round: '',
    end_round: ''
  });

  // Expandable list selections state
  const [expandedWindowId, setExpandedWindowId] = useState<string | null>(null);
  const [windowSelections, setWindowSelections] = useState<Record<string, any[]>>({});
  const [loadingSelections, setLoadingSelections] = useState<Record<string, boolean>>({});

  const toggleExpandWindow = async (windowId: string) => {
    if (expandedWindowId === windowId) {
      setExpandedWindowId(null);
      return;
    }
    
    setExpandedWindowId(windowId);
    
    if (windowSelections[windowId]) {
      return; // Already loaded
    }
    
    setLoadingSelections(prev => ({ ...prev, [windowId]: true }));
    try {
      const res = await fetchWithTokenRefresh(`/api/fantasy/captain-windows/${windowId}?_t=${Date.now()}`);
      if (res.ok) {
        const data = await res.json();
        setWindowSelections(prev => ({ ...prev, [windowId]: data.selections || [] }));
      }
    } catch (e) {
      console.error('Error loading window selections:', e);
    } finally {
      setLoadingSelections(prev => ({ ...prev, [windowId]: false }));
    }
  };

  const { alertState, showAlert, closeAlert } = useModal();

  useEffect(() => {
    if (user && leagueId) {
      loadWindows();
    }
  }, [user, leagueId]);

  const loadWindows = async () => {
    setIsLoading(true);
    try {
      const response = await fetchWithTokenRefresh(`/api/fantasy/captain-windows?league_id=${leagueId}&_t=${Date.now()}`);
      if (!response.ok) throw new Error('Failed to fetch captain windows');
      const data = await response.json();
      setWindows(data.windows || []);
    } catch (error) {
      console.error('Error loading captain windows:', error);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'Failed to load captain windows'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateWindow = async () => {
    if (!createForm.round_id || !createForm.opens_at || !createForm.closes_at || !createForm.start_round || !createForm.end_round) {
      showAlert({
        type: 'warning',
        title: 'Missing Fields',
        message: 'Please fill in round ID, start round, end round, opens at, and closes at fields'
      });
      return;
    }

    setIsCreating(true);
    try {
      const response = await fetchWithTokenRefresh('/api/fantasy/captain-windows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          league_id: leagueId,
          round_id: createForm.round_id,
          round_number: createForm.round_number ? parseInt(createForm.round_number) : null,
          round_name: createForm.round_name || null,
          opens_at: new Date(createForm.opens_at + '+05:30').toISOString(),
          closes_at: new Date(createForm.closes_at + '+05:30').toISOString(),
          notes: createForm.notes || null,
          created_by_user_id: user?.uid,
          start_round: parseInt(createForm.start_round),
          end_round: parseInt(createForm.end_round)
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to create captain window');
      }

      showAlert({
        type: 'success',
        title: 'Window Created',
        message: 'Captain selection window created successfully'
      });

      setShowCreateModal(false);
      setCreateForm({
        round_id: '',
        round_number: '',
        round_name: '',
        opens_at: '',
        closes_at: '',
        notes: '',
        start_round: '',
        end_round: ''
      });
      loadWindows();
    } catch (error: any) {
      showAlert({
        type: 'error',
        title: 'Creation Failed',
        message: error.message || 'Failed to create captain window'
      });
    } finally {
      setIsCreating(false);
    }
  };

  const startEditWindow = (window: CaptainWindow) => {
    setEditingWindow(window);
    setEditForm({
      round_id: window.round_id,
      round_number: window.round_number !== null ? String(window.round_number) : '',
      round_name: window.round_name || '',
      opens_at: formatToLocalISTInput(window.opens_at),
      closes_at: formatToLocalISTInput(window.closes_at),
      notes: window.notes || '',
      start_round: window.start_round !== null ? String(window.start_round) : '',
      end_round: window.end_round !== null ? String(window.end_round) : ''
    });
    setShowEditModal(true);
  };

  const handleEditWindow = async () => {
    if (!editingWindow) return;
    if (!editForm.round_id || !editForm.opens_at || !editForm.closes_at || !editForm.start_round || !editForm.end_round) {
      showAlert({
        type: 'warning',
        title: 'Missing Fields',
        message: 'Please fill in round ID, start round, end round, opens at, and closes at fields'
      });
      return;
    }

    setIsSavingEdit(true);
    try {
      const response = await fetchWithTokenRefresh(`/api/fantasy/captain-windows/${editingWindow.window_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          round_id: editForm.round_id,
          round_number: editForm.round_number ? parseInt(editForm.round_number) : null,
          round_name: editForm.round_name || null,
          opens_at: new Date(editForm.opens_at + '+05:30').toISOString(),
          closes_at: new Date(editForm.closes_at + '+05:30').toISOString(),
          notes: editForm.notes || null,
          start_round: parseInt(editForm.start_round),
          end_round: parseInt(editForm.end_round)
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update captain window');
      }

      showAlert({
        type: 'success',
        title: 'Window Updated',
        message: 'Captain selection window updated successfully'
      });

      setShowEditModal(false);
      setEditingWindow(null);
      loadWindows();
    } catch (error: any) {
      showAlert({
        type: 'error',
        title: 'Update Failed',
        message: error.message || 'Failed to update captain window'
      });
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleUpdateStatus = async (windowId: string, newStatus: string) => {
    try {
      const response = await fetchWithTokenRefresh(`/api/fantasy/captain-windows/${windowId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ window_status: newStatus })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to update window status');
      }

      showAlert({
        type: 'success',
        title: 'Status Updated',
        message: `Window status changed to ${newStatus.toUpperCase()}`
      });

      loadWindows();
    } catch (error: any) {
      showAlert({
        type: 'error',
        title: 'Update Failed',
        message: error.message || 'Failed to update window status'
      });
    }
  };

  const handleDeleteWindow = async (windowId: string, teamsWithCaptain: number) => {
    if (teamsWithCaptain > 0) {
      showAlert({
        type: 'warning',
        title: 'Cannot Delete',
        message: 'Cannot delete window - teams have already set captains'
      });
      return;
    }

    if (!confirm('Are you sure you want to delete this captain window?')) {
      return;
    }

    try {
      const response = await fetchWithTokenRefresh(`/api/fantasy/captain-windows/${windowId}`, {
        method: 'DELETE'
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete window');
      }

      showAlert({
        type: 'success',
        title: 'Window Deleted',
        message: 'Captain window deleted successfully'
      });

      loadWindows();
    } catch (error: any) {
      showAlert({
        type: 'error',
        title: 'Deletion Failed',
        message: error.message || 'Failed to delete window'
      });
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-slate-50 border-slate-200 text-slate-700';
      case 'open': return 'bg-emerald-50 border-emerald-200 text-emerald-700';
      case 'closed': return 'bg-rose-50 border-rose-200 text-rose-700';
      case 'locked': return 'bg-blue-50 border-blue-200 text-blue-700';
      default: return 'bg-slate-50 border-slate-200 text-slate-700';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending': return <Clock className="w-4 h-4" />;
      case 'open': return <CheckCircle className="w-4 h-4" />;
      case 'closed': return <XCircle className="w-4 h-4" />;
      case 'locked': return <Lock className="w-4 h-4" />;
      default: return <Clock className="w-4 h-4" />;
    }
  };

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      <AlertModal {...alertState} onClose={closeAlert} />
      
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-6xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Navigation */}
        <div>
          <Link
            href={`/dashboard/committee/fantasy/${leagueId}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Fantasy Console
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">CAPTAIN SELECTION</span>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 uppercase">
                Captain Windows
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1">
                Manage when teams can select captain & vice-captain
              </p>
            </div>
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              Create Window
            </button>
          </div>
        </div>

        {/* Windows List */}
        <div className="space-y-4">
          {windows.length === 0 ? (
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-12 text-center">
              <Clock className="w-16 h-16 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold text-slate-700 uppercase tracking-wide mb-2">No Captain Windows</h3>
              <p className="text-sm text-slate-500 font-mono mb-6">
                Create your first captain selection window to get started
              </p>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center gap-2 px-5 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Create Window
              </button>
            </div>
          ) : (
            windows.map(window => (
              <div
                key={window.window_id}
                className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all"
              >
                <div className="flex flex-col lg:flex-row justify-between gap-4">
                  {/* Window Info */}
                  <div className="flex-1">
                    <div className="flex items-start gap-3 mb-3">
                      <div>
                        <h3 className="text-lg font-black text-slate-900 uppercase tracking-tight">
                          {window.round_name || `Round ${window.round_number || window.round_id}`}
                        </h3>
                        <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider mt-0.5">
                          ID: {window.round_id} {window.start_round !== null && window.end_round !== null && ` • Rounds ${window.start_round}-${window.end_round}`}
                        </p>
                      </div>
                      <span className={`flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[10px] font-black uppercase tracking-wider ${getStatusColor(window.window_status)}`}>
                        {getStatusIcon(window.window_status)}
                        {window.window_status}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-3">
                      <div>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Opens At</p>
                        <p className="text-xs font-bold text-slate-700 font-mono">
                          {formatToIST(window.opens_at)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-1">Closes At</p>
                        <p className="text-xs font-bold text-slate-700 font-mono">
                          {formatToIST(window.closes_at)}
                        </p>
                      </div>
                    </div>

                    {/* Teams Progress */}
                    <div className="flex items-center gap-3">
                      <Users className="w-4 h-4 text-slate-400" />
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <span className="text-[10px] text-slate-500 font-bold uppercase">Teams Set Captain</span>
                          <span className="text-xs font-black text-slate-900">
                            {window.teams_with_captain_set} / {window.total_teams}
                          </span>
                        </div>
                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-emerald-500 transition-all"
                            style={{ width: `${(window.teams_with_captain_set / Math.max(window.total_teams, 1)) * 100}%` }}
                          />
                        </div>
                      </div>
                    </div>

                    {window.notes && (
                      <p className="text-xs text-slate-600 mt-3 italic">
                        {window.notes}
                      </p>
                    )}

                    <div className="mt-4">
                      <button
                        onClick={() => toggleExpandWindow(window.window_id)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 hover:bg-amber-100 text-[10px] font-black text-amber-700 uppercase tracking-wider transition-colors cursor-pointer"
                      >
                        {expandedWindowId === window.window_id ? 'Hide Selections ▲' : 'View Selections ▼'}
                      </button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex lg:flex-col gap-2">
                    <button
                      onClick={() => startEditWindow(window)}
                      className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                      title="Edit Window"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>

                    {window.window_status === 'pending' && (
                      <button
                        onClick={() => handleUpdateStatus(window.window_id, 'open')}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                        title="Open Window"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Open
                      </button>
                    )}

                    {window.window_status === 'open' && (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(window.window_id, 'closed')}
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                          title="Close Window"
                        >
                          <Pause className="w-3.5 h-3.5" />
                          Close
                        </button>
                      </>
                    )}

                    {window.window_status === 'closed' && (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(window.window_id, 'locked')}
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                          title="Lock Window"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          Lock
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(window.window_id, 'open')}
                          className="flex items-center justify-center gap-2 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                          title="Reopen Window"
                        >
                          <Play className="w-3.5 h-3.5" />
                          Reopen
                        </button>
                      </>
                    )}

                    {window.teams_with_captain_set === 0 && (
                      <button
                        onClick={() => handleDeleteWindow(window.window_id, window.teams_with_captain_set)}
                        className="flex items-center justify-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-600 rounded-xl font-bold text-[10px] uppercase tracking-wider transition-all cursor-pointer"
                        title="Delete Window"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Delete
                      </button>
                    )}
                  </div>
                </div>

                {/* Team Selections Expanded View */}
                {expandedWindowId === window.window_id && (
                  <div className="mt-6 border-t border-slate-100 pt-4 space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider">
                      Team Selections ({window.teams_with_captain_set} / {window.total_teams} Set)
                    </h4>
                    {loadingSelections[window.window_id] ? (
                      <div className="py-6 text-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-amber-500 mx-auto" />
                      </div>
                    ) : (windowSelections[window.window_id] || []).length === 0 ? (
                      <p className="text-xs text-slate-500 italic">No selections recorded yet.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {(windowSelections[window.window_id] || []).map((sel: any) => (
                          <div 
                            key={sel.team_id}
                            className={`p-3 rounded-xl border flex items-center justify-between gap-3 ${
                              sel.has_set 
                                ? 'bg-slate-50 border-slate-200' 
                                : 'bg-rose-50/30 border-rose-100/50'
                            }`}
                          >
                            <div>
                              <p className="text-xs font-black text-slate-800 uppercase">{sel.team_name}</p>
                              <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Manager: {sel.owner_name}</p>
                            </div>
                            <div className="text-right text-[10px] uppercase font-bold shrink-0">
                              <div className="flex items-center justify-end gap-1.5">
                                <Crown className="w-3.5 h-3.5 text-amber-500" />
                                <span className={sel.has_set ? 'text-slate-800 font-black' : 'text-slate-400'}>{sel.captain_name}</span>
                              </div>
                              <div className="flex items-center justify-end gap-1.5 mt-1">
                                <Star className="w-3.5 h-3.5 text-blue-500" />
                                <span className={sel.has_set ? 'text-slate-700 font-black' : 'text-slate-400'}>{sel.vice_captain_name}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create Window Modal *      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 sm:p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Create Captain Window</h2>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-2">
                      Round ID *
                    </label>
                    <input
                      type="text"
                      value={createForm.round_id}
                      onChange={(e) => setCreateForm({ ...createForm, round_id: e.target.value })}
                      placeholder="e.g. round_1"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-2">
                      Start Round *
                    </label>
                    <input
                      type="number"
                      value={createForm.start_round}
                      onChange={(e) => setCreateForm({ ...createForm, start_round: e.target.value })}
                      placeholder="e.g. 1"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-2">
                      End Round *
                    </label>
                    <input
                      type="number"
                      value={createForm.end_round}
                      onChange={(e) => setCreateForm({ ...createForm, end_round: e.target.value })}
                      placeholder="e.g. 7"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-2">
                    Round Name
                  </label>
                  <input
                    type="text"
                    value={createForm.round_name}
                    onChange={(e) => setCreateForm({ ...createForm, round_name: e.target.value })}
                    placeholder="e.g. Round 1"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-2">
                      Opens At *
                    </label>
                    <input
                      type="datetime-local"
                      value={createForm.opens_at}
                      onChange={(e) => setCreateForm({ ...createForm, opens_at: e.target.value })}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-2">
                      Closes At *
                    </label>
                    <input
                      type="datetime-local"
                      value={createForm.closes_at}
                      onChange={(e) => setCreateForm({ ...createForm, closes_at: e.target.value })}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={createForm.notes}
                    onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                    placeholder="Any additional notes..."
                    rows={3}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateWindow}
                  disabled={isCreating}
                  className="flex-1 px-6 py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isCreating ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Create Window
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Window Modal */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 sm:p-8">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-black text-slate-900 uppercase tracking-tight">Edit Captain Window</h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <XCircle className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-2">
                      Round ID *
                    </label>
                    <input
                      type="text"
                      value={editForm.round_id}
                      onChange={(e) => setEditForm({ ...editForm, round_id: e.target.value })}
                      placeholder="e.g. round_1"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-2">
                      Start Round *
                    </label>
                    <input
                      type="number"
                      value={editForm.start_round}
                      onChange={(e) => setEditForm({ ...editForm, start_round: e.target.value })}
                      placeholder="e.g. 1"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-2">
                      End Round *
                    </label>
                    <input
                      type="number"
                      value={editForm.end_round}
                      onChange={(e) => setEditForm({ ...editForm, end_round: e.target.value })}
                      placeholder="e.g. 7"
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-2">
                    Round Name
                  </label>
                  <input
                    type="text"
                    value={editForm.round_name}
                    onChange={(e) => setEditForm({ ...editForm, round_name: e.target.value })}
                    placeholder="e.g. Round 1"
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-2">
                      Opens At *
                    </label>
                    <input
                      type="datetime-local"
                      value={editForm.opens_at}
                      onChange={(e) => setEditForm({ ...editForm, opens_at: e.target.value })}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-2">
                      Closes At *
                    </label>
                    <input
                      type="datetime-local"
                      value={editForm.closes_at}
                      onChange={(e) => setEditForm({ ...editForm, closes_at: e.target.value })}
                      className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] text-slate-500 font-extrabold uppercase tracking-wider mb-2">
                    Notes (Optional)
                  </label>
                  <textarea
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                    placeholder="Any additional notes..."
                    rows={3}
                    className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-bold text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 outline-none resize-none"
                  />
                </div>
              </div>

              <div className="flex gap-3 mt-6">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleEditWindow}
                  disabled={isSavingEdit}
                  className="flex-1 px-6 py-3 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {isSavingEdit ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Pencil className="w-4 h-4" />
                      Save Changes
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  
    </AuthGuard>
  );
}
