'use client';

import React, { memo, useCallback, useMemo, useState } from 'react';
import SearchablePlayerSelect from '@/components/SearchablePlayerSelect';
import PlayerPhoto from '@/components/PlayerPhoto';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import {
  getTripleThreatModeDisplay,
  getTripleThreatSidePlayers,
  resolveTripleThreatMode,
} from '@/lib/tournament/triple-threat-engine';

export interface EditableMatchupItem {
  home_player_id: string;
  home_player_name: string;
  away_player_id: string;
  away_player_name: string;
  position: number;
  match_duration?: number;
  home_goals?: number | null;
  away_goals?: number | null;
  home_original_player_id?: string;
  home_original_player_name?: string;
  home_substituted?: boolean;
  home_sub_penalty?: number;
  away_original_player_id?: string;
  away_original_player_name?: string;
  away_substituted?: boolean;
  away_sub_penalty?: number;
  match_mode?: string;
  home_player_ids?: string[];
  home_player_names?: string[];
  away_player_ids?: string[];
  away_player_names?: string[];
  [key: string]: any;
}

interface EditMatchupsSectionProps {
  fixtureId: string;
  fixture: {
    home_team_name: string;
    away_team_name: string;
    tournament_type?: string | null;
    matchday_format?: string | null;
    scoring_system?: string | null;
    knockout_format?: string | null;
    tournament_id?: string | null;
  };
  initialMatchups: EditableMatchupItem[];
  isTT: boolean;
  isHomeTeam: boolean;
  isAwayTeam: boolean;
  isAdmin: boolean;
  homeStartingXI: any[];
  awayStartingXI: any[];
  homeSquadById: Map<string, any>;
  homeSquadByName: Map<string, any>;
  awaySquadById: Map<string, any>;
  awaySquadByName: Map<string, any>;
  getCategoryPriority: (category?: string) => number;
  getCategoryBadgeClass: (category?: string) => string;
  showAlert: (opts: {
    type: 'success' | 'error' | 'warning' | 'info';
    title: string;
    message: string;
  }) => void;
  onCancel: () => void;
  onSaved: (updatedMatchups: EditableMatchupItem[]) => void;
}

function cloneMatchups(items: EditableMatchupItem[]): EditableMatchupItem[] {
  return (items || []).map((m) => ({
    ...m,
    home_player_ids: Array.isArray(m.home_player_ids) ? [...m.home_player_ids] : undefined,
    home_player_names: Array.isArray(m.home_player_names) ? [...m.home_player_names] : undefined,
    away_player_ids: Array.isArray(m.away_player_ids) ? [...m.away_player_ids] : undefined,
    away_player_names: Array.isArray(m.away_player_names) ? [...m.away_player_names] : undefined,
  }));
}

function EditMatchupsSection({
  fixtureId,
  fixture,
  initialMatchups,
  isTT,
  isHomeTeam,
  isAwayTeam,
  isAdmin,
  homeStartingXI,
  awayStartingXI,
  homeSquadById,
  homeSquadByName,
  awaySquadById,
  awaySquadByName,
  getCategoryPriority,
  getCategoryBadgeClass,
  showAlert,
  onCancel,
  onSaved,
}: EditMatchupsSectionProps) {
  const [draftMatchups, setDraftMatchups] = useState<EditableMatchupItem[]>(() =>
    cloneMatchups(initialMatchups)
  );
  const [isSaving, setIsSaving] = useState(false);

  const isTTEdit = useMemo(
    () => isTT || draftMatchups.some((m) => Boolean(m.match_mode)),
    [isTT, draftMatchups]
  );

  const canEditHomeSide = isHomeTeam || isAdmin;
  const canEditAwaySide = isHomeTeam || isAwayTeam || isAdmin;
  const canEditDuration = !isTTEdit || isHomeTeam || isAdmin;

  const homeEditablePool = useMemo(() => {
    if (!isTTEdit) return homeStartingXI;
    const poolMap = new Map<string, any>();
    homeSquadById.forEach((p, pid) => {
      if (pid) poolMap.set(pid, p);
    });
    homeStartingXI.forEach((p: any) => {
      const pid = String(p?.player_id || '');
      if (pid && !poolMap.has(pid)) poolMap.set(pid, p);
    });
    return Array.from(poolMap.values()).sort((a: any, b: any) => {
      const pA = getCategoryPriority(a.category);
      const pB = getCategoryPriority(b.category);
      if (pA !== pB) return pA - pB;
      return (a.player_name || '').localeCompare(b.player_name || '');
    });
  }, [isTTEdit, homeSquadById, homeStartingXI, getCategoryPriority]);

  const awayEditablePool = useMemo(() => {
    if (!isTTEdit) return awayStartingXI;
    const poolMap = new Map<string, any>();
    awaySquadById.forEach((p, pid) => {
      if (pid) poolMap.set(pid, p);
    });
    awayStartingXI.forEach((p: any) => {
      const pid = String(p?.player_id || '');
      if (pid && !poolMap.has(pid)) poolMap.set(pid, p);
    });
    return Array.from(poolMap.values()).sort((a: any, b: any) => {
      const pA = getCategoryPriority(a.category);
      const pB = getCategoryPriority(b.category);
      if (pA !== pB) return pA - pB;
      return (a.player_name || '').localeCompare(b.player_name || '');
    });
  }, [isTTEdit, awaySquadById, awayStartingXI, getCategoryPriority]);

  // Precompute slot-level assignment label maps cleanly instead of recreating full player arrays per slot
  const getAssignedMapForTT = useCallback(
    (side: 'home' | 'away', targetMatchIdx: number, targetSlotIdx: number) => {
      const map: Record<string, string> = {};
      for (let mIdx = 0; mIdx < draftMatchups.length; mIdx++) {
        const sideArr = getTripleThreatSidePlayers(draftMatchups[mIdx], side);
        const modeMeta = getTripleThreatModeDisplay(draftMatchups, draftMatchups[mIdx]);
        const label = modeMeta?.title || `Match #${draftMatchups[mIdx].position}`;
        for (let sIdx = 0; sIdx < sideArr.ids.length; sIdx++) {
          const id = sideArr.ids[sIdx];
          if (id && !(mIdx === targetMatchIdx && sIdx === targetSlotIdx) && !map[id]) {
            map[id] = label;
          }
        }
      }
      return map;
    },
    [draftMatchups]
  );

  const getAssignedMapStandard = useCallback(
    (targetMatchIdx: number) => {
      const map: Record<string, string> = {};
      for (let mIdx = 0; mIdx < draftMatchups.length; mIdx++) {
        const id = draftMatchups[mIdx].away_player_id;
        if (mIdx !== targetMatchIdx && id && !map[id]) {
          map[id] = `Match #${draftMatchups[mIdx].position}`;
        }
      }
      return map;
    },
    [draftMatchups]
  );

  const handleTripleThreatSlotChange = useCallback(
    (targetMatchIdx: number, side: 'home' | 'away', targetSlotIdx: number, newPlayerId: string) => {
      const pool = side === 'home' ? homeEditablePool : awayEditablePool;
      const squadMap = side === 'home' ? homeSquadById : awaySquadById;

      setDraftMatchups((prev) => {
        const nextMatchups = cloneMatchups(prev);
        const currentSide = getTripleThreatSidePlayers(nextMatchups[targetMatchIdx], side);
        const oldPlayerId = currentSide.ids[targetSlotIdx] || '';
        const oldPlayerName =
          currentSide.names[targetSlotIdx] || squadMap.get(oldPlayerId)?.player_name || '';

        if (newPlayerId && newPlayerId === oldPlayerId) return prev;

        const syncMatchupSide = (mIdx: number, ids: string[], names: string[]) => {
          const cleanPairs = ids
            .map((id, i) => ({ id: id.trim(), name: (names[i] || '').trim() }))
            .filter((p) => p.id);
          const target = nextMatchups[mIdx];
          target[`${side}_player_ids`] = ids;
          target[`${side}_player_names`] = names;
          target[`${side}_player_id`] = cleanPairs[0]?.id || '';
          target[`${side}_player_name`] = cleanPairs.map((p) => p.name).filter(Boolean).join(' & ');
        };

        if (newPlayerId) {
          const selectedPlayer =
            pool.find((p: any) => p.player_id === newPlayerId) || squadMap.get(newPlayerId);
          const newPlayerName = selectedPlayer?.player_name || '';

          for (let mIdx = 0; mIdx < nextMatchups.length; mIdx++) {
            const otherSide = getTripleThreatSidePlayers(nextMatchups[mIdx], side);
            const dupIdx = otherSide.ids.findIndex(
              (id, sIdx) => id === newPlayerId && !(mIdx === targetMatchIdx && sIdx === targetSlotIdx)
            );
            if (dupIdx !== -1) {
              const updatedOtherIds = [...otherSide.ids];
              const updatedOtherNames = [...otherSide.names];
              updatedOtherIds[dupIdx] = oldPlayerId;
              updatedOtherNames[dupIdx] = oldPlayerName;
              syncMatchupSide(mIdx, updatedOtherIds, updatedOtherNames);
              if (mIdx === targetMatchIdx) {
                currentSide.ids[dupIdx] = oldPlayerId;
                currentSide.names[dupIdx] = oldPlayerName;
              }
              break;
            }
          }

          const updatedIds = [...currentSide.ids];
          const updatedNames = [...currentSide.names];
          updatedIds[targetSlotIdx] = newPlayerId;
          updatedNames[targetSlotIdx] = newPlayerName;
          syncMatchupSide(targetMatchIdx, updatedIds, updatedNames);
        } else {
          const updatedIds = [...currentSide.ids];
          const updatedNames = [...currentSide.names];
          updatedIds[targetSlotIdx] = '';
          updatedNames[targetSlotIdx] = '';
          syncMatchupSide(targetMatchIdx, updatedIds, updatedNames);
        }

        return nextMatchups;
      });
    },
    [homeEditablePool, awayEditablePool, homeSquadById, awaySquadById]
  );

  const handleSave = async () => {
    if (isTTEdit) {
      const homeAll: string[] = [];
      const awayAll: string[] = [];
      for (const m of draftMatchups) {
        const mode = resolveTripleThreatMode(m);
        const required = mode === 'coop' ? 2 : 1;
        const hSide = getTripleThreatSidePlayers(m, 'home');
        const aSide = getTripleThreatSidePlayers(m, 'away');
        const hFilled = hSide.ids.filter(Boolean);
        const aFilled = aSide.ids.filter(Boolean);
        if (hFilled.length !== required || aFilled.length !== required) {
          showAlert({
            type: 'warning',
            title: 'Incomplete Selection',
            message: `Please select all required players for Match #${m.position} (${mode === 'coop' ? '2v2 Co-op' : '1v1'}).`,
          });
          return;
        }
        homeAll.push(...hFilled);
        awayAll.push(...aFilled);
      }
      if (new Set(homeAll).size !== homeAll.length || new Set(awayAll).size !== awayAll.length) {
        showAlert({
          type: 'warning',
          title: 'Duplicate Players',
          message: 'Each player can only be assigned to one Triple Threat slot per fixture.',
        });
        return;
      }
    }

    const payloadMatchups = draftMatchups.map((m) => {
      if (!isTTEdit) return m;
      const mode = resolveTripleThreatMode(m);
      const hSide = getTripleThreatSidePlayers(m, 'home');
      const aSide = getTripleThreatSidePlayers(m, 'away');
      const hIds = hSide.ids.filter(Boolean);
      const hNames = hSide.names.filter(Boolean);
      const aIds = aSide.ids.filter(Boolean);
      const aNames = aSide.names.filter(Boolean);
      return {
        ...m,
        match_mode: mode,
        home_player_ids: hIds,
        home_player_names: hNames,
        home_player_id: hIds[0] || '',
        home_player_name: hNames.join(' & '),
        away_player_ids: aIds,
        away_player_names: aNames,
        away_player_id: aIds[0] || '',
        away_player_name: aNames.join(' & '),
      };
    });

    setIsSaving(true);
    try {
      const response = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/matchups`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ matchups: payloadMatchups }),
      });
      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || 'Failed to update matchups');
      }

      let freshMatchups = payloadMatchups;
      try {
        const refreshRes = await fetchWithTokenRefresh(`/api/fixtures/${fixtureId}/matchups`);
        if (refreshRes.ok) {
          const refreshJson = await refreshRes.json();
          if (Array.isArray(refreshJson.matchups) && refreshJson.matchups.length > 0) {
            freshMatchups = refreshJson.matchups;
          }
        }
      } catch {
        // Fallback to payloadMatchups if refresh fetch fails
      }

      onSaved(freshMatchups);
      showAlert({
        type: 'success',
        title: 'Updated',
        message: 'Matchups updated successfully!',
      });
    } catch (error: any) {
      console.error('Error updating matchups:', error);
      showAlert({
        type: 'error',
        title: 'Update Failed',
        message: error?.message || 'Failed to update matchups',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const renderReadOnlyPlayerChip = (
    side: 'home' | 'away',
    pid: string,
    pname: string,
    catOverride?: string,
    photoFallback?: string
  ) => {
    const squadMap = side === 'home' ? homeSquadById : awaySquadById;
    const squadNameMap = side === 'home' ? homeSquadByName : awaySquadByName;
    const pMatch = squadMap.get(pid) || (pname ? squadNameMap.get(pname.toLowerCase()) : undefined);
    const pCat = catOverride || pMatch?.category;
    const boxTone =
      side === 'home'
        ? 'bg-blue-50/60 border-blue-200/80'
        : 'bg-slate-50 border-slate-200/80';
    const photoBorder = side === 'home' ? 'border-blue-300' : 'border-slate-300';
    return (
      <div key={pid || pname} className={`p-2 rounded-xl border min-w-0 ${boxTone}`}>
        <div className="flex items-center gap-2">
          <PlayerPhoto
            photoUrl={pMatch?.photo_url || photoFallback}
            playerName={pname}
            size={32}
            shape="circle"
            posXCircle={pMatch?.photo_position_x_circle}
            posYCircle={pMatch?.photo_position_y_circle}
            scaleCircle={pMatch?.photo_scale_circle}
            className={`border ${photoBorder} flex-shrink-0`}
          />
          <div className="flex flex-col min-w-0">
            <span className="font-black text-xs text-slate-900 truncate">{pname || 'TBD'}</span>
            {pCat && (
              <span
                className={`inline-block text-[8px] uppercase tracking-wider px-1 py-0.2 rounded border self-start mt-0.5 ${getCategoryBadgeClass(
                  pCat
                )}`}
              >
                {pCat}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {/* Quick Actions Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-50 border border-slate-200/80 rounded-2xl font-mono text-xs">
        {isTTEdit ? (
          <div className="flex items-center gap-2 text-[11px] font-bold text-slate-600">
            <span>⚡ Triple Threat</span>
            <span className="text-slate-400">•</span>
            <span className="text-indigo-700">Co-op: 8m default</span>
            <span className="hidden sm:inline text-slate-400">|</span>
            <span className="hidden sm:inline text-emerald-700">
              Duo &amp; Solo: Home&apos;s choice
            </span>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              const availableAway = [...awayStartingXI];
              setDraftMatchups((prev) =>
                prev.map((m) => {
                  const homeMatch =
                    homeSquadById.get(m.home_player_id) ||
                    homeSquadByName.get(m.home_player_name?.toLowerCase());
                  const homeCat = (m.home_category || homeMatch?.category || '').toUpperCase();
                  let matchIdx = availableAway.findIndex(
                    (aP) => (aP.category || '').toUpperCase() === homeCat
                  );
                  if (matchIdx === -1) matchIdx = 0;
                  const selectedAway = availableAway[matchIdx];
                  if (selectedAway) {
                    availableAway.splice(matchIdx, 1);
                    return {
                      ...m,
                      away_player_id: selectedAway.player_id,
                      away_player_name: selectedAway.player_name,
                    };
                  }
                  return m;
                })
              );
            }}
            className="flex-1 min-w-[140px] inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-amber-400 hover:bg-amber-300 text-slate-900 font-extrabold text-[10px] uppercase tracking-wider rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            ⚡ Auto-Pair by Category
          </button>
        )}

        {canEditDuration && (
          <div className="flex items-center gap-1 text-[10px] font-bold text-slate-500 ml-auto">
            <span className="hidden sm:inline">
              {isTTEdit ? 'Set Duo & Solo:' : 'Set All:'}
            </span>
            {(isTTEdit ? [6, 7, 8, 10] : [6, 8, 10]).map((dur) => (
              <button
                key={dur}
                type="button"
                onClick={() => {
                  setDraftMatchups((prev) =>
                    prev.map((m) => {
                      if (isTTEdit && resolveTripleThreatMode(m) === 'coop') {
                        return m;
                      }
                      return { ...m, match_duration: dur };
                    })
                  );
                }}
                className="px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-slate-700 font-extrabold shadow-3xs transition-colors cursor-pointer"
              >
                {dur}m
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Matchup Cards (Static surface — no hover transform or shimmer repaint) */}
      {draftMatchups.map((matchup, idx) => {
        const ttMode = isTTEdit ? resolveTripleThreatMode(matchup) : null;
        const modeMeta = isTTEdit ? getTripleThreatModeDisplay(draftMatchups, matchup) : null;
        const isCoopMatch = ttMode === 'coop';
        const defaultDur = isCoopMatch ? 8 : 6;
        const homeSide = isTTEdit ? getTripleThreatSidePlayers(matchup, 'home') : null;
        const awaySide = isTTEdit ? getTripleThreatSidePlayers(matchup, 'away') : null;

        return (
          <div
            key={matchup.position ?? idx}
            className="bg-white border border-slate-200 rounded-2xl p-3.5 shadow-xs font-mono"
          >
            {/* Header with Match #, Mode Badge, and Duration */}
            <div className="flex items-center justify-between gap-2 mb-2.5 pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center px-2.5 py-0.5 bg-slate-800 text-white text-[10px] font-bold rounded-md">
                  Match #{matchup.position}
                </span>
                {isTTEdit && modeMeta && (
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-extrabold rounded-md border ${modeMeta.badgeClass}`}
                  >
                    <span>{modeMeta.icon}</span>
                    <span>{modeMeta.title}</span>
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <svg
                  className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <select
                  value={matchup.match_duration ?? defaultDur}
                  disabled={!canEditDuration}
                  onChange={(e) => {
                    const dur = Number(e.target.value);
                    setDraftMatchups((prev) =>
                      prev.map((m, i) => (i === idx ? { ...m, match_duration: dur } : m))
                    );
                  }}
                  className="no-console-override !px-2 !py-1 text-[11px] font-bold border border-slate-300 rounded-lg bg-slate-50 focus:ring-1 focus:ring-emerald-500 disabled:opacity-60 cursor-pointer"
                >
                  <option value={6}>6 min</option>
                  <option value={7}>7 min</option>
                  <option value={8}>8 min</option>
                  <option value={9}>9 min</option>
                  <option value={10}>10 min</option>
                  <option value={11}>11 min</option>
                  <option value={12}>12 min</option>
                </select>
              </div>
            </div>

            {/* Players Grid */}
            {isTTEdit && homeSide && awaySide ? (
              <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] gap-2.5 items-center">
                {/* Home Side */}
                <div className="space-y-1.5 min-w-0">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                    {fixture.home_team_name} {isCoopMatch ? '(2v2 Pair)' : ''}
                  </div>
                  {canEditHomeSide ? (
                    <div className="space-y-1.5">
                      {homeSide.ids.map((slotId, sIdx) => (
                        <SearchablePlayerSelect
                          key={`home-${idx}-${sIdx}`}
                          players={homeEditablePool}
                          assignedByPlayerId={getAssignedMapForTT('home', idx, sIdx)}
                          value={slotId}
                          onChange={(val) => handleTripleThreatSlotChange(idx, 'home', sIdx, val)}
                          placeholder={
                            isCoopMatch ? `Select home partner ${sIdx + 1}...` : 'Select home player...'
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {homeSide.ids.map((pid, sIdx) =>
                        renderReadOnlyPlayerChip(
                          'home',
                          pid,
                          homeSide.names[sIdx] || '',
                          undefined,
                          matchup.home_photo_url
                        )
                      )}
                    </div>
                  )}
                </div>

                {/* VS */}
                <div className="flex justify-center">
                  <div className="px-2.5 py-0.5 bg-slate-800 text-amber-400 text-[10px] font-black rounded-full shadow-sm text-center">
                    VS
                  </div>
                </div>

                {/* Away Side */}
                <div className="space-y-1.5 min-w-0">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider md:text-right">
                    {fixture.away_team_name} {isCoopMatch ? '(2v2 Pair)' : ''}
                  </div>
                  {canEditAwaySide ? (
                    <div className="space-y-1.5">
                      {awaySide.ids.map((slotId, sIdx) => (
                        <SearchablePlayerSelect
                          key={`away-${idx}-${sIdx}`}
                          players={awayEditablePool}
                          assignedByPlayerId={getAssignedMapForTT('away', idx, sIdx)}
                          value={slotId}
                          onChange={(val) => handleTripleThreatSlotChange(idx, 'away', sIdx, val)}
                          placeholder={
                            isCoopMatch ? `Select away partner ${sIdx + 1}...` : 'Select away player...'
                          }
                        />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {awaySide.ids.map((pid, sIdx) =>
                        renderReadOnlyPlayerChip(
                          'away',
                          pid,
                          awaySide.names[sIdx] || '',
                          undefined,
                          matchup.away_photo_url
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                {renderReadOnlyPlayerChip(
                  'home',
                  matchup.home_player_id,
                  matchup.home_player_name,
                  matchup.home_category,
                  matchup.home_photo_url
                )}

                <div className="px-2 py-0.5 bg-slate-800 text-amber-400 text-[10px] font-black rounded-full shadow-sm text-center">
                  VS
                </div>

                <div className="min-w-0">
                  <SearchablePlayerSelect
                    players={awayStartingXI}
                    assignedByPlayerId={getAssignedMapStandard(idx)}
                    value={matchup.away_player_id || ''}
                    onChange={(val) => {
                      setDraftMatchups((prev) => {
                        const newMatchups = cloneMatchups(prev);
                        if (val) {
                          const otherIdx = newMatchups.findIndex(
                            (m, mIdx) => mIdx !== idx && m.away_player_id === val
                          );
                          if (otherIdx !== -1) {
                            newMatchups[otherIdx].away_player_id = '';
                            newMatchups[otherIdx].away_player_name = '';
                          }
                          const selectedPlayer = awayStartingXI.find((p) => p.player_id === val);
                          newMatchups[idx].away_player_id = val;
                          newMatchups[idx].away_player_name = selectedPlayer?.player_name || '';
                        } else {
                          newMatchups[idx].away_player_id = '';
                          newMatchups[idx].away_player_name = '';
                        }
                        return newMatchups;
                      });
                    }}
                    placeholder="Select away player..."
                  />
                </div>
              </div>
            )}

            {/* Sub Penalty Adjuster Controls in Edit Mode (Standard tournaments only) */}
            {!isTTEdit && (
              <div className="mt-2.5 pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                <div className="flex items-center gap-1.5 bg-orange-50/80 border border-orange-200/80 px-2.5 py-1 rounded-xl">
                  <span className="text-[10px] font-bold text-orange-900 uppercase tracking-wider">
                    Home Sub Penalty:
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={matchup.home_sub_penalty ?? 0}
                    onChange={(e) => {
                      const val = Math.max(0, parseInt(e.target.value) || 0);
                      setDraftMatchups((prev) =>
                        prev.map((m, i) => (i === idx ? { ...m, home_sub_penalty: val } : m))
                      );
                    }}
                    className="!w-14 !px-1.5 !py-1 bg-white border border-orange-300 rounded-lg text-center font-bold text-xs text-orange-900 focus:ring-1 focus:ring-orange-500"
                  />
                  <span className="text-[10px] font-bold text-orange-700">goals to away</span>
                </div>

                <div className="flex items-center gap-1.5 bg-orange-50/80 border border-orange-200/80 px-2.5 py-1 rounded-xl">
                  <span className="text-[10px] font-bold text-orange-900 uppercase tracking-wider">
                    Away Sub Penalty:
                  </span>
                  <input
                    type="number"
                    min="0"
                    value={matchup.away_sub_penalty ?? 0}
                    onChange={(e) => {
                      const val = Math.max(0, parseInt(e.target.value) || 0);
                      setDraftMatchups((prev) =>
                        prev.map((m, i) => (i === idx ? { ...m, away_sub_penalty: val } : m))
                      );
                    }}
                    className="!w-14 !px-1.5 !py-1 bg-white border border-orange-300 rounded-lg text-center font-bold text-xs text-orange-900 focus:ring-1 focus:ring-orange-500"
                  />
                  <span className="text-[10px] font-bold text-orange-700">goals to home</span>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Action Buttons */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onCancel}
          disabled={isSaving}
          className="flex-1 px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <span className="flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            Cancel
          </span>
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={isSaving}
          className="flex-1 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          <span className="flex items-center justify-center gap-2">
            {isSaving ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                Saving...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                Save Changes
              </>
            )}
          </span>
        </button>
      </div>
    </div>
  );
}

export default memo(EditMatchupsSection);
