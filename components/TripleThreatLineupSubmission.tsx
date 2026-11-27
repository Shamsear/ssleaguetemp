'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Users, User, Swords, Shield, Clock, AlertTriangle, CheckCircle2, 
  HelpCircle, RefreshCw, Send, ChevronDown, Sparkles, Award
} from 'lucide-react';
import { validateTripleThreatLineup } from '@/lib/tournament/triple-threat-engine';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';

interface Player {
  id: string;
  player_id: string;
  name: string;
  player_name?: string;
  position?: string;
  overall_rating?: number;
  category?: string;
  is_active?: boolean;
}

interface TripleThreatLineupSubmissionProps {
  fixtureId: string;
  teamId: string;
  seasonId: string;
  onSubmitSuccess?: () => void;
  existingLineup?: any;
  opponentLineup?: any;
  opponentRoster?: any[];
  isOpponentSelection?: boolean;
  opponentTeamName?: string;
  isHomeTeam?: boolean;
  bypassDeadline?: boolean;
}

export default function TripleThreatLineupSubmission({
  fixtureId,
  teamId,
  seasonId,
  onSubmitSuccess,
  existingLineup,
  opponentLineup,
  opponentRoster = [],
  isOpponentSelection = false,
  opponentTeamName,
  isHomeTeam = false,
  bypassDeadline = false,
}: TripleThreatLineupSubmissionProps) {
  const { user } = useAuth();
  const [roster, setRoster] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isEditable, setIsEditable] = useState(true);
  const [deadlineInfo, setDeadlineInfo] = useState<any>(null);

  // 3-Mode Lineup State: 2 Co-op, 2 Duo, 1 Single
  const [coopPlayers, setCoopPlayers] = useState<[string, string]>(['', '']);
  const [duoPlayers, setDuoPlayers] = useState<[string, string]>(['', '']);
  const [singlePlayer, setSinglePlayer] = useState<string>('');

  useEffect(() => {
    fetchRoster();
    checkEditability();
  }, [fixtureId, teamId, seasonId]);

  // Helper to extract player ID whether input is string or object
  const getPlayerId = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'string') return val.trim();
    return String(val.player_id || val.id || '').trim();
  };

  // Load existing lineup ONLY if it is a genuine Triple Threat submission (never pre-fill system_auto stubs)
  useEffect(() => {
    if (!existingLineup || existingLineup.submitted_by === 'system_auto') {
      setCoopPlayers(['', '']);
      setDuoPlayers(['', '']);
      setSinglePlayer('');
      return;
    }

    const tt = existingLineup.triple_threat_lineup;
    if (tt) {
      setCoopPlayers([
        Array.isArray(tt.coop) ? getPlayerId(tt.coop[0]) : '',
        Array.isArray(tt.coop) ? getPlayerId(tt.coop[1]) : '',
      ]);
      setDuoPlayers([
        Array.isArray(tt.duo) ? getPlayerId(tt.duo[0]) : '',
        Array.isArray(tt.duo) ? getPlayerId(tt.duo[1]) : '',
      ]);
      if (Array.isArray(tt.single)) {
        setSinglePlayer(getPlayerId(tt.single[0]));
      } else {
        setSinglePlayer(tt.single ? getPlayerId(tt.single) : '');
      }
      return;
    }

    if (Array.isArray(existingLineup.starting_xi)) {
      const sXi = existingLineup.starting_xi;
      const coopItems = sXi.filter((p: any) => p && typeof p === 'object' && p.mode === 'coop').map(getPlayerId);
      const duoItems = sXi.filter((p: any) => p && typeof p === 'object' && p.mode === 'duo').map(getPlayerId);
      const singleItems = sXi.filter((p: any) => p && typeof p === 'object' && p.mode === 'single').map(getPlayerId);

      if (coopItems.length > 0 || duoItems.length > 0 || singleItems.length > 0) {
        setCoopPlayers([coopItems[0] || '', coopItems[1] || '']);
        setDuoPlayers([duoItems[0] || '', duoItems[1] || '']);
        setSinglePlayer(singleItems[0] || '');
      }
    }
  }, [existingLineup]);

  const fetchRoster = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/team/${teamId}/roster?season_id=${seasonId}`);
      const data = await res.json();
      if (data.success && data.players) {
        const active = data.players.filter((p: any) => p.is_active !== false);
        setRoster(active);
      }
    } catch (err: any) {
      console.error('Error fetching roster:', err);
      setError('Failed to load team roster');
    } finally {
      setLoading(false);
    }
  };

  const isAdminOverride = bypassDeadline || user?.role === 'committee_admin' || (user?.role as string) === 'super_admin';

  const checkEditability = async () => {
    // Committee admin can always edit/submit lineups on behalf of teams
    if (isAdminOverride) {
      setIsEditable(true);
      return;
    }

    try {
      const res = await fetch(`/api/fixtures/${fixtureId}/editable?team_id=${teamId}`);
      const data = await res.json();
      setIsEditable(isOpponentSelection ? true : (data.editable ?? true));
      setDeadlineInfo(data);
    } catch (err) {
      console.error('Error checking lineup editability:', err);
    }
  };

  // Lookup map for player names
  const playerMap = useMemo(() => {
    const map = new Map<string, Player>();
    roster.forEach((p) => {
      const id = String(p.player_id || p.id);
      map.set(id, p);
    });
    return map;
  }, [roster]);

  // Set of all currently selected player IDs (excluding empty strings)
  const selectedPlayerIds = useMemo(() => {
    const set = new Set<string>();
    if (coopPlayers[0]) set.add(coopPlayers[0]);
    if (coopPlayers[1]) set.add(coopPlayers[1]);
    if (duoPlayers[0]) set.add(duoPlayers[0]);
    if (duoPlayers[1]) set.add(duoPlayers[1]);
    if (singlePlayer) set.add(singlePlayer);
    return set;
  }, [coopPlayers, duoPlayers, singlePlayer]);

  // Total unique players selected count
  const selectedCount = selectedPlayerIds.size;
  const isLineupComplete = selectedCount === 5;

  // Validation
  const validationResult = useMemo(() => {
    const coop = coopPlayers.filter(Boolean);
    const duo = duoPlayers.filter(Boolean);
    const single = singlePlayer ? [singlePlayer] : [];
    
    if (coop.length < 2 || duo.length < 2 || single.length < 1) {
      return { valid: false, error: 'Please select all 5 players across Co-op, Duo, and Single modes.' };
    }

    const nameMap: Record<string, string> = {};
    roster.forEach((p) => {
      nameMap[String(p.player_id || p.id)] = p.player_name || p.name;
    });

    return validateTripleThreatLineup({ coop, duo, single }, nameMap);
  }, [coopPlayers, duoPlayers, singlePlayer, roster]);

  // Handle slot changes with automatic swap when picking a player already assigned to another slot
  type SlotKey = 'coop0' | 'coop1' | 'duo0' | 'duo1' | 'single';

  const slotLabelByPlayerId = useMemo(() => {
    const map = new Map<string, string>();
    if (coopPlayers[0]) map.set(coopPlayers[0], 'Co-op 1');
    if (coopPlayers[1]) map.set(coopPlayers[1], 'Co-op 2');
    if (duoPlayers[0]) map.set(duoPlayers[0], 'Duo 1');
    if (duoPlayers[1]) map.set(duoPlayers[1], 'Duo 2');
    if (singlePlayer) map.set(singlePlayer, 'Single');
    return map;
  }, [coopPlayers, duoPlayers, singlePlayer]);

  const handleSlotChange = (target: SlotKey, newValue: string) => {
    const slots: Record<SlotKey, string> = {
      coop0: coopPlayers[0],
      coop1: coopPlayers[1],
      duo0: duoPlayers[0],
      duo1: duoPlayers[1],
      single: singlePlayer,
    };

    const previousTargetVal = slots[target];
    if (newValue && newValue !== previousTargetVal) {
      // If newValue already sits in another slot, swap the two slots cleanly
      const existingSlot = (Object.keys(slots) as SlotKey[]).find(
        (k) => k !== target && slots[k] === newValue
      );
      if (existingSlot) {
        slots[existingSlot] = previousTargetVal;
      }
    }
    slots[target] = newValue;

    setCoopPlayers([slots.coop0, slots.coop1]);
    setDuoPlayers([slots.duo0, slots.duo1]);
    setSinglePlayer(slots.single);
    setError(null);
  };

  // Submit Lineup
  const handleSubmit = async () => {
    if (!validationResult.valid) {
      setError(validationResult.error || 'Please ensure all 5 players are unique.');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccessMessage(null);

      const rosterMap = new Map(roster.map(p => [String(p.player_id || p.id), p.player_name || p.name]));
      const getPlayerName = (id: string) => rosterMap.get(id) || `Player ${id}`;

      const payload = {
        fixture_id: fixtureId,
        team_id: teamId,
        triple_threat_lineup: {
          coop: [
            { player_id: coopPlayers[0], player_name: getPlayerName(coopPlayers[0]) },
            { player_id: coopPlayers[1], player_name: getPlayerName(coopPlayers[1]) },
          ],
          duo: [
            { player_id: duoPlayers[0], player_name: getPlayerName(duoPlayers[0]) },
            { player_id: duoPlayers[1], player_name: getPlayerName(duoPlayers[1]) },
          ],
          single: [
            { player_id: singlePlayer, player_name: getPlayerName(singlePlayer) },
          ],
        },
        starting_xi: [
          { player_id: coopPlayers[0], player_name: getPlayerName(coopPlayers[0]), mode: 'coop', slot: 1 },
          { player_id: coopPlayers[1], player_name: getPlayerName(coopPlayers[1]), mode: 'coop', slot: 2 },
          { player_id: duoPlayers[0], player_name: getPlayerName(duoPlayers[0]), mode: 'duo', slot: 1 },
          { player_id: duoPlayers[1], player_name: getPlayerName(duoPlayers[1]), mode: 'duo', slot: 2 },
          { player_id: singlePlayer, player_name: getPlayerName(singlePlayer), mode: 'single', slot: 1 },
        ],
        substitutes: [],
        selected_by_opponent: isOpponentSelection,
        submitted_by: user?.uid || 'anonymous',
        submitted_by_name: (user as any)?.displayName || (user as any)?.display_name || user?.username || user?.email || 'Team Manager',
        bypass_deadline: isAdminOverride,
      };

      const res = await fetchWithTokenRefresh('/api/lineups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit lineup');
      }

      setSuccessMessage('🎉 Triple Threat Lineup submitted successfully!');
      if (onSubmitSuccess) {
        onSubmitSuccess();
      }
    } catch (err: any) {
      console.error('Error submitting lineup:', err);
      setError(err.message || 'An error occurred while submitting lineup');
    } finally {
      setSubmitting(false);
    }
  };

  // Helper to render a player selection dropdown with swap support (never locks out assigned teammates)
  const renderPlayerDropdown = (
    currentValue: string,
    onChange: (val: string) => void,
    placeholder: string
  ) => {
    return (
      <div className="relative">
        <select
          value={currentValue}
          disabled={!isEditable || submitting}
          onChange={(e) => onChange(e.target.value)}
          className={`w-full px-3 py-2.5 bg-slate-50 border rounded-xl font-mono text-xs font-bold transition-all outline-none cursor-pointer appearance-none pr-8 ${
            currentValue
              ? 'border-emerald-300 bg-emerald-50/30 text-slate-900 font-extrabold'
              : 'border-slate-200 text-slate-500 hover:border-slate-300'
          }`}
        >
          <option value="">{placeholder}</option>
          {roster.map((player) => {
            const pId = String(player.player_id || player.id);
            const assignedSlot = slotLabelByPlayerId.get(pId);
            const isAlreadySelectedElsewhere = Boolean(assignedSlot) && pId !== currentValue;
            const pName = player.player_name || player.name;
            const pPos = player.position ? `[${player.position}]` : '';
            const pCat = player.category ? `(${player.category})` : '';

            return (
              <option key={pId} value={pId}>
                {pName} {pPos} {pCat} {isAlreadySelectedElsewhere ? `• (in ${assignedSlot} — swap)` : ''}
              </option>
            );
          })}
        </select>
        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    );
  };

  const opponentPlayerMap = useMemo(() => {
    const map = new Map<string, { name: string; category?: string }>();
    (opponentRoster || []).forEach((p: any) => {
      const id = String(p.player_id || p.id || '');
      const name = p.player_name || p.name || '';
      if (id && name) {
        map.set(id, { name, category: p.category });
      }
    });
    return map;
  }, [opponentRoster]);

  const renderOpponentNames = (arr: any) => {
    if (!arr) return 'None';
    const items = Array.isArray(arr) ? arr : [arr];
    return items
      .filter(Boolean)
      .map((item: any) => {
        const pid = typeof item === 'object' ? String(item.player_id || item.id || '') : String(item);
        const oppInfo = pid ? opponentPlayerMap.get(pid) : undefined;
        const name =
          (typeof item === 'object' ? item.player_name || item.name : '') ||
          oppInfo?.name ||
          pid ||
          'Player';
        const cat = (typeof item === 'object' ? item.category : undefined) || oppInfo?.category;
        return cat ? `${name} (${cat})` : name;
      })
      .join(' & ');
  };

  if (loading) {
    return (
      <div className="py-12 text-center font-mono text-xs uppercase text-slate-500 flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-amber-500" />
        Loading squad & lineup requirements...
      </div>
    );
  }

  return (
    <div className="space-y-4 sm:space-y-5 font-mono text-slate-800 pb-2">
      {/* Title & Rules Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-4 sm:p-5 text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 relative z-10">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 bg-amber-400/20 border border-amber-400/30 text-amber-300 rounded-md text-[9px] sm:text-[10px] font-black uppercase tracking-wider mb-1.5">
              <Sparkles className="w-3 h-3" /> SS TRIPLE THREAT
            </div>
            <h2 className="text-base sm:text-lg font-black uppercase tracking-wide flex items-center gap-2 truncate">
              {isOpponentSelection 
                ? `Submit Lineup for ${opponentTeamName || 'Opponent'}`
                : isHomeTeam && opponentLineup?.triple_threat_lineup
                  ? 'Adjust Home Lineup (Home Advantage)'
                  : 'Matchday Lineup Submission'}
            </h2>
            <p className="text-[11px] sm:text-xs text-slate-300 font-sans mt-0.5 leading-snug">
              {isOpponentSelection
                ? `Submitting 5-player lineup on behalf of ${opponentTeamName || 'Opponent'}.`
                : isHomeTeam && opponentLineup?.triple_threat_lineup
                  ? 'The Away Team has submitted. You have Home Advantage to see their lineup below and adjust your players!'
                  : 'Field exactly 5 unique players across Co-op, Duo, and Single modes. No player can participate in more than one mode.'}
            </p>
          </div>

          {/* Progress Tracker */}
          <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-xl p-2.5 sm:p-3 text-center sm:min-w-[130px] shrink-0 self-start sm:self-auto">
            <div className="text-[9px] font-bold uppercase tracking-wider text-slate-300 mb-0.5">Progress</div>
            <div className="text-xl sm:text-2xl font-black text-amber-400">
              {selectedCount} <span className="text-xs font-normal text-slate-300">/ 5</span>
            </div>
            <div className="text-[9px] uppercase font-bold text-emerald-400">
              {isLineupComplete ? '✓ All 5 Selected' : `${5 - selectedCount} remaining`}
            </div>
          </div>
        </div>

        {/* Deadline Notice */}
        {(deadlineInfo?.deadline || deadlineInfo?.roundStart) && (
          <div className="mt-3 pt-2.5 border-t border-white/10 flex items-center gap-2 text-[11px] text-amber-200">
            <Clock className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span>
              Away Team Submission Deadline:{' '}
              <strong>
                {new Date(deadlineInfo.deadline || deadlineInfo.roundStart).toLocaleTimeString('en-IN', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true,
                  timeZone: 'Asia/Kolkata',
                })}
              </strong>{' '}
              IST on Matchday.
            </span>
          </div>
        )}
      </div>

      {/* Home Advantage: Opponent Lineup Card */}
      {isHomeTeam && !isOpponentSelection && opponentLineup?.triple_threat_lineup && (
        <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/5 to-transparent border-2 border-amber-400 rounded-2xl p-3.5 sm:p-4.5 shadow-xs">
          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-md bg-amber-500 text-slate-900 font-black text-[10px] uppercase tracking-wider">
              ⭐ HOME ADVANTAGE
            </span>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
              {opponentTeamName || 'Away Team'} Submitted Lineup
            </h3>
          </div>
          <p className="text-[11px] text-slate-600 mb-3 font-sans">
            The Away Team has submitted their lineup. You can see their player placement below and adjust your 5 players to counter their strategy before the match begins!
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono text-xs">
            <div className="p-3 bg-white rounded-xl border border-indigo-200 shadow-2xs">
              <span className="text-[10px] font-bold text-indigo-700 uppercase block mb-1">🎮 Mode 1: Co-op (2v2)</span>
              <span className="font-extrabold text-slate-900 block">
                {renderOpponentNames(opponentLineup.triple_threat_lineup.coop)}
              </span>
            </div>
            <div className="p-3 bg-white rounded-xl border border-emerald-200 shadow-2xs">
              <span className="text-[10px] font-bold text-emerald-700 uppercase block mb-1">🤝 Mode 2: Duo (2 × 1v1 Goal Based)</span>
              <div className="font-extrabold text-slate-900 space-y-0.5">
                <div>1v1 #1: {renderOpponentNames(opponentLineup.triple_threat_lineup.duo?.[0])}</div>
                <div>1v1 #2: {renderOpponentNames(opponentLineup.triple_threat_lineup.duo?.[1])}</div>
              </div>
            </div>
            <div className="p-3 bg-white rounded-xl border border-amber-200 shadow-2xs">
              <span className="text-[10px] font-bold text-amber-700 uppercase block mb-1">⚔️ Mode 3: Single (1v1)</span>
              <span className="font-extrabold text-slate-900 block">
                {renderOpponentNames(opponentLineup.triple_threat_lineup.single)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Lock Banner if not editable */}
      {!isEditable && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 sm:p-4 text-rose-800 text-xs flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
          <div>
            <p className="font-bold uppercase tracking-wider">Lineup Locked</p>
            <p className="text-[11px] text-rose-600 mt-0.5">
              {deadlineInfo?.reason || 'The submission deadline for this matchday has passed.'}
            </p>
          </div>
        </div>
      )}

      {/* Error & Success Alerts */}
      {error && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-3.5 sm:p-4 text-rose-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 sm:p-4 text-emerald-700 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Mode 1: Co-op Match (2v2) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4.5 shadow-xs transition-all hover:border-slate-300">
        <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
              <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Mode 1: Co-op Match (2v2)
              </h3>
              <p className="text-[9px] sm:text-[10px] text-slate-400 font-sans">
                Win = 3 Pts • Draw = 1 Pt • Loss = 0 Pts (2 Players)
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-[9px] sm:text-[10px] font-bold uppercase shrink-0">
            {coopPlayers.filter(Boolean).length} / 2 Selected
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Co-op Player 1
            </label>
            {renderPlayerDropdown(coopPlayers[0], (v) => handleSlotChange('coop0', v), '-- SELECT CO-OP PLAYER 1 --')}
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Co-op Player 2
            </label>
            {renderPlayerDropdown(coopPlayers[1], (v) => handleSlotChange('coop1', v), '-- SELECT CO-OP PLAYER 2 --')}
          </div>
        </div>
      </div>

      {/* Mode 2: Duo Match (2 × 1v1 Goal Based) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4.5 shadow-xs transition-all hover:border-slate-300">
        <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shrink-0">
              <Award className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Mode 2: Duo Match (2 × 1v1 Goal Based)
              </h3>
              <p className="text-[9px] sm:text-[10px] text-slate-400 font-sans">
                2 separate 1v1s (P1 vs P1 & P2 vs P2) • Most combined goals wins Mode (+3 Pts / Draw +1)
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[9px] sm:text-[10px] font-bold uppercase shrink-0">
            {duoPlayers.filter(Boolean).length} / 2 Selected
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Duo 1v1 Player 1 (Matches Away P1)
            </label>
            {renderPlayerDropdown(duoPlayers[0], (v) => handleSlotChange('duo0', v), '-- SELECT DUO 1v1 PLAYER 1 --')}
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
              Duo 1v1 Player 2 (Matches Away P2)
            </label>
            {renderPlayerDropdown(duoPlayers[1], (v) => handleSlotChange('duo1', v), '-- SELECT DUO 1v1 PLAYER 2 --')}
          </div>
        </div>
      </div>

      {/* Mode 3: Single Match (1v1) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-3.5 sm:p-4.5 shadow-xs transition-all hover:border-slate-300">
        <div className="flex items-center justify-between mb-3 border-b border-slate-100 pb-2">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600 shrink-0">
              <Swords className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Mode 3: Single Match (1v1)
              </h3>
              <p className="text-[9px] sm:text-[10px] text-slate-400 font-sans">
                Win = 3 Pts • Draw = 1 Pt • Loss = 0 Pts (1 Player)
              </p>
            </div>
          </div>
          <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[9px] sm:text-[10px] font-bold uppercase shrink-0">
            {singlePlayer ? '1 / 1' : '0 / 1'} Selected
          </span>
        </div>

        <div className="max-w-md">
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">
            Single (1v1) Player
          </label>
          {renderPlayerDropdown(singlePlayer, (v) => handleSlotChange('single', v), '-- SELECT 1V1 PLAYER --')}
        </div>
      </div>

      {/* Action Submit Button (Sticky so it's always accessible on all screen heights) */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur-md pt-3 pb-2 -mx-3.5 -mb-2 px-3.5 sm:-mx-6 sm:-mb-2 sm:px-6 border-t border-slate-200 z-10 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-[0_-4px_12px_rgba(0,0,0,0.04)]">
        <div className="text-[11px] sm:text-xs text-slate-500 font-sans leading-tight">
          🔥 <strong className="text-slate-800">Clean Sweep Rule:</strong> Winning all 3 matches awards an extra <span className="text-amber-600 font-bold">+1 Bonus Point</span> (10 Max Points).
        </div>

        <button
          type="button"
          disabled={!isEditable || submitting || !validationResult.valid}
          onClick={handleSubmit}
          className={`w-full sm:w-auto px-5 py-2.5 sm:px-6 sm:py-3 rounded-xl font-mono text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shrink-0 shadow-sm ${
            !isEditable || !validationResult.valid
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed border border-slate-200'
              : 'bg-emerald-600 hover:bg-emerald-700 active:scale-98 text-white shadow-emerald-200 hover:shadow-md'
          }`}
        >
          {submitting ? (
            <>
              <RefreshCw className="w-4 h-4 animate-spin" /> Submitting Lineup...
            </>
          ) : (
            <>
              <Send className="w-4 h-4" /> Submit Official Lineup
            </>
          )}
        </button>
      </div>
    </div>
  );
}
