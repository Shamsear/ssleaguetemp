'use client';
import { ArrowLeft, Eye, Trophy, Users, DollarSign, Clock, CheckCircle, XCircle, Minus, Download, FileSpreadsheet } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useParams } from 'next/navigation';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { useModal } from '@/hooks/useModal';
import AlertModal from '@/components/modals/AlertModal';
import AuthGuard from '@/components/auth/AuthGuard';

const IST_TIMEZONE = 'Asia/Kolkata';
const parseAsUTC = (isoOrLocal: string): Date => {
  if (!isoOrLocal) return new Date(0);
  if (/Z$|[+-]\d{2}:\d{2}$/.test(isoOrLocal)) return new Date(isoOrLocal);
  return new Date(isoOrLocal.replace(' ', 'T') + 'Z');
};
const formatISTDisplay = (isoOrLocal: string): string => {
  if (!isoOrLocal) return '—';
  const d = parseAsUTC(isoOrLocal);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', { timeZone: IST_TIMEZONE });
};

export default function DraftDetailedResultsPage() {
  const { user, loading } = useAuth();
  const params = useParams();
  const leagueId = params?.leagueId as string;

  const [isLoading, setIsLoading] = useState(true);
  const [league, setLeague] = useState<any>(null);
  const [slots, setSlots] = useState<any[]>([]);
  const [teams, setTeams] = useState<any[]>([]);
  const [totals, setTotals] = useState<any>(null);
  const [viewMode, setViewMode] = useState<'by-slot' | 'by-team'>('by-slot');
  const [selectedSlot, setSelectedSlot] = useState<number | null>(null);
  const [selectedTeam, setSelectedTeam] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'won' | 'lost'>('all');
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isExporting, setIsExporting] = useState(false);

  const { alertState, showAlert, closeAlert } = useModal();

  const loadData = useCallback(async () => {
    if (!leagueId) return;
    setIsLoading(true);
    try {
      const res = await fetchWithTokenRefresh(`/api/fantasy/draft/all-bids?league_id=${leagueId}`);
      if (!res.ok) throw new Error('Failed to load results');
      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setLeague(data.league);
      setSlots(data.slots);
      setTeams(data.teams);
      setTotals(data.totals);

      if (data.slots.length > 0 && selectedSlot === null) {
        setSelectedSlot(data.slots[0].slot_index);
      }
      if (data.teams.length > 0 && !selectedTeam) {
        setSelectedTeam(data.teams[0].team_id);
      }
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Error', message: err.message });
    } finally {
      setIsLoading(false);
    }
  }, [leagueId, selectedSlot, selectedTeam]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Loading results...</p>
        </div>
      </div>
    );
  }

  const currentSlot = slots.find(s => s.slot_index === selectedSlot);
  const currentTeam = teams.find(t => t.team_id === selectedTeam);

  const downloadPlayerCard = async (player: any, withLogo: boolean = false) => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Background gradient
    const grad = ctx.createLinearGradient(0, 0, 0, 1080);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 1080, 1080);

    // Gold accent bar at top
    ctx.fillStyle = '#D4AF37';
    ctx.fillRect(0, 0, 1080, 6);

    // Load images
    const loadImage = (url: string): Promise<HTMLImageElement> =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load: ${url}`));
        img.src = url;
      });

    try {
      // Draw player image (center, large)
      const playerImg = await loadImage(player.player_image);
      const imgSize = 500;
      const imgX = (1080 - imgSize) / 2;
      const imgY = 80;

      // Circle clip for player image
      ctx.save();
      ctx.beginPath();
      ctx.arc(imgX + imgSize / 2, imgY + imgSize / 2, imgSize / 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(playerImg, imgX, imgY, imgSize, imgSize);
      ctx.restore();

      // Gold ring around player image
      ctx.strokeStyle = '#D4AF37';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(imgX + imgSize / 2, imgY + imgSize / 2, imgSize / 2 + 3, 0, Math.PI * 2);
      ctx.stroke();

      // Player name
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 48px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(player.player_name.toUpperCase(), 1080 / 2, 650);

      // Position + Real Team
      ctx.fillStyle = '#94a3b8';
      ctx.font = 'bold 28px sans-serif';
      ctx.fillText(`${player.position} • ${player.real_team_name}`, 1080 / 2, 700);

      // "SOLD TO" caption
      ctx.fillStyle = '#D4AF37';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText('SOLD TO', 1080 / 2, 790);

      // Fantasy team name
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 44px sans-serif';
      ctx.fillText(player.team_name.toUpperCase(), 1080 / 2, 850);

      // Bid amount
      ctx.fillStyle = '#34d399';
      ctx.font = 'bold 56px sans-serif';
      ctx.fillText(`${player.purchase_price} Cr`, 1080 / 2, 940);

      // Team logo (optional)
      if (withLogo && player.team_logo) {
        try {
          const logoImg = await loadImage(player.team_logo);
          const logoSize = 120;
          ctx.drawImage(logoImg, 1080 - logoSize - 40, 40, logoSize, logoSize);
        } catch {}
      }

      // Watermark
      ctx.fillStyle = '#475569';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText('FREEBUFF FANTASY', 1080 / 2, 1040);

      // Download
      const link = document.createElement('a');
      link.download = `${player.player_name.replace(/\s+/g, '_')}_sold.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    } catch (err: any) {
      console.error('Download failed:', err);
      showAlert({ type: 'error', title: 'Download Failed', message: 'Could not generate player card' });
    }
  };

  const handleFinalizeSlot = async (slotIdx: number) => {
    if (!confirm(`Finalize Slot ${slotIdx}? This will award players/teams and deduct budgets. This cannot be undone.`)) return;
    setIsFinalizing(true);
    try {
      const res = await fetchWithTokenRefresh('/api/fantasy/draft/finalize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league_id: leagueId, slot_index: slotIdx, action: 'apply' }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Finalize failed');
      showAlert({ type: 'success', title: 'Slot Finalized!', message: `Slot ${slotIdx} bids have been applied successfully.` });
      loadData();
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Finalize Failed', message: err.message });
    } finally {
      setIsFinalizing(false);
    }
  };

  const exportToExcel = async () => {
    setIsExporting(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const workbook = new ExcelJS.Workbook();

      // Sheet 1: All Winners Summary
      const summarySheet = workbook.addWorksheet('All Winners');
      summarySheet.columns = [
        { header: 'Slot', key: 'slot', width: 10 },
        { header: 'Slot Name', key: 'slotName', width: 20 },
        { header: 'Player/Team', key: 'target', width: 25 },
        { header: 'Type', key: 'type', width: 12 },
        { header: 'Awarded To', key: 'team', width: 25 },
        { header: 'Price (Cr)', key: 'price', width: 12 },
        { header: 'Status', key: 'status', width: 12 },
      ];
      summarySheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      summarySheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } };

      for (const slot of slots) {
        // From final awarded
        for (const a of slot.final_awarded) {
          summarySheet.addRow({
            slot: slot.slot_index, slotName: slot.slot_name,
            target: a.player_name, type: 'Player',
            team: a.team_name, price: a.purchase_price, status: 'Finalized',
          });
        }
        // From preview (if not yet finalized)
        if (slot.preview && slot.final_awarded.length === 0) {
          for (const w of slot.preview.winning_bids) {
            summarySheet.addRow({
              slot: slot.slot_index, slotName: slot.slot_name,
              target: w.target_name, type: w.bid_type,
              team: w.team_name, price: w.bid_amount, status: 'Preview',
            });
          }
        }
        // Real teams awarded
        for (const a of slot.final_team_awarded) {
          summarySheet.addRow({
            slot: slot.slot_index, slotName: slot.slot_name,
            target: a.supported_team_name, type: 'Real Team',
            team: a.team_name, price: 0, status: 'Finalized',
          });
        }
      }
      summarySheet.eachRow((row: any, rowNumber: any) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
          };
        });
      });

      // Per-slot sheets with all bids
      for (const slot of slots) {
        const sheetName = slot.slot_name.replace(/[\\/?*:[\]]/g, '').slice(0, 31);
        const ws = workbook.addWorksheet(sheetName);
        ws.columns = [
          { header: 'Target', key: 'target', width: 25 },
          { header: 'Type', key: 'type', width: 12 },
          { header: 'Team', key: 'team', width: 25 },
          { header: 'Owner', key: 'owner', width: 20 },
          { header: 'Bid (Cr)', key: 'bid', width: 12 },
          { header: 'Priority', key: 'priority', width: 10 },
          { header: 'Status', key: 'status', width: 12 },
        ];
        ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };

        for (const target of slot.targets) {
          for (const bid of target.bids) {
            const isWinner = slot.preview?.winning_bids?.some((w: any) => w.target_id === target.target_id && w.team_name === bid.team_name);
            ws.addRow({
              target: target.target_name, type: target.bid_type,
              team: bid.team_name, owner: bid.owner_name,
              bid: bid.bid_amount, priority: bid.priority,
              status: isWinner ? 'WON' : bid.status === 'lost' ? 'LOST' : 'PENDING',
            });
          }
        }
        ws.eachRow((row: any, rowNumber: any) => {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            };
          });
          // Color code status
          if (rowNumber > 1) {
            const statusCell = ws.getRow(rowNumber).getCell('status');
            if (statusCell.value === 'WON') {
              statusCell.font = { bold: true, color: { argb: 'FF059669' } };
            } else if (statusCell.value === 'LOST') {
              statusCell.font = { bold: true, color: { argb: 'FFDC2626' } };
            }
          }
        });
      }

      // Per-team sheets
      for (const team of teams) {
        const sheetName = team.team_name.replace(/[\\/?*:[\]]/g, '').slice(0, 31);
        const ws = workbook.addWorksheet(sheetName);
        ws.columns = [
          { header: 'Slot', key: 'slot', width: 10 },
          { header: 'Target', key: 'target', width: 25 },
          { header: 'Type', key: 'type', width: 12 },
          { header: 'Bid (Cr)', key: 'bid', width: 12 },
          { header: 'Priority', key: 'priority', width: 10 },
          { header: 'Status', key: 'status', width: 12 },
        ];
        ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E40AF' } };

        for (const bid of team.bids) {
          ws.addRow({
            slot: bid.slot_index, target: bid.target_id, type: bid.bid_type,
            bid: bid.bid_amount, priority: bid.priority,
            status: bid.status === 'won' ? 'WON' : bid.status === 'lost' ? 'LOST' : 'PENDING',
          });
        }
        ws.addRow({});
        ws.addRow({ target: 'Budget Remaining', bid: team.budget_remaining });
        ws.addRow({ target: 'Budget Spent', bid: team.budget_spent });
        ws.getRow(ws.lastRow.number - 1).font = { bold: true };
        ws.getRow(ws.lastRow.number).font = { bold: true };
        ws.eachRow((row: any, rowNumber: any) => {
          row.eachCell((cell) => {
            cell.border = {
              top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
              right: { style: 'thin', color: { argb: 'FFE2E8F0' } },
            };
          });
        });
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Fantasy_Draft_Results_${leagueId}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      showAlert({ type: 'success', title: 'Exported!', message: 'Excel file downloaded with all results' });
    } catch (err: any) {
      showAlert({ type: 'error', title: 'Export Failed', message: err.message });
    } finally {
      setIsExporting(false);
    }
  };

  const copyWinnerText = (name: string, teamName: string, price: number) => {
    const text = `${name} sold to ${teamName} for ${price} Cr`;
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text)
        .then(() => showAlert({ type: 'success', title: 'Copied!', message: text }))
        .catch(() => {});
    }
  };

  const downloadAllSlotCards = async (withLogo: boolean = false) => {
    if (!currentSlot || currentSlot.final_awarded.length === 0) return;
    for (const a of currentSlot.final_awarded) {
      await downloadPlayerCard(a, withLogo);
      await new Promise(r => setTimeout(r, 500));
    }
    showAlert({ type: 'success', title: 'Downloaded!', message: `${currentSlot.final_awarded.length} player card(s) downloaded` });
  };

  const statusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-blue-50 border-blue-200 text-blue-700';
      case 'closed': return 'bg-rose-50 border-rose-200 text-rose-700';
      case 'active': return 'bg-emerald-50 border-emerald-200 text-emerald-700';
      case 'pending': return 'bg-slate-100 border-slate-200 text-slate-600';
      default: return 'bg-slate-100 border-slate-200 text-slate-600';
    }
  };

  const bidStatusColor = (status: string) => {
    switch (status) {
      case 'won': return 'bg-emerald-50 border-emerald-200 text-emerald-700';
      case 'lost': return 'bg-rose-50 border-rose-200 text-rose-700';
      default: return 'bg-slate-100 border-slate-200 text-slate-600';
    }
  };

  return (
    <AuthGuard requiredRole="committee_admin">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
      <AlertModal {...alertState} onClose={closeAlert} />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Navigation */}
        <div>
          <Link
            href={`/dashboard/committee/fantasy/${leagueId}`}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-center gap-6">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">FANTASY CONSOLE</span>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5 uppercase">
              Draft Results
            </h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              Full bid breakdown — preview & final results per slot
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={exportToExcel}
              disabled={isExporting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-400 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer disabled:cursor-not-allowed"
            >
              {isExporting ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white"></div>
                  Exporting...
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  Export to Excel
                </>
              )}
            </button>
            <div className="w-16 h-16 bg-slate-800 border border-slate-700 rounded-2xl flex items-center justify-center text-amber-400 shadow-sm shrink-0">
              <Trophy className="w-8 h-8" />
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        {totals && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-slate-800 text-amber-400 border border-slate-900 rounded-xl">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider">Total Bids</p>
                <h3 className="text-xl font-black text-slate-900">{totals.total_bids}</h3>
              </div>
            </div>
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-slate-800 text-emerald-400 border border-slate-900 rounded-xl">
                <CheckCircle className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[9px] text-slate-455 font-bold uppercase tracking-wider">Players Awarded</p>
                <h3 className="text-xl font-black text-slate-900">{totals.total_players_awarded}</h3>
              </div>
            </div>
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-slate-800 text-blue-400 border border-slate-900 rounded-xl">
                <DollarSign className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[9px] text-slate-455 font-bold uppercase tracking-wider">Budget Spent</p>
                <h3 className="text-xl font-black text-slate-900">{totals.total_budget_spent} Cr</h3>
              </div>
            </div>
            <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm flex items-center gap-4">
              <div className="p-3 bg-slate-800 text-purple-400 border border-slate-900 rounded-xl">
                <Trophy className="w-5 h-5" />
              </div>
              <div>
                <p className="text-[9px] text-slate-455 font-bold uppercase tracking-wider">Teams</p>
                <h3 className="text-xl font-black text-slate-900">{totals.total_teams}</h3>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════ BALANCE CHECKER ═══════════ */}
        {teams.some((t: any) => t.budget_check && t.budget_check.commitments.length > 0) && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
              <DollarSign className="w-4 h-4 text-amber-600" />
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">Budget Checker</h3>
              <span className="text-[9px] text-slate-400 font-bold ml-1">Pending slots only</span>
              {teams.some((t: any) => t.budget_check?.is_overdrawn) && (
                <span className="ml-auto px-2 py-0.5 bg-rose-100 text-rose-700 text-[9px] font-black rounded-lg uppercase tracking-wider border border-rose-200">
                  ⚠ Budget Overdrawn
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-100">
                    <th className="text-left py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-wider">Team</th>
                    <th className="text-right py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-wider">Remaining</th>
                    <th className="text-right py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-wider">Pending</th>
                    <th className="text-right py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-wider">Projected</th>
                    <th className="text-left py-2 px-3 text-[9px] font-black text-slate-500 uppercase tracking-wider">Pending Slots</th>
                  </tr>
                </thead>
                <tbody>
                  {teams
                    .filter((t: any) => t.budget_check && t.budget_check.commitments.length > 0)
                    .sort((a: any, b: any) => (a.budget_check?.projected_remaining ?? 0) - (b.budget_check?.projected_remaining ?? 0))
                    .map((t: any) => {
                      const bc = t.budget_check;
                      return (
                        <tr key={t.team_id} className={`border-b border-slate-50 ${bc.is_overdrawn ? 'bg-rose-50' : ''}`}>
                          <td className="py-2 px-3">
                            <span className="font-bold text-slate-800">{t.team_name}</span>
                          </td>
                          <td className="py-2 px-3 text-right font-bold text-slate-600">{bc.projected_remaining + bc.total_pending_spend} Cr</td>
                          <td className="py-2 px-3 text-right font-bold text-amber-600">-{bc.total_pending_spend} Cr</td>
                          <td className="py-2 px-3 text-right">
                            <span className={`font-black ${bc.is_overdrawn ? 'text-rose-600' : bc.projected_remaining < 20 ? 'text-amber-600' : 'text-emerald-600'}`}>
                              {bc.projected_remaining} Cr
                            </span>
                            {bc.is_overdrawn && <span className="ml-1 text-rose-500">⚠</span>}
                          </td>
                          <td className="py-2 px-3">
                            <div className="flex flex-wrap gap-1">
                              {bc.commitments.map((c: any, i: number) => (
                                <span key={i} className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-slate-100 rounded text-[8px] font-bold text-slate-600 border border-slate-200">
                                  S{c.slot_index} {c.slot_name}: <span className="text-amber-600">{c.bid_amount} Cr</span>
                                </span>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
            {teams.filter((t: any) => t.budget_check?.is_overdrawn).length > 0 && (
              <div className="mt-4 p-3 bg-rose-50 border border-rose-200 rounded-xl">
                <p className="text-[10px] font-black text-rose-700 uppercase tracking-wider">
                  ⚠ {teams.filter((t: any) => t.budget_check?.is_overdrawn).length} team(s) will exceed their budget if these previews are finalized!
                </p>
              </div>
            )}
          </div>
        )}

        {/* View Mode Toggle */}
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('by-slot')}
            className={`px-4 py-2 rounded-xl font-bold font-mono text-xs uppercase tracking-wider transition-all border cursor-pointer ${
              viewMode === 'by-slot'
                ? 'bg-slate-800 text-amber-400 border-slate-900 shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200/60'
            }`}
          >
            By Slot
          </button>
          <button
            onClick={() => setViewMode('by-team')}
            className={`px-4 py-2 rounded-xl font-bold font-mono text-xs uppercase tracking-wider transition-all border cursor-pointer ${
              viewMode === 'by-team'
                ? 'bg-slate-800 text-amber-400 border-slate-900 shadow-sm'
                : 'bg-white text-slate-700 hover:bg-slate-50 border-slate-200/60'
            }`}
          >
            By Team
          </button>
        </div>

        {/* ═══════════ BY SLOT VIEW ═══════════ */}
        {viewMode === 'by-slot' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Slot Selector */}
            <div>
              <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm sticky top-4">
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-4">Slots</h2>
                <div className="space-y-2">
                  {slots.map((slot) => (
                    <button
                      key={slot.slot_index}
                      onClick={() => { setSelectedSlot(slot.slot_index); setFilterStatus('all'); }}
                      className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                        selectedSlot === slot.slot_index
                          ? 'bg-slate-800 border-slate-900 text-amber-400 shadow-sm'
                          : 'bg-slate-50 border-slate-100 hover:border-slate-200 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-xs uppercase">{slot.slot_name}</div>
                        {slot.round && (
                          <span className={`px-2 py-0.5 text-[8px] font-black rounded-full uppercase ${statusColor(slot.round.status)}`}>
                            {slot.round.status}
                          </span>
                        )}
                      </div>
                      <div className={`text-[10px] font-bold uppercase mt-1 ${
                        selectedSlot === slot.slot_index ? 'text-amber-300' : 'text-slate-500'
                      }`}>
                        {slot.total_bids} bids • {slot.unique_targets} targets
                      </div>
                      {slot.preview && (
                        <div className={`text-[9px] font-bold uppercase mt-0.5 ${
                          selectedSlot === slot.slot_index ? 'text-emerald-300' : 'text-emerald-600'
                        }`}>
                          ✓ Preview ready
                        </div>
                      )}
                      {slot.final_awarded.length > 0 && (
                        <div className={`text-[9px] font-bold uppercase mt-0.5 ${
                          selectedSlot === slot.slot_index ? 'text-blue-300' : 'text-blue-600'
                        }`}>
                          ✓ Finalized ({slot.final_awarded.length} awarded)
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Slot Details */}
            <div className="lg:col-span-3 space-y-6">
              {currentSlot && (
                <>
                  {/* Slot Info Card */}
                  <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4 pb-4 border-b border-slate-100">
                      <div>
                        <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                          {currentSlot.slot_name} (Slot {currentSlot.slot_index})
                        </h2>
                        <p className="text-[10px] text-slate-450 font-bold uppercase mt-0.5">
                          Base Price: {currentSlot.base_price} Cr
                        </p>
                      </div>
                      {currentSlot.round && (
                        <div className="flex flex-wrap gap-2">
                          <span className={`px-2.5 py-1 border text-[9px] font-black rounded-lg uppercase tracking-wider ${statusColor(currentSlot.round.status)}`}>
                            {currentSlot.round.status}
                          </span>
                          <span className={`px-2.5 py-1 border text-[9px] font-black rounded-lg uppercase tracking-wider ${
                            currentSlot.round.finalization_mode === 'manual'
                              ? 'bg-amber-50 border-amber-200 text-amber-700'
                              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
                          }`}>
                            ⚙️ {currentSlot.round.finalization_mode}
                          </span>
                        </div>
                      )}
                    </div>

                    {currentSlot.round && (
                      <div className="flex gap-6 text-[10px] font-bold uppercase text-slate-500">
                        {currentSlot.round.opens_at && (
                          <div>Opens: <span className="text-slate-700">{formatISTDisplay(currentSlot.round.opens_at)} IST</span></div>
                        )}
                        {currentSlot.round.closes_at && (
                          <div>Closes: <span className="text-rose-600">{formatISTDisplay(currentSlot.round.closes_at)} IST</span></div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Preview Results */}
                  {currentSlot.preview && (
                    <div className="console-card bg-blue-50/50 border border-blue-200/60 p-6 rounded-3xl shadow-sm">
                      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-blue-100">
                        <Eye className="w-4 h-4 text-blue-600" />
                        <h3 className="text-xs font-black text-blue-800 uppercase tracking-wider">Preview Results</h3>
                        <span className="text-[9px] text-blue-500 font-bold ml-auto">
                          {formatISTDisplay(currentSlot.preview.created_at)}
                        </span>
                        <button
                          onClick={async () => {
                            try {
                              const res = await fetchWithTokenRefresh('/api/fantasy/draft/finalize', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ league_id: leagueId, slot_index: selectedSlot, action: 'preview' }),
                              });
                              const data = await res.json();
                              if (!res.ok || !data.success) throw new Error(data.error || 'Preview failed');
                              showAlert({ type: 'success', title: 'Preview Refreshed', message: `Slot ${selectedSlot} preview updated` });
                              loadData();
                            } catch (err: any) {
                              showAlert({ type: 'error', title: 'Preview Failed', message: err.message });
                            }
                          }}
                          className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white text-[9px] font-black rounded-lg uppercase tracking-wider transition-colors"
                        >
                          🔄 Re-Preview
                        </button>
                      </div>

                      {/* All targets with win/loss status */}
                      {currentSlot.preview.all_targets && currentSlot.preview.all_targets.length > 0 ? (
                        <div className="space-y-3">
                          {currentSlot.preview.all_targets.map((t: any, i: number) => (
                            <div key={i} className={`bg-white border rounded-xl p-4 flex items-center justify-between ${
                              t.status === 'won' ? 'border-emerald-200' : t.status === 'lost' ? 'border-rose-200' : 'border-slate-200'
                            }`}>
                              <div>
                                <div className="flex items-center gap-2">
                                  <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                    t.bid_type === 'player' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                  }`}>
                                    {t.bid_type}
                                  </span>
                                  <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                    t.status === 'won' ? 'bg-emerald-100 text-emerald-700' :
                                    t.status === 'lost' ? 'bg-rose-100 text-rose-700' :
                                    'bg-slate-100 text-slate-600'
                                  }`}>
                                    {t.status === 'won' ? '✓ Won' : t.status === 'lost' ? '✗ Lost' : 'Pending'}
                                  </span>
                                </div>
                                <h4 className="font-bold text-slate-800 text-xs uppercase mt-1">{t.target_name}</h4>
                                {t.winning_bid && (
                                  <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                                    Awarded to: <span className="text-amber-600">{t.winning_bid.team_name}</span> for <span className="text-emerald-600">{t.winning_bid.bid_amount} Cr</span>
                                  </p>
                                )}
                              </div>                              {t.winning_bid && (
                                <div className="flex items-center gap-2 shrink-0">
                                  <span className="font-black text-emerald-600 text-sm">{t.winning_bid.bid_amount} Cr</span>
                                  <button
                                    onClick={() => copyWinnerText(t.target_name, t.winning_bid.team_name, t.winning_bid.bid_amount)}
                                    className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
                                    title="Copy sale text"
                                  >
                                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                                  </button>
                                  {t.bid_type === 'player' && (
                                    <button
                                      onClick={() => downloadPlayerCard({
                                        player_image: t.player_photo || t.winning_bid?.player_photo || `/images/players/${t.target_id}.webp`,
                                        player_name: t.target_name,
                                        position: '', real_team_name: '',
                                        team_name: t.winning_bid.team_name, team_logo: null,
                                        purchase_price: t.winning_bid.bid_amount,
                                      }, false)}
                                      className="w-7 h-7 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
                                      title="Download card"
                                    >
                                      <Download className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-[10px] text-blue-500 font-bold uppercase text-center py-4">No bids in preview</p>
                      )}

                      <div className="flex items-center justify-between mt-4 pt-3 border-t border-blue-100">
                        <div className="flex gap-4 text-[10px] font-bold text-blue-600">
                          <span>Players: {currentSlot.preview.total_players_drafted}</span>
                          <span>Teams: {currentSlot.preview.total_teams_drafted}</span>
                          <span>Budget: {currentSlot.preview.total_budget_spent} Cr</span>
                        </div>
                        {currentSlot.preview.winning_bids.length > 0 && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => {
                                const winners = currentSlot.preview.all_targets.filter((t: any) => t.status === 'won' && t.bid_type === 'player');
                                winners.forEach((t: any, i: number) => {
                                  setTimeout(() => downloadPlayerCard({
                                    player_image: t.player_photo || t.winning_bid?.player_photo || `/images/players/${t.target_id}.webp`,
                                    player_name: t.target_name,
                                    position: '', real_team_name: '',
                                    team_name: t.winning_bid.team_name, team_logo: null,
                                    purchase_price: t.winning_bid.bid_amount,
                                  }, false), i * 500);
                                });
                              }}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-[9px] font-black rounded-lg uppercase tracking-wider transition-colors"
                            >
                              <Download className="w-3 h-3 inline mr-1" /> Download All
                            </button>
                            <button
                              onClick={() => {
                                const winners = currentSlot.preview.all_targets.filter((t: any) => t.status === 'won' && t.bid_type === 'player');
                                winners.forEach((t: any, i: number) => {
                                  setTimeout(() => downloadPlayerCard({
                                    player_image: t.player_photo || t.winning_bid?.player_photo || `/images/players/${t.target_id}.webp`,
                                    player_name: t.target_name,
                                    position: '', real_team_name: '',
                                    team_name: t.winning_bid.team_name, team_logo: null,
                                    purchase_price: t.winning_bid.bid_amount,
                                  }, true), i * 500);
                                });
                              }}
                              className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-black rounded-lg uppercase tracking-wider transition-colors"
                            >
                              <Download className="w-3 h-3 inline mr-1" /> With Logo
                            </button>
                            <button
                              onClick={() => handleFinalizeSlot(selectedSlot!)}
                              disabled={isFinalizing}
                              className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-white text-[9px] font-black rounded-lg uppercase tracking-wider transition-colors"
                            >
                              {isFinalizing ? 'Finalizing...' : '✓ Finalize'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Final Awarded */}
                  {currentSlot.final_awarded.length > 0 && (
                    <div className="console-card bg-emerald-50/50 border border-emerald-200/60 p-6 rounded-3xl shadow-sm">
                      <div className="flex items-center justify-between mb-4 pb-3 border-b border-emerald-100">
                        <div className="flex items-center gap-2">
                          <Trophy className="w-4 h-4 text-emerald-600" />
                          <h3 className="text-xs font-black text-emerald-800 uppercase tracking-wider">Final Awarded</h3>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => downloadAllSlotCards(false)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-[9px] font-black rounded-lg uppercase tracking-wider transition-colors"
                          >
                            <Download className="w-3 h-3" /> Download All
                          </button>
                          <button
                            onClick={() => downloadAllSlotCards(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[9px] font-black rounded-lg uppercase tracking-wider transition-colors"
                          >
                            <Download className="w-3 h-3" /> With Logo
                          </button>
                        </div>
                      </div>
                      <div className="space-y-3">
                        {currentSlot.final_awarded.map((a: any, i: number) => (
                          <div key={i} className="bg-white border border-emerald-100 rounded-xl p-4 flex items-center gap-4">
                            {/* Player Image */}
                            <div className="relative shrink-0">
                              <img
                                src={a.player_image}
                                alt={a.player_name}
                                className="w-16 h-16 rounded-full object-cover border-2 border-emerald-300"
                                onError={(e: any) => {
                                  (e.target as HTMLImageElement).src = '/images/player-placeholder.png';
                                }}
                              />
                              {a.team_logo && (
                                <img
                                  src={a.team_logo}
                                  alt="Team Logo"
                                  className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full border-2 border-white object-cover"
                                  onError={(e: any) => {
                                    (e.target as HTMLImageElement).style.display = 'none';
                                  }}
                                />
                              )}
                            </div>
                            {/* Player Info */}
                            <div className="flex-1 min-w-0">
                              <h4 className="font-bold text-slate-800 text-xs uppercase">{a.player_name}</h4>
                              <p className="text-[10px] text-slate-500 font-bold uppercase mt-0.5">
                                {a.position} • {a.real_team_name}
                              </p>
                              <p className="text-[10px] text-amber-600 font-bold uppercase mt-0.5">
                                Sold to: {a.team_name} for {a.purchase_price} Cr
                              </p>
                            </div>
                            {/* Copy + Download buttons */}
                            <div className="flex gap-1.5 shrink-0">
                              <button
                                onClick={() => copyWinnerText(a.player_name, a.team_name, a.purchase_price)}
                                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
                                title="Copy sale text"
                              >
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                              </button>
                              <button
                                onClick={() => downloadPlayerCard(a, false)}
                                className="w-8 h-8 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center transition-colors"
                                title="Download card"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => downloadPlayerCard(a, true)}
                                className="w-8 h-8 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-600 flex items-center justify-center transition-colors"
                                title="Download card with team logo"
                              >
                                <Download className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {currentSlot.final_team_awarded.length > 0 && (
                    <div className="console-card bg-purple-50/50 border border-purple-200/60 p-6 rounded-3xl shadow-sm">
                      <div className="flex items-center gap-2 mb-4 pb-3 border-b border-purple-100">
                        <Trophy className="w-4 h-4 text-purple-600" />
                        <h3 className="text-xs font-black text-purple-800 uppercase tracking-wider">Real Teams Awarded</h3>
                      </div>
                      <div className="space-y-3">
                        {currentSlot.final_team_awarded.map((a: any, i: number) => (
                          <div key={i} className="bg-white border border-purple-100 rounded-xl p-4 flex items-center justify-between">
                            <div>
                              <h4 className="font-bold text-slate-800 text-xs uppercase">{a.supported_team_name}</h4>
                              <p className="text-[10px] text-amber-600 font-bold uppercase mt-0.5">→ {a.team_name}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* All Bids for this Slot */}
                  <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
                    <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-100">
                      <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider">
                        All Bids ({currentSlot.total_bids})
                      </h3>
                      <div className="flex gap-1">
                        {(['all', 'won', 'lost'] as const).map((f) => (
                          <button
                            key={f}
                            onClick={() => setFilterStatus(f)}
                            className={`px-2.5 py-1 text-[9px] font-black rounded-lg uppercase tracking-wider border transition-all cursor-pointer ${
                              filterStatus === f
                                ? 'bg-slate-800 text-white border-slate-900'
                                : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {f}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-6">
                      {currentSlot.targets
                        .filter(target => {
                          if (filterStatus === 'all') return true;
                          return target.bids.some((b: any) => b.status === filterStatus);
                        })
                        .map((target: any) => (
                        <div key={target.target_id} className="border border-slate-100 rounded-2xl overflow-hidden">
                          <div className="bg-slate-50 px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                target.bid_type === 'player' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                              }`}>
                                {target.bid_type}
                              </span>
                              <span className="font-bold text-xs uppercase text-slate-800">{target.target_name}</span>
                            </div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase">{target.total_bids} bid{target.total_bids !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="divide-y divide-slate-50">
                            {target.bids
                              .filter((b: any) => filterStatus === 'all' || b.status === filterStatus)
                              .map((bid: any) => (
                              <div key={bid.bid_id} className="px-4 py-3 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                                <div className="flex items-center gap-3">
                                  <span className="text-[9px] font-black text-slate-400 w-4">#{bid.priority}</span>
                                  <div>
                                    <p className="font-bold text-xs uppercase text-slate-800">{bid.team_name}</p>
                                    <p className="text-[9px] text-slate-400 font-bold uppercase">{bid.owner_name}</p>
                                  </div>
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="font-black text-sm text-slate-700">{bid.bid_amount} Cr</span>
                                  <span className={`px-2 py-0.5 text-[8px] font-black rounded-lg uppercase tracking-wider border ${bidStatusColor(bid.status)}`}>
                                    {bid.status === 'won' ? '✓ Won' : bid.status === 'lost' ? '✗ Lost' : bid.status}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* ═══════════ BY TEAM VIEW ═══════════ */}
        {viewMode === 'by-team' && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Team Selector */}
            <div>
              <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm sticky top-4">
                <h2 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-4">Teams</h2>
                <div className="space-y-2">
                  {teams.map((team: any) => (
                    <button
                      key={team.team_id}
                      onClick={() => setSelectedTeam(team.team_id)}
                      className={`w-full text-left p-4 rounded-xl border transition-all cursor-pointer ${
                        selectedTeam === team.team_id
                          ? 'bg-slate-800 border-slate-900 text-amber-400 shadow-sm'
                          : 'bg-slate-50 border-slate-100 hover:border-slate-200 hover:bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="font-bold text-xs uppercase truncate">{team.team_name}</div>
                        {team.draft_submitted && (
                          <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-black uppercase ${
                            selectedTeam === team.team_id
                              ? 'bg-amber-400 text-slate-900'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            ✓
                          </span>
                        )}
                      </div>
                      <div className={`text-[10px] font-bold uppercase mt-1 ${
                        selectedTeam === team.team_id ? 'text-amber-300' : 'text-slate-500'
                      }`}>
                        {team.total_bids} bids • {team.won_bids} won • {team.budget_remaining} Cr left
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Team Details */}
            <div className="lg:col-span-3 space-y-6">
              {currentTeam && (
                <>
                  {/* Team Summary */}
                  <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
                    <div className="flex flex-col sm:flex-row justify-between items-start gap-4 mb-4 pb-4 border-b border-slate-100">
                      <div>
                        <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">{currentTeam.team_name}</h2>
                        <p className="text-[10px] text-slate-450 font-bold uppercase mt-0.5">
                          Owner: {currentTeam.owner_name}
                        </p>
                      </div>
                      {currentTeam.draft_submitted && (
                        <span className="px-2.5 py-1 bg-emerald-50 border border-emerald-200 text-emerald-700 text-[9px] font-black rounded-lg uppercase tracking-wider">
                          ✓ Submitted
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Total Bids</p>
                        <p className="text-lg font-black text-slate-800">{currentTeam.total_bids}</p>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-3">
                        <p className="text-[9px] text-emerald-600 font-bold uppercase mb-0.5">Won</p>
                        <p className="text-lg font-black text-emerald-700">{currentTeam.won_bids}</p>
                      </div>
                      <div className="bg-rose-50 border border-rose-100 rounded-xl p-3">
                        <p className="text-[9px] text-rose-600 font-bold uppercase mb-0.5">Lost</p>
                        <p className="text-lg font-black text-rose-700">{currentTeam.lost_bids}</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Spent</p>
                        <p className="text-lg font-black text-slate-800">{currentTeam.budget_spent} Cr</p>
                      </div>
                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3">
                        <p className="text-[9px] text-slate-400 font-bold uppercase mb-0.5">Remaining</p>
                        <p className="text-lg font-black text-amber-600">{currentTeam.budget_remaining} Cr</p>
                      </div>
                    </div>
                  </div>

                  {/* All Bids for this Team */}
                  <div className="console-card bg-white border border-slate-200/60 p-6 rounded-3xl shadow-sm">
                    <h3 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-4 pb-3 border-b border-slate-100">
                      All Bids ({currentTeam.bids.length})
                    </h3>

                    {currentTeam.bids.length === 0 ? (
                      <p className="text-xs text-slate-400 font-bold uppercase text-center py-8">No bids submitted</p>
                    ) : (
                      <div className="space-y-4">
                        {currentTeam.bids.map((bid: any, i: number) => (
                          <div key={i} className={`p-4 rounded-xl border flex items-center justify-between gap-4 ${
                            bid.status === 'won'
                              ? 'bg-emerald-50/50 border-emerald-200'
                              : bid.status === 'lost'
                                ? 'bg-rose-50/30 border-rose-100 opacity-75'
                                : 'bg-slate-50 border-slate-100'
                          }`}>
                            <div className="flex items-center gap-3">
                              <span className="text-[9px] font-black text-slate-400">S{bid.slot_index}</span>
                              <div>
                                <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${
                                  bid.bid_type === 'player' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                                }`}>
                                  {bid.bid_type}
                                </span>
                                <h4 className="font-bold text-slate-800 text-xs uppercase mt-1">{bid.target_id}</h4>
                                <p className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">Priority {bid.priority}</p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-black text-sm text-slate-700">{bid.bid_amount} Cr</span>
                              <span className={`px-2 py-0.5 text-[8px] font-black rounded-lg uppercase tracking-wider border ${bidStatusColor(bid.status)}`}>
                                {bid.status === 'won' ? '✓ Won' : bid.status === 'lost' ? '✗ Lost' : bid.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
    </AuthGuard>
  );
}
