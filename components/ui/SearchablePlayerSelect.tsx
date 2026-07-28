'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface Player {
  id: string;
  player_id: string;
  player_name: string;
  team_name?: string;
  auction_value?: number; // For real players
  acquisition_value?: number; // For football players
  star_rating: number;
  position?: string;
  contract_start_season?: string;
  contract_end_season?: string;
  type?: 'real' | 'football';
}

interface SearchablePlayerSelectProps {
  players: Player[];
  value: string;
  onChange: (playerId: string) => void;
  placeholder?: string;
  label: string;
  disabled?: boolean;
  color?: 'blue' | 'purple' | 'orange';
  showValueAs?: 'currency' | 'rating';
  playerType?: 'real' | 'football';
}

export default function SearchablePlayerSelect({
  players,
  value,
  onChange,
  placeholder = 'Search player...',
  label,
  disabled = false,
  color = 'blue',
  playerType = 'real'
}: SearchablePlayerSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

  const selectedPlayer = players.find(p => p.id === value);

  // Update dropdown position when opened
  useEffect(() => {
    if (isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setDropdownPosition({
        top: rect.bottom + 8, // 8px gap below button
        left: rect.left,
        width: rect.width,
      });
    }
  }, [isOpen]);

  // Get the value to display (auction_value for real players, acquisition_value for football players)
  const getPlayerValue = (player: Player) => {
    return playerType === 'football' ? (player.acquisition_value || 0) : (player.auction_value || 0);
  };

  const filteredPlayers = players.filter(p => 
    p.player_name.toLowerCase().includes(search.toLowerCase()) ||
    p.team_name?.toLowerCase().includes(search.toLowerCase())
  );

  // Close dropdown when clicking outside or scrolling outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node) &&
          buttonRef.current && !buttonRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleScroll = () => {
      setIsOpen(false);
    };

    // Small delay to prevent immediate closure
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
      window.addEventListener('scroll', handleScroll, true);
    }, 0);
    
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isOpen]);

  const colorClasses = {
    blue: {
      border: 'border-slate-800',
      ring: 'ring-amber-500/20',
      bg: 'bg-slate-50 border-l-4 border-amber-500',
      text: 'text-slate-900 font-extrabold',
      hover: 'hover:bg-slate-50/55'
    },
    purple: {
      border: 'border-slate-800',
      ring: 'ring-amber-500/20',
      bg: 'bg-slate-50 border-l-4 border-amber-500',
      text: 'text-slate-900 font-extrabold',
      hover: 'hover:bg-slate-50/55'
    },
    orange: {
      border: 'border-slate-800',
      ring: 'ring-amber-500/20',
      bg: 'bg-slate-50 border-l-4 border-amber-500',
      text: 'text-slate-900 font-extrabold',
      hover: 'hover:bg-slate-50/55'
    }
  };

  const colors = colorClasses[color];

  return (
    <div className="relative font-mono text-xs">
      <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
        {label}
      </label>

      {/* Selected Player Display / Search Input */}
      <div
        ref={buttonRef}
        className={`w-full px-4 py-3 rounded-xl border ${
          isOpen ? 'border-slate-800 ring-2 ring-amber-500/20' : 'border-slate-200/80 hover:border-slate-400'
        } bg-white cursor-pointer transition-all ${disabled ? 'opacity-50 cursor-not-allowed' : ''} shadow-sm`}
        onClick={() => {
          if (!disabled) {
            setIsOpen(!isOpen);
            setTimeout(() => inputRef.current?.focus(), 100);
          }
        }}
      >
        {selectedPlayer ? (
          <div className="flex items-center justify-between">
            <div className="flex-1">
              <div className="font-extrabold text-slate-800 uppercase tracking-wide">{selectedPlayer.player_name}</div>
              <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                {selectedPlayer.team_name} • <span className="text-amber-600 font-extrabold">{playerType === 'football' ? `${getPlayerValue(selectedPlayer)} eCoin` : `$${getPlayerValue(selectedPlayer)}`}</span> • {playerType === 'football' && selectedPlayer.position ? selectedPlayer.position : (selectedPlayer.star_rating > 20 ? `OVR: ${selectedPlayer.star_rating}` : `${selectedPlayer.star_rating}⭐`)}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
                setSearch('');
              }}
              className="text-slate-400 hover:text-slate-600 ml-2 font-bold px-1.5 py-0.5 bg-slate-50 hover:bg-slate-100 rounded-md border border-slate-200"
            >
              ✕
            </button>
          </div>
        ) : (
          <div className="text-slate-400 uppercase font-bold tracking-wider">{placeholder}</div>
        )}
      </div>

      {/* Dropdown - Using Portal for proper rendering */}
      {isOpen && typeof window !== 'undefined' && createPortal(
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-[9998]" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown with fixed positioning */}
          <div 
            ref={dropdownRef}
            className="fixed bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden font-mono z-[9999]"
            style={{
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              width: `${dropdownPosition.width}px`,
              maxHeight: '400px'
            }}
            onClick={(e) => e.stopPropagation()}
          >
          {/* Search Input */}
          <div className="p-3 border-b border-slate-100 sticky top-0 bg-white z-10">
            <input
              ref={inputRef}
              type="text"
              placeholder="🔍 Search name, team..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 focus:border-slate-800 focus:ring-2 focus:ring-amber-500/20 outline-none text-xs bg-slate-50/50 uppercase font-bold tracking-wider"
              onClick={(e) => e.stopPropagation()}
            />
            <div className="text-[9px] text-slate-400 mt-1.5 uppercase font-bold tracking-wider">
              {search ? `Matched ${filteredPlayers.length} / ${players.length}` : `${players.length} players listed`}
            </div>
          </div>

          {/* Player List */}
          <div className="dropdown-scroll-container overflow-y-auto" style={{ maxHeight: '320px' }}>
            {filteredPlayers.length === 0 ? (
              <div className="p-6 text-center text-slate-400 text-xs uppercase font-bold tracking-wider">
                No players found
              </div>
            ) : (
              filteredPlayers.map((player) => (
                <div
                  key={player.id}
                  onClick={() => {
                    onChange(player.id);
                    setIsOpen(false);
                    setSearch('');
                  }}
                  className={`p-3 cursor-pointer transition-colors ${
                    player.id === value ? colors.bg : 'hover:bg-slate-50/50'
                  } border-b border-slate-100 last:border-b-0`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className={`font-extrabold text-xs truncate uppercase tracking-wide ${player.id === value ? colors.text : 'text-slate-800'}`}>
                        {player.player_name}
                      </div>
                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5 truncate">
                        {player.team_name}
                      </div>
                    </div>
                    <div className="text-right ml-4 shrink-0">
                      <div className="text-xs font-black text-amber-600">
                        {playerType === 'football' ? `${getPlayerValue(player)} eCoin` : `$${getPlayerValue(player)}`}
                      </div>
                      <div className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mt-0.5">
                        {playerType === 'football' && player.position ? player.position : (player.star_rating > 20 ? `OVR: ${player.star_rating}` : `${player.star_rating}⭐`)}
                      </div>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}

