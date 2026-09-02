'use client';

import React, { useState, useRef, useEffect, useId } from 'react';
import { Search, ChevronDown, Check, User } from 'lucide-react';

export interface PlayerOption {
  player_id: string;
  player_name: string;
  category?: string;
  photo_url?: string;
}

interface SearchablePlayerSelectProps {
  players: PlayerOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
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

export default function SearchablePlayerSelect({
  players,
  value,
  onChange,
  placeholder = 'Select player...',
  disabled = false,
}: SearchablePlayerSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(0);

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const searchInputId = useId();

  const selectedPlayer = players.find(p => p.player_id === value);

  // Filter & sort players based on category priority & search query
  const filteredPlayers = players
    .filter(p => {
      if (!searchTerm.trim()) return true;
      const term = searchTerm.toLowerCase();
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

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Reset highlight index when filter changes or dropdown opens
  useEffect(() => {
    setHighlightedIndex(0);
  }, [searchTerm, isOpen]);

  // Focus search input when dropdown opens
  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isOpen]);

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
      setHighlightedIndex(prev => (prev + 1) % Math.max(1, filteredPlayers.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => (prev - 1 + filteredPlayers.length) % Math.max(1, filteredPlayers.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredPlayers[highlightedIndex]) {
        onChange(filteredPlayers[highlightedIndex].player_id);
        setIsOpen(false);
        setSearchTerm('');
      }
    } else if (e.key === 'Escape' || e.key === 'Tab') {
      setIsOpen(false);
    }
  };

  const getCategoryBadgeClass = (category?: string) => {
    if (!category) return 'bg-slate-100 text-slate-700 border-slate-200';
    const cat = category.toLowerCase();
    if (cat.includes('icon') || cat.includes('legend') || cat.includes('tier 1') || cat.includes('marquee')) {
      return 'bg-amber-100 text-amber-800 border-amber-300 font-extrabold';
    }
    if (cat.includes('tier 2') || cat.includes('classic') || cat.includes('gold')) {
      return 'bg-blue-100 text-blue-800 border-blue-300 font-bold';
    }
    if (cat.includes('tier 3') || cat.includes('silver')) {
      return 'bg-slate-200 text-slate-800 border-slate-300 font-semibold';
    }
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div ref={containerRef} className="relative w-full font-mono">
      {/* Dropdown Trigger Button */}
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        className={`w-full flex items-center justify-between px-3 py-2.5 bg-white border-2 rounded-xl text-left transition-all shadow-sm ${
          disabled
            ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-not-allowed'
            : isOpen
            ? 'border-blue-500 ring-2 ring-blue-500/20'
            : 'border-slate-300 hover:border-slate-400'
        }`}
      >
        <div className="flex items-center gap-2.5 overflow-hidden flex-1 mr-2">
          {selectedPlayer ? (
            <>
              {selectedPlayer.photo_url ? (
                <img
                  src={selectedPlayer.photo_url}
                  alt={selectedPlayer.player_name}
                  className="w-8 h-8 rounded-full object-cover border border-slate-200 flex-shrink-0"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                  {selectedPlayer.player_name.charAt(0)}
                </div>
              )}
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
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 flex-shrink-0 ${
            isOpen ? 'rotate-180 text-blue-600' : ''
          }`}
        />
      </button>

      {/* Popover Dropdown Panel */}
      {isOpen && (
        <div className="absolute z-50 left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-xl overflow-hidden flex flex-col max-h-72 animate-in fade-in zoom-in-95 duration-150">
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
            {filteredPlayers.length === 0 ? (
              <li className="p-4 text-center text-xs font-semibold text-slate-400">
                No matching players found
              </li>
            ) : (
              filteredPlayers.map((player, idx) => {
                const isSelected = player.player_id === value;
                const isHighlighted = idx === highlightedIndex;

                return (
                  <li
                    key={player.player_id}
                    onClick={() => {
                      onChange(player.player_id);
                      setIsOpen(false);
                      setSearchTerm('');
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                    className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-blue-50 border border-blue-200 text-blue-900'
                        : isHighlighted
                        ? 'bg-slate-100 text-slate-900'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {player.photo_url ? (
                        <img
                          src={player.photo_url}
                          alt={player.player_name}
                          className="w-7 h-7 rounded-full object-cover border border-slate-200 flex-shrink-0"
                        />
                      ) : (
                        <div className="w-7 h-7 rounded-full bg-slate-800 text-white flex items-center justify-center font-bold text-xs flex-shrink-0">
                          {player.player_name.charAt(0)}
                        </div>
                      )}
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-extrabold text-slate-800 truncate">
                          {player.player_name}
                        </span>
                        {player.category && (
                          <span
                            className={`inline-block self-start text-[8px] uppercase tracking-wider px-1.5 py-0.2 rounded border ${getCategoryBadgeClass(
                              player.category
                            )}`}
                          >
                            {player.category}
                          </span>
                        )}
                      </div>
                    </div>

                    {isSelected && <Check className="w-4 h-4 text-blue-600 flex-shrink-0 ml-2" />}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
