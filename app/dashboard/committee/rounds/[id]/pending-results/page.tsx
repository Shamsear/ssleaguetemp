'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useState, use } from 'react';
import { useRouter } from 'next/navigation';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import ConfirmModal from '@/components/modals/ConfirmModal';
import Link from 'next/link';
import AuthGuard from '@/components/auth/AuthGuard';

interface PendingAllocation {
  id: number;
  team_id: string;
  team_name: string;
  player_id: string;
  player_name: string;
  amount: number;
  phase: 'regular' | 'incomplete';
  created_at: string;
}

interface PendingAllocationsData {
  allocations: PendingAllocation[];
  summary: {
    total_players: number;
    total_spent: number;
    average_bid: number;
  };
}

interface Round {
  id: string;
  season_id: string;
  position: string;
  round_number: number;
  status: string;
  finalization_mode?: string;
  created_at: string;
  max_bids_per_team: number;
}

export default function PendingResultsPage({ params }: { params: Promise<{ id: string }> }) {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const { id: roundId } = use(params);

  const [round, setRound] = useState<Round | null>(null);
  const [pendingData, setPendingData] = useState<PendingAllocationsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isApplying, setIsApplying] = useState(false);
  const [isCanceling, setIsCanceling] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedTeams, setExpandedTeams] = useState<Set<string>>(new Set());

  const {
    alertState,
    showAlert,
    closeAlert,
    confirmState,
    showConfirm,
    closeConfirm,
  } = useModal();

  // Auth check
  useEffect(() => {
    if (!roundId || !user || user.role !== 'committee_admin') return;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [roundResponse, allocationsResponse] = await Promise.all([
          fetchWithTokenRefresh(`/api/admin/rounds/${roundId}`),
          fetchWithTokenRefresh(`/api/admin/rounds/${roundId}/pending-allocations`)
        ]);

        const roundData = await roundResponse.json();
        const allocationsData = await allocationsResponse.json();

        if (!roundData.success) {
          throw new Error(roundData.error || 'Failed to fetch round details');
        }

        if (!allocationsData.success) {
          throw new Error(allocationsData.error || 'Failed to fetch pending allocations');
        }

        if (!allocationsData.data?.allocations || allocationsData.data.allocations.length === 0) {
          showAlert({
            type: 'info',
            title: 'No Pending Results',
            message: 'This round has no pending allocations. Redirecting to rounds list...'
          });
          setTimeout(() => {
            router.push('/dashboard/committee/rounds');
          }, 2000);
          return;
        }

        setRound(roundData.data);
        setPendingData(allocationsData.data);
      } catch (err) {
        console.error('Error fetching data:', err);
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [roundId, user, router, showAlert]);

  const handleFinalizeForReal = async () => {
    const confirmed = await showConfirm({
      type: 'warning',
      title: 'Finalize Round',
      message: 'Are you sure you want to finalize this round? This will apply all pending allocations, deduct team budgets, and assign players. This action cannot be undone.',
      confirmText: 'Finalize for Real',
      cancelText: 'Cancel'
    });

    if (!confirmed) return;

    setIsApplying(true);

    try {
      const response = await fetchWithTokenRefresh(
        `/api/admin/rounds/${roundId}/apply-pending-allocations`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' }
        }
      );

      const data = await response.json();

      if (data.success) {
        showAlert({
          type: 'success',
          title: 'Round Finalized',
          message: 'The round has been successfully finalized. All allocations have been applied.'
        });

        setTimeout(() => {
          router.push('/dashboard/committee/rounds');
        }, 2000);
      } else {
        showAlert({
          type: 'error',
          title: 'Finalization Failed',
          message: data.error || 'Failed to finalize round. Please try again.'
        });
      }
    } catch (err) {
      console.error('Error finalizing round:', err);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'An unexpected error occurred while finalizing the round.'
      });
    } finally {
      setIsApplying(false);
    }
  };

  const handleCancelPending = async () => {
    const confirmed = await showConfirm({
      type: 'danger',
      title: 'Cancel Pending Results',
      message: 'Are you sure you want to cancel these pending results? All pending allocations will be deleted and you can preview finalization again.',
      confirmText: 'Cancel Pending Results',
      cancelText: 'Keep Results'
    });

    if (!confirmed) return;

    setIsCanceling(true);

    try {
      const response = await fetchWithTokenRefresh(
        `/api/admin/rounds/${roundId}/pending-allocations`,
        {
          method: 'DELETE'
        }
      );

      const data = await response.json();

      if (data.success) {
        showAlert({
          type: 'success',
          title: 'Pending Results Canceled',
          message: 'The pending results have been canceled. Redirecting to rounds list...'
        });

        setTimeout(() => {
          router.push('/dashboard/committee/rounds');
        }, 2000);
      } else {
        showAlert({
          type: 'error',
          title: 'Cancellation Failed',
          message: data.error || 'Failed to cancel pending results. Please try again.'
        });
      }
    } catch (err) {
      console.error('Error canceling pending results:', err);
      showAlert({
        type: 'error',
        title: 'Error',
        message: 'An unexpected error occurred while canceling pending results.'
      });
    } finally {
      setIsCanceling(false);
    }
  };

  const toggleTeam = (teamId: string) => {
    setExpandedTeams((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(teamId)) {
        newSet.delete(teamId);
      } else {
        newSet.add(teamId);
      }
      return newSet;
    });
  };

  const formatCurrency = (amount: number) => {
    return `£${amount.toLocaleString()}`;
  };

  const handleExport = async () => {
    if (!round || !pendingData) return;

    setIsExporting(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();
      
      // Sheet 1: Round Summary
      const summarySheet = workbook.addWorksheet('Round Summary');
      summarySheet.columns = [
        { header: 'Field', key: 'field', width: 25 },
        { header: 'Value', key: 'value', width: 40 }
      ];
      
      summarySheet.addRows([
        { field: 'Round ID', value: round.id },
        { field: 'Position', value: round.position },
        { field: 'Round Number', value: round.round_number },
        { field: 'Status', value: 'Pending Finalization' },
        { field: 'Finalization Mode', value: round.finalization_mode || 'auto' },
        { field: 'Max Bids Per Team', value: round.max_bids_per_team },
        { field: 'Total Players', value: pendingData.summary.total_players },
        { field: 'Total Spent', value: `£${pendingData.summary.total_spent.toLocaleString()}` },
        { field: 'Average Bid', value: `£${Math.round(pendingData.summary.average_bid).toLocaleString()}` },
        { field: 'Created At', value: round.created_at ? new Date(round.created_at).toLocaleString() : 'N/A' }
      ]);
      
      // Style the summary sheet
      summarySheet.getRow(1).font = { bold: true };
      summarySheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE2E8F0' }
      };
      
      // Sheet 2: All Allocations (Sorted by Amount)
      const allocationsSheet = workbook.addWorksheet('All Allocations');
      allocationsSheet.columns = [
        { header: 'Player Name', key: 'playerName', width: 25 },
        { header: 'Team Name', key: 'teamName', width: 25 },
        { header: 'Bid Amount', key: 'amount', width: 15 },
        { header: 'Type', key: 'type', width: 12 },
        { header: 'Created At', key: 'createdAt', width: 20 }
      ];
      
      const sortedAllocations = [...pendingData.allocations].sort((a, b) => b.amount - a.amount);
      sortedAllocations.forEach(allocation => {
        allocationsSheet.addRow({
          playerName: allocation.player_name,
          teamName: allocation.team_name,
          amount: allocation.amount,
          type: allocation.phase === 'incomplete' ? 'Incomplete' : 'Regular',
          createdAt: new Date(allocation.created_at).toLocaleString()
        });
      });
      
      // Style the allocations sheet
      allocationsSheet.getRow(1).font = { bold: true };
      allocationsSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFFEF3C7' }
      };
      
      // Highlight incomplete bids
      allocationsSheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1 && row.getCell(4).value === 'Incomplete') {
          row.eachCell((cell) => {
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFED7AA' }
            };
          });
        }
      });
      
      // Sheet 3: Allocations by Team
      const byTeamSheet = workbook.addWorksheet('By Team');
      byTeamSheet.columns = [
        { header: 'Team Name', key: 'teamName', width: 25 },
        { header: 'Player Name', key: 'playerName', width: 25 },
        { header: 'Bid Amount', key: 'amount', width: 15 },
        { header: 'Type', key: 'type', width: 12 }
      ];
      
      const allocationsByTeam = pendingData.allocations.reduce((acc, allocation) => {
        if (!acc[allocation.team_id]) {
          acc[allocation.team_id] = {
            team_id: allocation.team_id,
            team_name: allocation.team_name,
            allocations: []
          };
        }
        acc[allocation.team_id].allocations.push(allocation);
        return acc;
      }, {} as Record<string, { team_id: string; team_name: string; allocations: PendingAllocation[] }>);
      
      Object.values(allocationsByTeam).forEach(teamData => {
        teamData.allocations.forEach(allocation => {
          byTeamSheet.addRow({
            teamName: teamData.team_name,
            playerName: allocation.player_name,
            amount: allocation.amount,
            type: allocation.phase === 'incomplete' ? 'Incomplete' : 'Regular'
          });
        });
      });
      
      // Style the by team sheet
      byTeamSheet.getRow(1).font = { bold: true };
      byTeamSheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFBFDBFE' }
      };
      
      // Sheet 4: Team Summary
      const teamSummarySheet = workbook.addWorksheet('Team Summary');
      teamSummarySheet.columns = [
        { header: 'Team Name', key: 'teamName', width: 25 },
        { header: 'Players', key: 'players', width: 12 },
        { header: 'Total Spent', key: 'totalSpent', width: 15 },
        { header: 'Has Incomplete', key: 'hasIncomplete', width: 15 }
      ];
      
      Object.values(allocationsByTeam).forEach(teamData => {
        const totalSpent = teamData.allocations.reduce((sum, a) => sum + a.amount, 0);
        const hasIncomplete = teamData.allocations.some(a => a.phase === 'incomplete');
        
        teamSummarySheet.addRow({
          teamName: teamData.team_name,
          players: teamData.allocations.length,
          totalSpent: totalSpent,
          hasIncomplete: hasIncomplete ? 'Yes' : 'No'
        });
      });
      
      // Style the team summary sheet
      teamSummarySheet.getRow(1).font = { bold: true };
      teamSummarySheet.getRow(1).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFD1FAE5' }
      };
      
      // Generate Excel file
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      });
      
      // Download file
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `pending_results_${round.id.substring(0, 8)}_${round.position}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
    } catch (error) {
      console.error('Export error:', error);
      showAlert({
        type: 'error',
        title: 'Export Failed',
        message: 'Failed to export data to Excel. Please try again.'
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (authLoading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center font-mono">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-2 border-amber-400/40 border-t-amber-400 rounded-full animate-spin" />
          <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">Loading pending results…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center font-mono px-4">
        <div className="console-card bg-white border border-rose-200 rounded-3xl p-8 max-w-md w-full text-center shadow-sm">
          <div className="w-12 h-12 bg-rose-50 border border-rose-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h3 className="text-sm font-extrabold uppercase tracking-wide text-slate-900 mb-2">Error Loading Data</h3>
          <p className="text-xs text-slate-500 mb-6">{error}</p>
          <Link
            href="/dashboard/committee/rounds"
            className="inline-flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Rounds
          </Link>
        </div>
      </div>
    );
  }

  if (!round || !pendingData) {
    return null;
  }

  // Organize allocations by team
  const allocationsByTeam = pendingData.allocations.reduce((acc, allocation) => {
    if (!acc[allocation.team_id]) {
      acc[allocation.team_id] = {
        team_id: allocation.team_id,
        team_name: allocation.team_name,
        allocations: []
      };
    }
    acc[allocation.team_id].allocations.push(allocation);
    return acc;
  }, {} as Record<string, { team_id: string; team_name: string; allocations: PendingAllocation[] }>);

  const sortedAllocations = [...pendingData.allocations].sort((a, b) => b.amount - a.amount);

  return (
    <AuthGuard requiredRole="committee_admin">
    <>
      <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
        {/* Ambient glow */}
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

        <div className="max-w-7xl mx-auto relative z-10 space-y-6">

          {/* ── Navigation ── */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Link
              href="/dashboard/committee/rounds"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Rounds
            </Link>

            <button
              onClick={handleExport}
              disabled={isExporting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isExporting ? (
                <>
                  <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Exporting…
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Export to Excel
                </>
              )}
            </button>
          </div>

          {/* ── Header Card ── */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
                <svg className="w-6 h-6 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div>
                <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider">Committee Console</span>
                <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                  Pending Results
                </h1>
                <p className="text-xs text-slate-400 mt-1">
                  Round #{round.id.substring(0, 8)} · {round.position} · Round {round.round_number}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-amber-200 bg-amber-50 text-amber-800 text-[10px] font-bold uppercase tracking-wider">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                Pending Finalization
              </span>
              {round.finalization_mode === 'manual' && (
                <span className="inline-flex px-3 py-1.5 rounded-full border border-blue-200 bg-blue-50 text-blue-800 text-[10px] font-bold uppercase tracking-wider">
                  Manual Mode
                </span>
              )}
            </div>
          </div>

          {/* ── Stats Row ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Total Players</div>
              <div className="text-3xl font-extrabold text-slate-900">{pendingData.summary.total_players}</div>
              <div className="text-[10px] text-slate-400 mt-1">Pending allocation</div>
            </div>
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Total Spent</div>
              <div className="text-3xl font-extrabold text-emerald-700">{formatCurrency(pendingData.summary.total_spent)}</div>
              <div className="text-[10px] text-slate-400 mt-1">Across all teams</div>
            </div>
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-5 shadow-sm">
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">Average Bid</div>
              <div className="text-3xl font-extrabold text-violet-700">{formatCurrency(Math.round(pendingData.summary.average_bid))}</div>
              <div className="text-[10px] text-slate-400 mt-1">Per player</div>
            </div>
          </div>

          {/* ── Round Info ── */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
            <h3 className="text-sm font-extrabold uppercase text-slate-900 tracking-wide flex items-center gap-2 mb-5">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Round Information
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Position', value: round.position },
                { label: 'Round Number', value: `Round ${round.round_number}` },
                { label: 'Max Bids / Team', value: round.max_bids_per_team },
                { label: 'Finalization', value: round.finalization_mode || 'auto' },
              ].map(({ label, value }) => (
                <div key={label} className="p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                  <div className="text-[10px] text-slate-400 font-bold uppercase">{label}</div>
                  <div className="text-sm font-extrabold text-slate-800 mt-1">{value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── All Allocations ── */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
            <h3 className="text-sm font-extrabold uppercase text-slate-900 tracking-wide flex items-center gap-2 mb-5">
              <svg className="w-4 h-4 text-violet-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              All Pending Allocations
              <span className="ml-auto text-[10px] text-slate-400 font-bold">sorted by bid amount</span>
            </h3>

            {/* Mobile Cards */}
            <div className="block md:hidden space-y-3">
              {sortedAllocations.map((allocation, index) => (
                <div
                  key={allocation.id}
                  className={`rounded-2xl p-4 border-l-4 ${
                    allocation.phase === 'incomplete'
                      ? 'border-l-orange-400 bg-orange-50 border border-orange-100'
                      : 'border-l-emerald-400 bg-slate-50 border border-slate-100'
                  }`}
                  style={{ animationDelay: `${index * 20}ms` }}
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="font-extrabold text-slate-900 text-sm">{allocation.player_name}</div>
                    {allocation.phase === 'incomplete' ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200">
                        Incomplete
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200">
                        Regular
                      </span>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white rounded-xl p-2.5 border border-slate-100">
                      <div className="text-[9px] text-slate-400 font-bold uppercase">Team</div>
                      <div className="font-bold text-slate-800 text-xs truncate mt-0.5">{allocation.team_name}</div>
                    </div>
                    <div className="bg-white rounded-xl p-2.5 border border-slate-100">
                      <div className="text-[9px] text-slate-400 font-bold uppercase">Amount</div>
                      <div className="font-extrabold text-slate-900 text-sm font-mono mt-0.5">{formatCurrency(allocation.amount)}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-hidden rounded-2xl border border-slate-100">
              <table className="min-w-full divide-y divide-slate-100">
                <thead>
                  <tr className="bg-slate-50">
                    {['#', 'Player', 'Team', 'Bid Amount', 'Type'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[10px] font-black text-slate-400 uppercase tracking-wider">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {sortedAllocations.map((allocation, index) => (
                    <tr
                      key={allocation.id}
                      className={`hover:bg-slate-50 transition-colors ${allocation.phase === 'incomplete' ? 'bg-orange-50/40' : ''}`}
                    >
                      <td className="px-4 py-3 text-[10px] text-slate-400 font-bold w-10">{index + 1}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="h-8 w-8 flex-shrink-0 bg-slate-800 rounded-xl flex items-center justify-center">
                            <span className="text-[10px] font-bold text-slate-100">
                              {allocation.player_name.substring(0, 2).toUpperCase()}
                            </span>
                          </div>
                          <span className="font-bold text-slate-900 text-xs">{allocation.player_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 font-medium">{allocation.team_name}</td>
                      <td className="px-4 py-3">
                        <span className="text-sm font-extrabold text-slate-900 font-mono">{formatCurrency(allocation.amount)}</span>
                      </td>
                      <td className="px-4 py-3">
                        {allocation.phase === 'incomplete' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200">
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Incomplete
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-100 text-emerald-700 border border-emerald-200">
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

          {/* ── Allocations by Team ── */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
            <h3 className="text-sm font-extrabold uppercase text-slate-900 tracking-wide flex items-center gap-2 mb-5">
              <svg className="w-4 h-4 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              Allocations by Team
            </h3>
            <div className="space-y-3">
              {Object.values(allocationsByTeam).map((teamData) => {
                const isExpanded = expandedTeams.has(teamData.team_id);
                const totalSpent = teamData.allocations.reduce((sum, a) => sum + a.amount, 0);
                const hasIncomplete = teamData.allocations.some(a => a.phase === 'incomplete');

                return (

                  <div
                    key={teamData.team_id}
                    className="border border-slate-100 rounded-2xl overflow-hidden transition-all duration-200 hover:shadow-sm"
                  >
                    <button
                      onClick={() => toggleTeam(teamData.team_id)}
                      className="w-full px-5 py-4 flex items-center justify-between bg-slate-50 hover:bg-slate-100/80 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <div className="h-9 w-9 bg-slate-800 rounded-xl flex items-center justify-center flex-shrink-0">
                          <span className="text-[10px] font-black text-slate-100">
                            {teamData.team_name.substring(0, 2).toUpperCase()}
                          </span>
                        </div>
                        <div className="text-left">
                          <div className="font-extrabold text-slate-900 text-sm">{teamData.team_name}</div>
                          <div className="text-[10px] text-slate-400 font-bold mt-0.5">
                            {teamData.allocations.length} player{teamData.allocations.length !== 1 ? 's' : ''} · {formatCurrency(totalSpent)}
                          </div>
                        </div>
                        {hasIncomplete && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-orange-100 text-orange-700 border border-orange-200">
                            <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                            </svg>
                            Has Incomplete
                          </span>
                        )}
                      </div>
                      <svg
                        className={`w-4 h-4 text-slate-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
                        fill="none" stroke="currentColor" viewBox="0 0 24 24"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {isExpanded && (
                      <div className="px-5 py-4 bg-white border-t border-slate-100 space-y-2">
                        {teamData.allocations.map((allocation) => (
                          <div
                            key={allocation.id}
                            className={`flex items-center justify-between px-4 py-3 rounded-xl border ${
                              allocation.phase === 'incomplete'
                                ? 'bg-orange-50 border-orange-100'
                                : 'bg-slate-50 border-slate-100'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              <div className="h-7 w-7 bg-slate-200 rounded-lg flex items-center justify-center flex-shrink-0">
                                <span className="text-[9px] font-black text-slate-600">
                                  {allocation.player_name.substring(0, 2).toUpperCase()}
                                </span>
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 text-xs">{allocation.player_name}</div>
                                {allocation.phase === 'incomplete' && (
                                  <div className="text-[9px] text-orange-600 font-bold uppercase">Incomplete Bid</div>
                                )}
                              </div>
                            </div>
                            <span className="font-extrabold text-slate-900 text-sm font-mono">{formatCurrency(allocation.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

  );
              })}
            </div>
          </div>

          {/* ── Action Panel ── */}
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
            <h3 className="text-sm font-extrabold uppercase text-slate-900 tracking-wide flex items-center gap-2 mb-2">
              <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              Actions
            </h3>
            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-5">
              Finalizing will deduct team budgets, assign players, and mark the round as completed. This cannot be undone.
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleFinalizeForReal}
                disabled={isApplying || isCanceling}
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-2xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99]"
              >
                {isApplying ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Finalizing…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                    </svg>
                    Finalize for Real
                  </>
                )}
              </button>

              <button
                onClick={handleCancelPending}
                disabled={isApplying || isCanceling}
                className="flex-1 inline-flex items-center justify-center gap-2 px-6 py-3.5 bg-rose-600 hover:bg-rose-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-2xl shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-[1.01] active:scale-[0.99]"
              >
                {isCanceling ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                    </svg>
                    Canceling…
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                    Cancel Pending Results
                  </>
                )}
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* Modals */}
      <AlertModal
        isOpen={alertState.isOpen}
        onClose={closeAlert}
        title={alertState.title}
        message={alertState.message}
        type={alertState.type}
      />
      <ConfirmModal
        isOpen={confirmState.isOpen}
        onConfirm={confirmState.onConfirm || (() => {})}
        onCancel={closeConfirm}
        title={confirmState.title}
        message={confirmState.message}
        confirmText={confirmState.confirmText}
        cancelText={confirmState.cancelText}
        type={confirmState.type}
      />
    </>
  
    </AuthGuard>
  );
}

