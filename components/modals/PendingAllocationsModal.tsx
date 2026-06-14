'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import ConfirmModal from './ConfirmModal';
import {
  Activity,
  Trophy,
  Calendar,
  Users,
  CheckCircle,
  AlertTriangle,
  Info,
  X,
  DollarSign
} from 'lucide-react';

interface PendingAllocation {
  id: number;
  team_id: string;
  team_name: string;
  player_id: string;
  player_name: string;
  amount: number;
  phase: 'regular' | 'incomplete';
  created_at?: string;
}

interface AllocationsSummary {
  total_players: number;
  total_spent: number;
  average_bid: number;
  teams_allocated?: number;
  teams_skipped?: number;
}

interface PendingAllocationsModalProps {
  roundId: string;
  isOpen: boolean;
  onClose: () => void;
  onApply: () => void;
  onCancel: () => void;
}

export default function PendingAllocationsModal({
  roundId,
  isOpen,
  onClose,
  onApply,
  onCancel,
}: PendingAllocationsModalProps) {
  const [mounted, setMounted] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [allocations, setAllocations] = useState<PendingAllocation[]>([]);
  const [summary, setSummary] = useState<AllocationsSummary | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);
  const [showApplyConfirm, setShowApplyConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  // Create portal container
  useEffect(() => {
    const container = document.createElement('div');
    container.id = 'pending-allocations-modal-portal';
    container.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; pointer-events: none; z-index: 9999;';
    document.body.appendChild(container);
    setPortalContainer(container);
    setMounted(true);
    
    return () => {
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
      setMounted(false);
    };
  }, []);

  // Handle escape key and body overflow
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !applyLoading && !cancelLoading) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, applyLoading, cancelLoading]);

  // Fetch pending allocations when modal opens
  useEffect(() => {
    if (isOpen && roundId) {
      fetchPendingAllocations();
    }
  }, [isOpen, roundId]);

  const fetchPendingAllocations = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`/api/admin/rounds/${roundId}/pending-allocations`);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch pending allocations');
      }

      setAllocations(data.data.allocations);
      setSummary(data.data.summary);
      
      // Generate warnings based on allocations
      const generatedWarnings: string[] = [];
      const incompleteCount = data.data.allocations.filter((a: PendingAllocation) => a.phase === 'incomplete').length;
      
      if (incompleteCount > 0) {
        generatedWarnings.push(`${incompleteCount} team(s) received incomplete/random allocations`);
      }
      
      if (data.data.summary.teams_skipped && data.data.summary.teams_skipped > 0) {
        generatedWarnings.push(`${data.data.summary.teams_skipped} team(s) did not receive any allocation`);
      }
      
      setWarnings(generatedWarnings);
    } catch (err) {
      console.error('Error fetching pending allocations:', err);
      setError(err instanceof Error ? err.message : 'Failed to load pending allocations');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyClick = () => {
    setShowApplyConfirm(true);
  };

  const handleApplyConfirm = () => {
    setShowApplyConfirm(false);
    setApplyLoading(true);
    onApply();
  };

  const handleCancelClick = () => {
    setShowCancelConfirm(true);
  };

  const handleCancelConfirm = () => {
    setShowCancelConfirm(false);
    setCancelLoading(true);
    onCancel();
  };

  if (!isOpen || !mounted || !portalContainer) return null;

  return (
    <>
      {/* Confirmation Modals */}
      <ConfirmModal
        isOpen={showApplyConfirm}
        onConfirm={handleApplyConfirm}
        onCancel={() => setShowApplyConfirm(false)}
        title="Finalize Allocations?"
        message={`Are you sure you want to finalize these allocations? This will:\n\n• Update team budgets\n• Allocate ${allocations.length} player(s) to teams\n• Create player contracts\n• Make results visible to all teams\n\nThis action cannot be undone.`}
        confirmText="Yes, Finalize"
        cancelText="No, Go Back"
        type="warning"
      />

      <ConfirmModal
        isOpen={showCancelConfirm}
        onConfirm={handleCancelConfirm}
        onCancel={() => setShowCancelConfirm(false)}
        title="Cancel Pending Allocations?"
        message={`Are you sure you want to cancel these pending allocations?\n\nThis will delete all ${allocations.length} pending allocation(s) and reset the round status. You can preview finalization again after canceling.`}
        confirmText="Yes, Cancel"
        cancelText="No, Keep Them"
        type="danger"
      />

      {createPortal(
        <div style={{ pointerEvents: 'auto', position: 'relative', width: '100%', height: '100%' }} className="font-mono">
          {/* Backdrop */}
          <div
            className="bg-black/25 backdrop-blur-sm"
            onClick={!applyLoading && !cancelLoading ? onClose : undefined}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              width: '100%',
              height: '100%',
              cursor: applyLoading || cancelLoading ? 'not-allowed' : 'pointer',
            }}
          />

          {/* Modal */}
          <div 
            className="w-[calc(100%-2rem)] sm:w-auto sm:min-w-[600px] sm:max-w-4xl max-h-[90vh] overflow-y-auto console-card bg-white border border-slate-200/80 rounded-3xl shadow-2xl relative"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              margin: '0',
              maxWidth: 'min(90vw, 896px)',
            }}
            aria-labelledby="modal-title" 
            role="dialog" 
            aria-modal="true"
          >
            {/* Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">SYSTEM CONTROL</span>
                <h3 id="modal-title" className="text-lg font-black text-slate-900 uppercase tracking-tight mt-0.5">
                  Pending Allocation Results
                </h3>
                <p className="text-xs text-slate-550 font-mono mt-1">
                  Review calculated bid allocations before committing to database
                </p>
              </div>
              <button
                onClick={!applyLoading && !cancelLoading ? onClose : undefined}
                className="p-2 hover:bg-slate-50 border border-slate-100/50 rounded-xl transition-colors cursor-pointer"
                disabled={applyLoading || cancelLoading}
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-5">
              {loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mx-auto"></div>
                  <p className="mt-4 text-xs text-slate-555 uppercase tracking-wider font-extrabold font-mono mt-4">Loading pending allocations...</p>
                </div>
              ) : error ? (
                <div className="text-center py-8">
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-rose-50 border border-rose-100 text-rose-600 mb-3">
                    <AlertTriangle className="h-6 w-6" />
                  </div>
                  <p className="text-xs text-rose-600 font-bold">{error}</p>
                </div>
              ) : allocations.length === 0 ? (
                <div className="text-center py-12 text-slate-500">
                  <Info className="h-8 w-8 text-slate-400 mx-auto mb-2" />
                  <p className="text-xs font-bold uppercase">No pending allocations found for this round.</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Allocations Table */}
                  <div>
                    <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider mb-3">Allocations List</h4>
                    <div className="overflow-x-auto border border-slate-200/60 rounded-2xl shadow-sm">
                      <table className="min-w-full divide-y divide-slate-100">
                        <thead className="bg-slate-50/50">
                          <tr>
                            <th scope="col" className="px-4 py-3.5 text-left text-[10px] font-black text-slate-550 uppercase tracking-wider">
                              Player
                            </th>
                            <th scope="col" className="px-4 py-3.5 text-left text-[10px] font-black text-slate-550 uppercase tracking-wider">
                              Team
                            </th>
                            <th scope="col" className="px-4 py-3.5 text-right text-[10px] font-black text-slate-550 uppercase tracking-wider">
                              Amount
                            </th>
                            <th scope="col" className="px-4 py-3.5 text-center text-[10px] font-black text-slate-550 uppercase tracking-wider">
                              Type
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-slate-100">
                          {allocations.map((allocation) => (
                            <tr 
                              key={allocation.id}
                              className={allocation.phase === 'incomplete' ? 'bg-amber-50/20 hover:bg-amber-50/30' : 'hover:bg-slate-50/50'}
                            >
                              <td className="px-4 py-3 whitespace-nowrap text-xs font-bold text-slate-900">
                                {allocation.player_name}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-700">
                                {allocation.team_name}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-xs text-right font-black text-slate-900 font-mono">
                                ${allocation.amount.toLocaleString()}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap text-center">
                                {allocation.phase === 'incomplete' ? (
                                  <span className="inline-flex px-2 py-0.5 bg-amber-50 border border-amber-200 text-amber-700 rounded-md uppercase tracking-wider text-[10px] font-bold">
                                    Incomplete
                                  </span>
                                ) : (
                                  <span className="inline-flex px-2 py-0.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-md uppercase tracking-wider text-[10px] font-bold">
                                    Regular
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Summary Statistics */}
                  {summary && (
                    <div>
                      <h4 className="text-xs font-black uppercase text-slate-800 tracking-wider mb-3">Summary Statistics</h4>
                      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                        <div className="bg-blue-50/50 rounded-2xl px-4 py-3 border border-blue-100">
                          <p className="text-[10px] text-blue-600 font-bold uppercase tracking-wider flex items-center gap-1">
                            <Users className="w-3.5 h-3.5" /> Players
                          </p>
                          <p className="mt-1.5 text-xl font-bold text-blue-900 font-mono">{summary.total_players}</p>
                        </div>
                        <div className="bg-emerald-50/50 rounded-2xl px-4 py-3 border border-emerald-100">
                          <p className="text-[10px] text-emerald-600 font-bold uppercase tracking-wider flex items-center gap-1">
                            <DollarSign className="w-3.5 h-3.5" /> Total Spent
                          </p>
                          <p className="mt-1.5 text-xl font-bold text-emerald-900 font-mono">${summary.total_spent.toLocaleString()}</p>
                        </div>
                        <div className="bg-purple-50/50 rounded-2xl px-4 py-3 border border-purple-100">
                          <p className="text-[10px] text-purple-600 font-bold uppercase tracking-wider flex items-center gap-1">
                            <Trophy className="w-3.5 h-3.5" /> Avg Bid
                          </p>
                          <p className="mt-1.5 text-xl font-bold text-purple-900 font-mono">${summary.average_bid.toLocaleString()}</p>
                        </div>
                        {summary.teams_allocated !== undefined && (
                          <div className="bg-indigo-50/50 rounded-2xl px-4 py-3 border border-indigo-100">
                            <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-wider flex items-center gap-1">
                              <Activity className="w-3.5 h-3.5" /> Allocated
                            </p>
                            <p className="mt-1.5 text-xl font-bold text-indigo-900 font-mono">{summary.teams_allocated}</p>
                          </div>
                        )}
                        {summary.teams_skipped !== undefined && (
                          <div className="bg-orange-50/50 rounded-2xl px-4 py-3 border border-orange-100">
                            <p className="text-[10px] text-orange-600 font-bold uppercase tracking-wider flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" /> Skipped
                            </p>
                            <p className="mt-1.5 text-xl font-bold text-orange-950 font-mono">{summary.teams_skipped}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Warnings */}
                  {warnings.length > 0 && (
                    <div className="bg-amber-50/50 border border-amber-250/50 rounded-2xl p-4 flex gap-3">
                      <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                      <div>
                        <h4 className="text-xs font-black uppercase text-amber-800 tracking-wider">Allocation Warnings</h4>
                        <ul className="mt-1.5 space-y-1 text-xs text-amber-700">
                          {warnings.map((warning, index) => (
                            <li key={index} className="flex items-center gap-1">
                              <span className="font-extrabold">•</span>
                              <span>{warning}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col-reverse sm:flex-row sm:justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={applyLoading || cancelLoading}
                className="inline-flex w-full sm:w-auto justify-center px-5 py-2.5 bg-white border border-slate-200 hover:bg-slate-50 text-slate-705 rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 shadow-sm cursor-pointer disabled:opacity-50"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleCancelClick}
                disabled={applyLoading || cancelLoading || loading}
                className="inline-flex w-full sm:w-auto justify-center px-5 py-2.5 bg-rose-600 hover:bg-rose-700 border border-rose-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 shadow-md cursor-pointer disabled:opacity-50"
              >
                {cancelLoading ? 'Canceling...' : 'Cancel Pending'}
              </button>
              <button
                type="button"
                onClick={handleApplyClick}
                disabled={applyLoading || cancelLoading || loading}
                className="inline-flex w-full sm:w-auto justify-center px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 border border-emerald-700 text-white rounded-xl text-xs font-bold uppercase tracking-wider transition-all duration-200 shadow-md cursor-pointer disabled:opacity-50"
              >
                {applyLoading ? 'Finalizing...' : 'Finalize for Real'}
              </button>
            </div>
          </div>
        </div>,
        portalContainer
      )}
    </>
  );
}
