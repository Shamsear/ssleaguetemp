'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { 
  Users, User, Swords, Shield, Clock, AlertTriangle, CheckCircle2, 
  HelpCircle, RefreshCw, Send, ChevronDown, Sparkles, Award
} from 'lucide-react';
import { validateTripleThreatLineup } from '@/lib/tournament/triple-threat-engine';

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
  isOpponentSelection?: boolean;
  opponentTeamName?: string;
}

export default function TripleThreatLineupSubmission({
  fixtureId,
  teamId,
  seasonId,
  onSubmitSuccess,
  existingLineup,
  isOpponentSelection = false,
  opponentTeamName,
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

  // Load existing lineup if available
  useEffect(() => {
    if (existingLineup) {
      const tt = existingLineup.triple_threat_lineup;
      if (tt) {
        if (Array.isArray(tt.coop)) {
          setCoopPlayers([getPlayerId(tt.coop[0]), getPlayerId(tt.coop[1])]);
        }
        if (Array.isArray(tt.duo)) {
          setDuoPlayers([getPlayerId(tt.duo[0]), getPlayerId(tt.duo[1])]);
        }
        if (Array.isArray(tt.single)) {
          setSinglePlayer(getPlayerId(tt.single[0]));
        } else if (tt.single) {
          setSinglePlayer(getPlayerId(tt.single));
        }
      } else if (Array.isArray(existingLineup.starting_xi)) {
        // Fallback: extract from starting_xi if items have mode or sequential slots
        const sXi = existingLineup.starting_xi;
        const coopItems = sXi.filter((p: any) => p && typeof p === 'object' && p.mode === 'coop').map(getPlayerId);
        const duoItems = sXi.filter((p: any) => p && typeof p === 'object' && p.mode === 'duo').map(getPlayerId);
        const singleItems = sXi.filter((p: any) => p && typeof p === 'object' && p.mode === 'single').map(getPlayerId);

        if (coopItems.length > 0 || duoItems.length > 0 || singleItems.length > 0) {
          setCoopPlayers([coopItems[0] || '', coopItems[1] || '']);
          setDuoPlayers([duoItems[0] || '', duoItems[1] || '']);
          setSinglePlayer(singleItems[0] || '');
        } else if (sXi.length >= 5) {
          // Sequential fallback: 0-1 coop, 2-3 duo, 4 single
          setCoopPlayers([getPlayerId(sXi[0]), getPlayerId(sXi[1])]);
          setDuoPlayers([getPlayerId(sXi[2]), getPlayerId(sXi[3])]);
          setSinglePlayer(getPlayerId(sXi[4]));
        }
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

  const checkEditability = async () => {
    try {
      const res = await fetch(`/api/fixtures/${fixtureId}/editable?team_id=${teamId}`);
      const data = await res.json();
      setIsEditable(data.editable ?? true);
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

  // Handle slot changes with dynamic exclusion
  const handleCoopChange = (slotIndex: 0 | 1, value: string) => {
    setCoopPlayers((prev) => {
      const copy: [string, string] = [...prev];
      copy[slotIndex] = value;
      return copy;
    });
    setError(null);
  };

  const handleDuoChange = (slotIndex: 0 | 1, value: string) => {
    setDuoPlayers((prev) => {
      const copy: [string, string] = [...prev];
      copy[slotIndex] = value;
      return copy;
    });
    setError(null);
  };

  const handleSingleChange = (value: string) => {
    setSinglePlayer(value);
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
        submitted_by: user?.uid || 'anonymous',
        submitted_by_name: user?.displayName || user?.email || 'Team Manager',
      };

      const res = await fetch('/api/lineups', {
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

  // Helper to render a player selection dropdown with exclusion
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
            const isAlreadySelectedElsewhere = selectedPlayerIds.has(pId) && pId !== currentValue;
            const pName = player.player_name || player.name;
            const pPos = player.position ? `[${player.position}]` : '';
            const pCat = player.category ? `(${player.category})` : '';

            return (
              <option
                key={pId}
                value={pId}
                disabled={isAlreadySelectedElsewhere}
              >
                {pName} {pPos} {pCat} {isAlreadySelectedElsewhere ? '• (Assigned)' : ''}
              </option>
            );
          })}
        </select>
        <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
      </div>
    );
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
    <div className="space-y-6 font-mono text-slate-800">
      {/* Title & Rules Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-2xl p-6 text-white shadow-md relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
        
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-400/20 border border-amber-400/30 text-amber-300 rounded-lg text-[10px] font-black uppercase tracking-wider mb-2">
              <Sparkles className="w-3 h-3" /> SS TRIPLE THREAT
            </div>
            <h2 className="text-xl font-black uppercase tracking-wide flex items-center gap-2">
              Matchday Lineup Submission
            </h2>
            <p className="text-xs text-slate-300 font-sans mt-1">
              Field exactly <strong className="text-white">5 unique players</strong> across Co-op, Duo, and Single modes. No player can participate in more than one mode.
            </p>
          </div>

          {/* Progress Tracker */}
          <div className="bg-white/10 backdrop-blur-xs border border-white/15 rounded-xl p-3.5 text-center min-w-[160px]">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-300 mb-0.5">Lineup Progress</div>
            <div className="text-2xl font-black text-amber-400">
              {selectedCount} <span className="text-xs font-normal text-slate-300">/ 5</span>
            </div>
            <div className="text-[9px] uppercase font-bold text-emerald-400 mt-0.5">
              {isLineupComplete ? '✓ All 5 Selected' : `${5 - selectedCount} remaining`}
            </div>
          </div>
        </div>

        {/* Deadline Notice */}
        {deadlineInfo?.awayDeadline && (
          <div className="mt-4 pt-4 border-t border-white/10 flex items-center gap-2 text-xs text-amber-200">
            <Clock className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Away Team Submission Deadline: <strong>2:00 PM (14:00)</strong> on Matchday.
            </span>
          </div>
        )}
      </div>

      {/* Lock Banner if not editable */}
      {!isEditable && (
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-800 text-xs flex items-center gap-3">
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
        <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-rose-700 text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {successMessage && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-emerald-700 text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Mode 1: Co-op Match (2v2) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs transition-all hover:border-slate-300">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-600">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Mode 1: Co-op Match (2v2)
              </h3>
              <p className="text-[10px] text-slate-400 font-sans">
                Win = 3 Pts • Draw = 1 Pt • Loss = 0 Pts (2 Players)
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-[10px] font-bold uppercase">
            {coopPlayers.filter(Boolean).length} / 2 Selected
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">
              Co-op Player 1
            </label>
            {renderPlayerDropdown(coopPlayers[0], (v) => handleCoopChange(0, v), '-- SELECT CO-OP PLAYER 1 --')}
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">
              Co-op Player 2
            </label>
            {renderPlayerDropdown(coopPlayers[1], (v) => handleCoopChange(1, v), '-- SELECT CO-OP PLAYER 2 --')}
          </div>
        </div>
      </div>

      {/* Mode 2: Duo Match (2v2 Goal Based) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs transition-all hover:border-slate-300">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Mode 2: Duo Match (2v2 Goal Based)
              </h3>
              <p className="text-[10px] text-slate-400 font-sans">
                Win = 3 Pts • Draw = 1 Pt • Loss = 0 Pts (2 Players)
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[10px] font-bold uppercase">
            {duoPlayers.filter(Boolean).length} / 2 Selected
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">
              Duo Player 1
            </label>
            {renderPlayerDropdown(duoPlayers[0], (v) => handleDuoChange(0, v), '-- SELECT DUO PLAYER 1 --')}
          </div>
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">
              Duo Player 2
            </label>
            {renderPlayerDropdown(duoPlayers[1], (v) => handleDuoChange(1, v), '-- SELECT DUO PLAYER 2 --')}
          </div>
        </div>
      </div>

      {/* Mode 3: Single Match (1v1) */}
      <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-xs transition-all hover:border-slate-300">
        <div className="flex items-center justify-between mb-4 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-600">
              <Swords className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-900">
                Mode 3: Single Match (1v1)
              </h3>
              <p className="text-[10px] text-slate-400 font-sans">
                Win = 3 Pts • Draw = 1 Pt • Loss = 0 Pts (1 Player)
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-lg text-[10px] font-bold uppercase">
            {singlePlayer ? '1 / 1' : '0 / 1'} Selected
          </span>
        </div>

        <div className="max-w-md">
          <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1.5">
            Single (1v1) Player
          </label>
          {renderPlayerDropdown(singlePlayer, handleSingleChange, '-- SELECT 1V1 PLAYER --')}
        </div>
      </div>

      {/* Action Submit Button */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-200">
        <div className="text-xs text-slate-500 font-sans">
          🔥 <strong className="text-slate-800">Clean Sweep Rule:</strong> Winning all 3 matches awards an extra <span className="text-amber-600 font-bold">+1 Bonus Point</span> (10 Max Points).
        </div>

        <button
          type="button"
          disabled={!isEditable || submitting || !validationResult.valid}
          onClick={handleSubmit}
          className={`w-full sm:w-auto px-6 py-3 rounded-xl font-mono text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm ${
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
