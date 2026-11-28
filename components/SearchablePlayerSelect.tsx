import React, { useState, useRef, useEffect, useId, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check, User } from 'lucide-react';
import PlayerPhoto from '@/components/PlayerPhoto';

export interface PlayerOption {
  player_id: string;
  player_name: string;
  category?: string;
  photo_url?: string;
  photo_position_x_circle?: number;
  photo_position_y_circle?: number;
  photo_scale_circle?: number;
  assigned_label?: string;
}

interface SearchablePlayerSelectProps {
  players: PlayerOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  assignedByPlayerId?: Record<string, string>;
}

const getCategoryPriority = (category?: string): number => {
  if (!category) return 99;
  const cat = category.toLowerCase().trim();
  if (cat.includes('red') || cat === 'r') return 1;
  if (cat.includes('black') || cat === 'bk' || cat === 'blk') return 2;
  if (cat.includes('blue') || cat === 'b') return 3;
  if (cat.includes('white') || cat === 'w') return 4;
  if (cat === 'tier 1' || cat.includes('icon') || cat.includes('marquee') || cat.includes('legend') || cat === 'tier 0' || cat === 't1') return 1;
  if (cat === 'tier 2' || cat.includes('classic') || cat.includes('gold') || cat === 't2') return 2;
  if (cat === 'tier 3' || cat.includes('silver') || cat === 't3') return 3;
  if (cat === 'tier 4' || cat.includes('bronze') || cat === 't4') return 4;
  if (cat.includes('uncapped') || cat.includes('realplayer') || cat.includes('base') || cat.includes('local')) return 5;
  return 10;
};

const getCategoryBadgeClass = (category?: string) => {
  if (!category) return 'bg-slate-100 text-slate-700 border-slate-200';
  const cat = category.toLowerCase().trim();
  if (cat.includes('red') || cat === 'r') {
    return 'bg-red-100 text-red-800 border-red-300 font-extrabold';
  }
  if (cat.includes('black') || cat === 'bk' || cat === 'blk') {
    return 'bg-slate-900 text-white border-slate-700 font-extrabold';
  }
  if (cat.includes('blue') || cat === 'b') {
    return 'bg-blue-100 text-blue-800 border-blue-300 font-bold';
  }
  if (cat.includes('white') || cat === 'w') {
    return 'bg-slate-100 text-slate-700 border-slate-300 font-semibold';
  }
  if (cat.includes('icon') || cat.includes('legend') || cat.includes('tier 1') || cat.includes('marquee')) {
    return 'bg-amber-100 text-amber-800 border-amber-300 font-extrabold';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
};

function SearchablePlayerSelect({
  players,
  value,
  onChange,
  placeholder = 'Select player...',
  disabled = false,
  allowClear = true,
  assignedByPlayerId,
}: SearchablePlayerSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);

  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const keyboardNavRef = useRef(false);
  const searchInputId = useId();

  const [dropdownPosition, setDropdownPosition] = useState<{ top?: number; bottom?: number; left: number; width: number }>({ left: 0, width: 0 });

  // Update dropdown position only while open, throttled to rAF and deduplicated
  useEffect(() => {
    if (!isOpen || !buttonRef.current) return;

    let rafId = 0;
    const computePosition = () => {
      if (!buttonRef.current) return;
      const rect = buttonRef.current.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const spaceAbove = rect.top;
      const openUpward = spaceBelow < 150 && spaceAbove > spaceBelow;

      const nextPos = openUpward
        ? {
            bottom: Math.round(Math.max(10, window.innerHeight - rect.top + 6)),
            left: Math.round(Math.max(10, rect.left)),
            width: Math.round(Math.min(rect.width, window.innerWidth - 20)),
          }
        : {
            top: Math.round(rect.bottom + 6),
            left: Math.round(Math.max(10, rect.left)),
            width: Math.round(Math.min(rect.width, window.innerWidth - 20)),
          };

      setDropdownPosition((prev) => {
        if (
          prev.top === nextPos.top &&
          prev.bottom === nextPos.bottom &&
          prev.left === nextPos.left &&
          prev.width === nextPos.width
        ) {
          return prev;
        }
        return nextPos;
      });
    };

    const schedulePositionUpdate = (e?: Event) => {
      if (e && dropdownRef.current && dropdownRef.current.contains(e.target as Node)) {
        return;
      }
      if (rafId) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        computePosition();
      });
    };

    computePosition();

    window.addEventListener('resize', schedulePositionUpdate);
    window.addEventListener('scroll', schedulePositionUpdate, true);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', schedulePositionUpdate);
      window.removeEventListener('scroll', schedulePositionUpdate, true);
    };
  }, [isOpen]);

  // Deduplicate input players by player_id cleanly
  const uniquePlayers = useMemo(() => {
    const map = new Map<string, PlayerOption>();
    (players || []).forEach(p => {
      if (p && p.player_id && !map.has(p.player_id)) {
        map.set(p.player_id, p);
      }
    });
    return Array.from(map.values());
  }, [players]);

  const selectedPlayer = useMemo(
    () => uniquePlayers.find(p => p.player_id === value),
    [uniquePlayers, value]
  );

  // Only filter & sort when dropdown is actually open
  const filteredPlayers = useMemo(() => {
    if (!isOpen) return [];
    const term = searchTerm.trim().toLowerCase();
    return uniquePlayers
      .filter(p => {
        if (!term) return true;
        return (
          (p.player_name && p.player_name.toLowerCase().includes(term)) ||
          (p.category && p.category.toLowerCase().includes(term))
        );
      })
      .sort((a, b) => {
        const pA = getCategoryPriority(a.category);
        const pB = getCategoryPriority(b.category);
        if (pA !== pB) return pA - pB;
        return (a.player_name || '').localeCompare(b.player_name || '');
      });
  }, [isOpen, uniquePlayers, searchTerm]);

  // Close when clicking outside (listener attached only while open)
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current && !containerRef.current.contains(event.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Reset highlight index when filter changes or dropdown opens
  useEffect(() => {
    if (isOpen) {
      keyboardNavRef.current = false;
      setHighlightedIndex(0);
    }
  }, [searchTerm, isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

  // Auto-scroll highlighted item into view ONLY during keyboard navigation (never mouse hover)
  useEffect(() => {
    if (isOpen && keyboardNavRef.current && highlightedIndex >= 0 && listRef.current) {
      const highlightedEl = listRef.current.children[highlightedIndex] as HTMLElement | undefined;
      if (highlightedEl) {
        highlightedEl.scrollIntoView({ block: 'nearest' });
      }
      keyboardNavRef.current = false;
    }
  }, [highlightedIndex, isOpen]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      keyboardNavRef.current = true;
      setHighlightedIndex(prev => (prev + 1) % Math.max(1, filteredPlayers.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      keyboardNavRef.current = true;
      setHighlightedIndex(prev => (prev - 1 + filteredPlayers.length) % Math.max(1, filteredPlayers.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const targetIdx = highlightedIndex >= 0 ? highlightedIndex : 0;
      if (filteredPlayers[targetIdx]) {
        onChange(filteredPlayers[targetIdx].player_id);
        setIsOpen(false);
        setSearchTerm('');
      }
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  return (
    <div ref={containerRef} className="relative w-full font-mono">
      {/* Dropdown Trigger Button */}
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        onKeyDown={handleKeyDown}
        className={`w-full flex items-center justify-between px-3 py-2 bg-white border-2 rounded-xl text-left transition-colors duration-75 shadow-xs ${
          disabled
            ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
            : isOpen
            ? 'border-blue-500 ring-2 ring-blue-500/20'
            : 'border-slate-300 hover:border-slate-400 cursor-pointer'
        }`}
      >
        <div className="flex items-center gap-2.5 overflow-hidden flex-1 mr-2">
          {selectedPlayer ? (
            <>
              <PlayerPhoto
                photoUrl={selectedPlayer.photo_url}
                playerName={selectedPlayer.player_name}
                size={32}
                shape="circle"
                posXCircle={selectedPlayer.photo_position_x_circle}
                posYCircle={selectedPlayer.photo_position_y_circle}
                scaleCircle={selectedPlayer.photo_scale_circle}
                className="border border-slate-200 flex-shrink-0"
              />
              <div className="flex flex-col truncate">
                <span className="text-xs sm:text-sm font-extrabold text-slate-900 truncate">
                  {selectedPlayer.player_name}
                </span>
                {selectedPlayer.category && (
                  <span
                    className={`inline-block self-start text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded border mt-0.5 ${getCategoryBadgeClass(
                      selectedPlayer.category
                    )}`}
                  >
                    {selectedPlayer.category}
                  </span>
                )}
              </div>
            </>
          ) : (
            <span className="text-xs sm:text-sm font-semibold text-slate-400 tracking-wider">
              {placeholder}
            </span>
          )}
        </div>

        <ChevronDown
          className={`w-4 h-4 text-slate-400 transition-transform duration-150 flex-shrink-0 ${
            isOpen ? 'rotate-180 text-blue-600' : ''
          }`}
        />
      </button>

      {/* Portal Dropdown Panel */}
      {isOpen && typeof window !== 'undefined' && createPortal(
        <>
          {/* Backdrop overlay */}
          <div
            className="fixed inset-0 z-[9998] bg-transparent"
            onClick={() => setIsOpen(false)}
          />
          <div
            ref={dropdownRef}
            className="fixed z-[9999] bg-white border border-slate-200 rounded-2xl shadow-lg overflow-hidden flex flex-col font-mono"
            style={{
              top: dropdownPosition.top !== undefined ? `${dropdownPosition.top}px` : undefined,
              bottom: dropdownPosition.bottom !== undefined ? `${dropdownPosition.bottom}px` : undefined,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
              maxHeight: '260px',
            }}
          >
            {/* Search Header */}
            <div className="p-2 border-b border-slate-100 bg-slate-50 flex items-center gap-2">
              <Search className="w-4 h-4 text-slate-400 ml-1.5 flex-shrink-0" />
              <input
                id={searchInputId}
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search name or category..."
                className="w-full bg-transparent text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none py-1.5"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="text-slate-400 hover:text-slate-600 text-xs px-1.5 font-bold"
                >
                  Clear
                </button>
              )}
            </div>

            {/* Options List */}
            <ul ref={listRef} className="overflow-y-auto p-1.5 space-y-1 max-h-56">
              {/* Clear / Unassign Option */}
              {allowClear && value && (
                <li
                  onClick={() => {
                    onChange('');
                    setIsOpen(false);
                    setSearchTerm('');
                  }}
                  className="flex items-center justify-between p-2 rounded-xl cursor-pointer text-rose-700 bg-rose-50/80 hover:bg-rose-100 border border-dashed border-rose-200/90 transition-colors duration-75 mb-1 shadow-2xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-rose-200 text-rose-800 flex items-center justify-center text-[10px] font-black">✕</span>
                    <span className="text-xs font-black uppercase tracking-wider">Unassign / Clear Selection</span>
                  </div>
                </li>
              )}

              {filteredPlayers.length === 0 ? (
                <li className="p-4 text-center text-xs font-semibold text-slate-400">
                  No matching players found
                </li>
              ) : (
                filteredPlayers.map((player, idx) => {
                  const isSelected = player.player_id === value;
                  const isHighlighted = idx === highlightedIndex;
                  const assignedLabel = assignedByPlayerId?.[player.player_id] ?? player.assigned_label;

                  return (
                    <li
                      key={player.player_id}
                      onClick={() => {
                        onChange(player.player_id);
                        setIsOpen(false);
                        setSearchTerm('');
                      }}
                      className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors duration-75 ${
                        isSelected
                          ? 'bg-blue-50 border border-blue-200 text-blue-900'
                          : isHighlighted
                          ? 'bg-slate-100 text-slate-900'
                          : 'hover:bg-slate-100 text-slate-800'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <PlayerPhoto
                          photoUrl={player.photo_url}
                          playerName={player.player_name}
                          size={28}
                          shape="circle"
                          posXCircle={player.photo_position_x_circle}
                          posYCircle={player.photo_position_y_circle}
                          scaleCircle={player.photo_scale_circle}
                          className="border border-slate-200 flex-shrink-0"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-xs font-extrabold text-slate-800 truncate">
                            {player.player_name}
                          </span>
                          <div className="flex items-center gap-1 mt-0.5">
                            {player.category && (
                              <span
                                className={`inline-block text-[8px] uppercase tracking-wider px-1.5 py-0.2 rounded border ${getCategoryBadgeClass(
                                  player.category
                                )}`}
                              >
                                {player.category}
                              </span>
                            )}
                            {assignedLabel && (
                              <span className="text-[8px] font-black text-amber-700 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded uppercase">
                                In {assignedLabel}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {isSelected && <Check className="w-4 h-4 text-blue-600 flex-shrink-0 ml-2" />}
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

export default memo(SearchablePlayerSelect);
