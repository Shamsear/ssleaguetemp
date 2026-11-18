'use client';

import { useEffect, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  FileText,
  List,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  HelpCircle,
  Sparkles,
  ArrowRight,
  Trash2,
  RefreshCw,
  Search,
  DollarSign
} from 'lucide-react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

interface AvailablePlayer {
  id: string;
  player_id: string;
  name: string;
  position: string;
  position_group?: string;
  overall_rating?: number;
  club?: string;
  nationality?: string;
  playing_style?: string;
}

interface BidRow {
  player_id: string;
  player_name: string;
  amount: number | string;
  isMatched?: boolean;
}

interface ProxyBidModalProps {
  isOpen: boolean;
  onClose: () => void;
  roundId: string;
  roundNumber?: number;
  position?: string;
  maxBids?: number;
  teamId: string;
  teamName: string;
  onSuccess: () => void;
}

function normalizeName(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents (e.g., é -> e, ñ -> n)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .trim();
}

export default function ProxyBidModal({
  isOpen,
  onClose,
  roundId,
  roundNumber,
  position,
  maxBids = 16,
  teamId,
  teamName,
  onSuccess,
}: ProxyBidModalProps) {
  const [mounted, setMounted] = useState(false);
  const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);

  const [activeTab, setActiveTab] = useState<'paste' | 'manual'>('paste');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [teamInfo, setTeamInfo] = useState<any>(null);
  const [availablePlayers, setAvailablePlayers] = useState<AvailablePlayer[]>([]);
  const [isLocked, setIsLocked] = useState(false);

  // Raw pasted text
  const [rawText, setRawText] = useState('');
  // Working parsed rows
  const [rows, setRows] = useState<BidRow[]>([]);

  // Search filter for manual player picker
  const [searchQuery, setSearchQuery] = useState('');

  // Portal setup
  useEffect(() => {
    const container = document.createElement('div');
    container.id = 'proxy-bid-modal-portal';
    container.style.cssText = 'position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; z-index: 9999; pointer-events: auto;';
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

  // Fetch data on open
  useEffect(() => {
    if (!isOpen || !roundId || !teamId) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setSuccessMsg(null);

    async function loadData() {
      try {
        const res = await fetchWithTokenRefresh(`/api/admin/rounds/${roundId}/teams/${teamId}/proxy-bids`);
        const data = await res.json();

        if (!isMounted) return;

        if (data.success) {
          setTeamInfo(data.team);
          setAvailablePlayers(data.availablePlayers || []);
          setIsLocked(!!data.isLocked);

          // If current bids exist, populate rows
          if (data.currentBids && data.currentBids.length > 0) {
            setRows(
              data.currentBids.map((b: any) => ({
                player_id: b.player_id,
                player_name: b.player_name || `Player #${b.player_id}`,
                amount: b.amount,
                isMatched: true,
              }))
            );
          } else {
            // Empty rows
            setRows([]);
          }
        } else {
          setError(data.error || 'Failed to load round & team data');
        }
      } catch (err: any) {
        if (isMounted) setError(err.message || 'Error connecting to server');
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadData();

    return () => {
      isMounted = false;
    };
  }, [isOpen, roundId, teamId]);

  // Handle Smart Parsing
  const handleParseText = () => {
    if (!rawText.trim()) return;

    const lines = rawText.split('\n');
    const parsed: BidRow[] = [];

    for (const rawLine of lines) {
      let line = rawLine.trim();
      if (!line) continue;

      // Skip common chat headers
      const lower = line.toLowerCase();
      if (
        lower.includes('round') ||
        lower.includes('position:') ||
        lower.includes('team:') ||
        lower.includes('bids:') ||
        lower.startsWith('ss super league')
      ) {
        continue;
      }

      // Strip leading number or bullets: "1.", "1)", "1 -", "#1:", "•"
      line = line.replace(/^\s*(?:\d+[\.\)\-:]\s*|\#\d+\s*:\s*|[•\*\-]\s*)/, '').trim();
      if (!line) continue;

      // Extract amount: Match trailing numbers with optional currency symbols
      // Examples: "Désiré Doué - £824", "Michael Olise: 823", "Lamine Yamal 684", "Mohamed Salah - 489m"
      const match = line.match(/^(.*?)(?:[-–—:]|\s{2,}|\s+)[£$€]?\s*([0-9]+(?:,[0-9]{3})*)\s*(?:m|k)?\s*$/i);

      let playerName = '';
      let amount: number | string = '';

      if (match) {
        playerName = match[1].trim();
        amount = parseInt(match[2].replace(/,/g, ''), 10);
      } else {
        // Fallback: search for last standalone number in line
        const lastNumMatch = line.match(/^(.*?)\s+[£$€]?([0-9]+)\s*$/);
        if (lastNumMatch) {
          playerName = lastNumMatch[1].trim();
          amount = parseInt(lastNumMatch[2], 10);
        } else {
          playerName = line;
          amount = '';
        }
      }

      // Clean name of stray asterisks or brackets: e.g. *Désiré Doué* -> Désiré Doué
      playerName = playerName.replace(/[\*_~\[\]]/g, '').trim();

      // Find best match in availablePlayers
      const normInput = normalizeName(playerName);
      let matchedPlayer: AvailablePlayer | undefined;

      if (normInput) {
        // 1. Exact match
        matchedPlayer = availablePlayers.find(p => normalizeName(p.name) === normInput);

        // 2. Substring match
        if (!matchedPlayer) {
          matchedPlayer = availablePlayers.find(p => {
            const normP = normalizeName(p.name);
            return normP.includes(normInput) || normInput.includes(normP);
          });
        }

        // 3. Last name match
        if (!matchedPlayer) {
          const lastName = normInput.split(' ').pop();
          if (lastName && lastName.length >= 3) {
            matchedPlayer = availablePlayers.find(p => normalizeName(p.name).endsWith(lastName));
          }
        }
      }

      parsed.push({
        player_id: matchedPlayer ? matchedPlayer.id : '',
        player_name: matchedPlayer ? matchedPlayer.name : playerName,
        amount,
        isMatched: !!matchedPlayer,
      });
    }

    setRows(parsed);
    setError(null);
  };

  // Validation stats
  const validation = useMemo(() => {
    const amounts = rows
      .map(r => (typeof r.amount === 'number' ? r.amount : parseInt(r.amount as string, 10)))
      .filter(a => !isNaN(a));

    const seen = new Set<number>();
    const duplicates = new Set<number>();
    for (const a of amounts) {
      if (seen.has(a)) duplicates.add(a);
      seen.add(a);
    }

    const unassignedCount = rows.filter(r => !r.player_id).length;
    const belowMinCount = amounts.filter(a => a < 10).length;

    const highestBid = amounts.length > 0 ? Math.max(...amounts) : 0;
    const teamBudget = teamInfo?.budget || 0;
    const exceedsBudget = highestBid > teamBudget;

    const isValid =
      rows.length === maxBids &&
      unassignedCount === 0 &&
      duplicates.size === 0 &&
      belowMinCount === 0 &&
      !exceedsBudget;

    return {
      totalRows: rows.length,
      validAmounts: amounts.length,
      duplicates: Array.from(duplicates),
      unassignedCount,
      belowMinCount,
      highestBid,
      teamBudget,
      exceedsBudget,
      isValid,
    };
  }, [rows, maxBids, teamInfo]);

  // Submit action
  const handleSave = async (action: 'submit' | 'draft') => {
    setError(null);
    setSuccessMsg(null);

    // Basic client checks
    if (action === 'submit') {
      if (rows.length !== maxBids) {
        setError(`Exactly ${maxBids} bids required to submit. You currently have ${rows.length}.`);
        return;
      }
      if (validation.unassignedCount > 0) {
        setError(`Please map all player names to valid database players before submitting.`);
        return;
      }
      if (validation.duplicates.length > 0) {
        setError(`Duplicate bid amount detected: £${validation.duplicates.join(', £')}. Each bid must be unique.`);
        return;
      }
      if (validation.belowMinCount > 0) {
        setError(`All bids must be at least £10.`);
        return;
      }
      if (validation.exceedsBudget) {
        setError(`Highest bid (£${validation.highestBid}) exceeds team budget (£${validation.teamBudget}).`);
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        action,
        bids: rows.map(r => ({
          player_id: r.player_id,
          amount: typeof r.amount === 'number' ? r.amount : parseInt(r.amount as string, 10),
        })),
      };

      const res = await fetchWithTokenRefresh(
        `/api/admin/rounds/${roundId}/teams/${teamId}/proxy-bids`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );

      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message || 'Bids updated successfully!');
        setIsLocked(action === 'submit');
        onSuccess();
        setTimeout(() => {
          onClose();
        }, 1200);
      } else {
        setError(data.error || 'Failed to save bids');
      }
    } catch (err: any) {
      setError(err.message || 'Error submitting bids');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !mounted || !portalContainer) return null;

  return createPortal(
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-3 z-[9999] animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase bg-indigo-50 border border-indigo-200 text-indigo-700">
                Admin Proxy Entry
              </span>
              <h2 className="text-lg font-black text-slate-800 tracking-tight">
                {teamName}
              </h2>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Round {roundNumber ?? ''} ({position ?? 'Auction'}) • Max {maxBids} Bids • Available Budget:{' '}
              <span className="font-bold text-emerald-600">
                £{teamInfo?.budget?.toLocaleString() ?? '...'}
              </span>
              {isLocked && (
                <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  Currently Locked & Submitted
                </span>
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selection */}
        <div className="px-6 pt-3 border-b border-slate-100 flex items-center justify-between bg-white shrink-0">
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab('paste')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors ${
                activeTab === 'paste'
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <FileText className="w-4 h-4" />
              Smart Text Parser (WhatsApp / Chat)
            </button>
            <button
              onClick={() => setActiveTab('manual')}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-t-lg border-b-2 transition-colors ${
                activeTab === 'manual'
                  ? 'border-indigo-600 text-indigo-600 bg-indigo-50/40'
                  : 'border-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              <List className="w-4 h-4" />
              Manual Selection ({rows.length} bids)
            </button>
          </div>

          {/* Mini Stats Indicator */}
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${
                rows.length === maxBids
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'bg-amber-50 text-amber-700 border border-amber-200'
              }`}
            >
              {rows.length} / {maxBids} Bids
            </span>
            {validation.duplicates.length > 0 && (
              <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-rose-50 text-rose-700 border border-rose-200">
                Duplicate Amounts!
              </span>
            )}
          </div>
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
              <p className="text-sm font-medium">Loading eligible players & round data...</p>
            </div>
          ) : (
            <>
              {/* Notifications */}
              {error && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-rose-800 text-xs">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="font-medium">{error}</div>
                </div>
              )}

              {successMsg && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-2.5 text-emerald-800 text-xs">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="font-medium">{successMsg}</div>
                </div>
              )}

              {activeTab === 'paste' ? (
                <div className="space-y-4">
                  <div className="bg-indigo-50/50 border border-indigo-100 p-4 rounded-xl text-xs text-indigo-900 space-y-2">
                    <div className="flex items-center gap-1.5 font-bold">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      Paste raw list directly from WhatsApp, Discord, or notes
                    </div>
                    <p className="text-indigo-700 text-[11px]">
                      The parser automatically extracts player names and bid numbers, strips currency symbols (£, $, M),
                      and matches names against the round's available players.
                    </p>
                  </div>

                  <div className="relative">
                    <textarea
                      rows={6}
                      value={rawText}
                      onChange={e => setRawText(e.target.value)}
                      placeholder={`Example:\n1. Désiré Doué - £824\n2. Michael Olise - £823\n3. Lamine Yamal - £684\n4. Mohamed Salah - £489\n...`}
                      className="w-full p-3 font-mono text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 bg-slate-50/30"
                    />
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={handleParseText}
                        disabled={!rawText.trim()}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-colors disabled:opacity-50 cursor-pointer shadow-sm shadow-indigo-600/20"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        Parse & Match Bids
                      </button>
                    </div>
                  </div>

                  {/* Parsed Results Review Table */}
                  {rows.length > 0 && (
                    <div className="space-y-3 pt-2">
                      <div className="flex items-center justify-between">
                        <h3 className="text-xs font-black uppercase text-slate-500 tracking-wider">
                          Parsed Bids ({rows.length} items)
                        </h3>
                        <button
                          onClick={() => setRows([])}
                          className="text-[11px] font-bold text-rose-600 hover:text-rose-700 flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          Clear all
                        </button>
                      </div>

                      <div className="border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                        <table className="min-w-full divide-y divide-slate-100 text-xs">
                          <thead className="bg-slate-50">
                            <tr>
                              <th className="px-3 py-2 text-left font-bold text-slate-400 text-[10px] uppercase w-12">#</th>
                              <th className="px-3 py-2 text-left font-bold text-slate-400 text-[10px] uppercase">Matched Player</th>
                              <th className="px-3 py-2 text-left font-bold text-slate-400 text-[10px] uppercase w-32">Bid (£)</th>
                              <th className="px-3 py-2 text-center font-bold text-slate-400 text-[10px] uppercase w-16">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100 font-mono">
                            {rows.map((row, idx) => {
                              const amountNum = typeof row.amount === 'number' ? row.amount : parseInt(row.amount as string, 10);
                              const isDuplicate = validation.duplicates.includes(amountNum);
                              const isUnassigned = !row.player_id;

                              return (
                                <tr
                                  key={idx}
                                  className={`hover:bg-slate-50/50 transition-colors ${
                                    isUnassigned
                                      ? 'bg-amber-50/30'
                                      : isDuplicate
                                      ? 'bg-rose-50/30'
                                      : ''
                                  }`}
                                >
                                  <td className="px-3 py-2 text-slate-400 font-bold">{idx + 1}</td>
                                  
                                  {/* Player Selector / Name */}
                                  <td className="px-3 py-2">
                                    <div className="flex items-center gap-2">
                                      {row.isMatched ? (
                                        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                                      ) : (
                                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                                      )}
                                      <select
                                        value={row.player_id}
                                        onChange={e => {
                                          const p = availablePlayers.find(x => x.id === e.target.value);
                                          const updated = [...rows];
                                          updated[idx] = {
                                            ...updated[idx],
                                            player_id: e.target.value,
                                            player_name: p ? p.name : updated[idx].player_name,
                                            isMatched: !!p,
                                          };
                                          setRows(updated);
                                        }}
                                        className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-sans text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                      >
                                        <option value="">
                                          {isUnassigned ? `⚠️ Unmatched: "${row.player_name}" (Select player)` : 'Select Player'}
                                        </option>
                                        {availablePlayers.map(p => (
                                          <option key={p.id} value={p.id}>
                                            {p.name} ({p.position} • {p.overall_rating || 75} OVR)
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </td>

                                  {/* Amount Input */}
                                  <td className="px-3 py-2">
                                    <div className="relative">
                                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">£</span>
                                      <input
                                        type="number"
                                        min={10}
                                        value={row.amount}
                                        onChange={e => {
                                          const updated = [...rows];
                                          updated[idx].amount = e.target.value ? parseInt(e.target.value, 10) : '';
                                          setRows(updated);
                                        }}
                                        className={`w-full pl-6 pr-2 py-1 text-xs font-mono rounded-lg border focus:outline-none ${
                                          isDuplicate
                                            ? 'border-rose-400 bg-rose-50/50 text-rose-700'
                                            : 'border-slate-200 text-slate-800'
                                        }`}
                                      />
                                    </div>
                                  </td>

                                  {/* Remove row */}
                                  <td className="px-3 py-2 text-center">
                                    <button
                                      onClick={() => {
                                        setRows(rows.filter((_, i) => i !== idx));
                                      }}
                                      className="p-1 text-slate-300 hover:text-rose-600 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* Manual Selection Tab */
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="relative flex-1">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Search available players..."
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                      />
                    </div>
                    <button
                      onClick={() => {
                        // Add blank row
                        setRows([...rows, { player_id: '', player_name: '', amount: 10 }]);
                      }}
                      className="px-3 py-1.5 text-xs font-bold rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                    >
                      + Add Row
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="min-w-full divide-y divide-slate-100 text-xs">
                      <thead className="bg-slate-50">
                        <tr>
                          <th className="px-3 py-2 text-left font-bold text-slate-400 text-[10px] uppercase w-12">#</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-400 text-[10px] uppercase">Player</th>
                          <th className="px-3 py-2 text-left font-bold text-slate-400 text-[10px] uppercase w-36">Bid Amount (£)</th>
                          <th className="px-3 py-2 text-center font-bold text-slate-400 text-[10px] uppercase w-16">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {rows.map((row, idx) => (
                          <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="px-3 py-2 text-slate-400 font-bold">{idx + 1}</td>
                            <td className="px-3 py-2">
                              <select
                                value={row.player_id}
                                onChange={e => {
                                  const p = availablePlayers.find(x => x.id === e.target.value);
                                  const updated = [...rows];
                                  updated[idx] = {
                                    ...updated[idx],
                                    player_id: e.target.value,
                                    player_name: p ? p.name : '',
                                    isMatched: !!p,
                                  };
                                  setRows(updated);
                                }}
                                className="w-full bg-white border border-slate-200 rounded-lg px-2 py-1 text-xs font-sans text-slate-800"
                              >
                                <option value="">Select eligible player...</option>
                                {availablePlayers
                                  .filter(p => !searchQuery || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
                                  .map(p => (
                                    <option key={p.id} value={p.id}>
                                      {p.name} ({p.position} • {p.overall_rating || 75} OVR)
                                    </option>
                                  ))}
                              </select>
                            </td>
                            <td className="px-3 py-2">
                              <div className="relative">
                                <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 text-xs">£</span>
                                <input
                                  type="number"
                                  min={10}
                                  value={row.amount}
                                  onChange={e => {
                                    const updated = [...rows];
                                    updated[idx].amount = e.target.value ? parseInt(e.target.value, 10) : '';
                                    setRows(updated);
                                  }}
                                  className="w-full pl-6 pr-2 py-1 text-xs font-mono rounded-lg border border-slate-200 text-slate-800"
                                />
                              </div>
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                                className="p-1 text-slate-300 hover:text-rose-600 transition-colors"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 text-xs text-slate-500">
            {validation.highestBid > 0 && (
              <span>
                Highest Bid: <strong className="text-slate-800">£{validation.highestBid.toLocaleString()}</strong>
              </span>
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/50 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>

            {/* Save as Draft */}
            <button
              onClick={() => handleSave('draft')}
              disabled={saving || rows.length === 0}
              className="px-4 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
            >
              {saving ? 'Saving...' : 'Save as Draft'}
            </button>

            {/* Save & Submit */}
            <button
              onClick={() => handleSave('submit')}
              disabled={saving || !validation.isValid}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white transition-colors disabled:opacity-50 cursor-pointer shadow-sm shadow-emerald-600/20"
            >
              <CheckCircle2 className="w-4 h-4" />
              {saving ? 'Submitting...' : 'Save & Submit Bids'}
            </button>
          </div>
        </div>

      </div>
    </div>,
    portalContainer
  );
}
