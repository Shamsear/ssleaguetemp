'use client';

import { SoccerBallIcon } from '@/components/ui/CustomIcons';
import { AlertCircle, Tag, Users, Wallet, AlertTriangle } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import OptimizedImage from '@/components/OptimizedImage';
import { createPortal } from 'react-dom';
import { normalizeStr } from '@/lib/utils/normalizeStr';
import AuthGuard from '@/components/auth/AuthGuard';

interface RealPlayer {
  player_id: string;
  player_name: string;
  display_name?: string;
  photo_url?: string;
  photo_position_x_circle?: number;
  photo_position_y_circle?: number;
  photo_scale_circle?: number;
  team: string;
  team_id: string;
  category: string;
  base_price?: number;
  price?: number;
  points: number;
  matches_played: number;
  goals_scored: number;
  assists: number;
}

interface PlayerPlan {
  id: string;
  player_id?: string;
  name: string;
  photo_url?: string;
  photo_position_x_circle?: number;
  photo_position_y_circle?: number;
  photo_scale_circle?: number;
  category?: string;
  basePrice: number;
  bidAmount: number;
  points: number;
}

const REQUIRED_PLAYERS = 5;
const TOTAL_BUDGET = 1000;

const CATEGORY_COLORS: Record<string, string> = {
  legend: 'bg-amber-100 text-amber-800 border-amber-300',
  icon:   'bg-violet-100 text-violet-800 border-violet-300',
  star:   'bg-blue-100 text-blue-800 border-blue-300',
  rising: 'bg-emerald-100 text-emerald-800 border-emerald-300',
};

const getCategoryStyle = (category?: string) => {
  if (!category) return 'bg-slate-100 text-slate-600 border-slate-200';
  return CATEGORY_COLORS[category.toLowerCase()] ?? 'bg-slate-100 text-slate-600 border-slate-200';
};

const getPhotoStyle = (x?: number, y?: number, scale?: number) => ({
  objectPosition: `${x ?? 50}% ${y ?? 50}%`,
  transform: `scale(${scale ?? 1})`,
  transformOrigin: `${x ?? 50}% ${y ?? 50}%`,
});

export default function RealPlayersPlannerPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [players, setPlayers] = useState<PlayerPlan[]>([]);
  const [requiredPlayers] = useState(REQUIRED_PLAYERS);
  const [availableRealPlayers, setAvailableRealPlayers] = useState<RealPlayer[]>([]);
  const [openDropdownIndex, setOpenDropdownIndex] = useState<number | null>(null);
  const [searchTerms, setSearchTerms] = useState<Record<number, string>>({});
  const [teamBudget, setTeamBudget] = useState(TOTAL_BUDGET);
  const [teamSpent, setTeamSpent] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const buttonRefs = useRef<{ [key: number]: HTMLButtonElement | null }>({});

  useEffect(() => {
    if (openDropdownIndex !== null && buttonRefs.current[openDropdownIndex]) {
      const button = buttonRefs.current[openDropdownIndex];
      if (button) {
        const rect = button.getBoundingClientRect();
        setDropdownPosition({
          top: rect.bottom + 8, // 8px gap below button (fixed positioning uses viewport coords)
          left: rect.left,
          width: rect.width,
        });
      }
    }
  }, [openDropdownIndex]);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (openDropdownIndex === null) return;

    const handleClickOutside = () => {
      setOpenDropdownIndex(null);
    };

    // Small delay to prevent immediate closure
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [openDropdownIndex]);

  // Close dropdown on scroll
  useEffect(() => {
    if (openDropdownIndex === null) return;

    const handleScroll = () => {
      setOpenDropdownIndex(null);
    };

    window.addEventListener('scroll', handleScroll, true);
    
    return () => {
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [openDropdownIndex]);

  useEffect(() => {
    const fetchData = async () => {
      if (!user) return;
      try {
        // Active season
        const seasonRes = await fetchWithTokenRefresh('/api/cached/firebase/seasons?isActive=true');
        if (!seasonRes.ok) return;
        const seasonData = await seasonRes.json();
        if (!seasonData.success || !seasonData.data?.length) return;

        const season = seasonData.data[0];
        const seasonId = season.id;

        // Budget
        const dashRes = await fetchWithTokenRefresh(`/api/team/dashboard?season_id=${seasonId}`);
        if (dashRes.ok) {
          const dash = await dashRes.json();
          if (dash.success && dash.data) {
            const ts = dash.data.seasonParticipation || {};
            const ss = dash.data.seasonSettings || {};
            setTeamBudget(ts.real_player_budget || ss.dollar_budget || TOTAL_BUDGET);
            setTeamSpent(ts.real_player_spent || 0);
          }
        }

        // Real players from realplayerstats
        const playersRes = await fetchWithTokenRefresh(`/api/stats/players?seasonId=${seasonId}&limit=1000`);
        if (playersRes.ok) {
          const playersData = await playersRes.json();
          if (playersData.success) {
            const realPlayers: RealPlayer[] = (playersData.data || []).filter(
              (p: any) => p.category && p.category !== ''
            );

            // Fetch photos
            const ids = realPlayers.map((p) => p.player_id).filter(Boolean);
            if (ids.length > 0) {
              try {
                const photosRes = await fetchWithTokenRefresh(
                  '/api/real-players?' + new URLSearchParams({ playerIds: ids.join(',') })
                );
                if (photosRes.ok) {
                  const photosData = await photosRes.json();
                  if (photosData.success && photosData.players) {
                    const photoMap = new Map(
                      photosData.players.map((p: any) => [
                        p.player_id,
                        {
                          photo_url: p.photo_url,
                          photo_position_x_circle: p.photo_position_x_circle,
                          photo_position_y_circle: p.photo_position_y_circle,
                          photo_scale_circle: p.photo_scale_circle,
                        },
                      ])
                    );
                    realPlayers.forEach((player) => {
                      const photoData = photoMap.get(player.player_id);
                      if (photoData) Object.assign(player, photoData);
                    });
                  }
                }
              } catch {}
            }

            setAvailableRealPlayers(realPlayers);
          }
        }
      } catch (err) {
        console.error('Error fetching planner data:', err);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [user]);

  // Init empty slots
  useEffect(() => {
    if (players.length === 0) {
      setPlayers(Array.from({ length: requiredPlayers }, (_, i) => createEmptyPlayer(i)));
    }
  }, [requiredPlayers]);

  const createEmptyPlayer = (i: number): PlayerPlan => ({
    id: `slot-${Date.now()}-${i}`,
    name: 'Select a player...',
    basePrice: 0,
    bidAmount: 0,
    points: 0,
  });

  const selectRealPlayer = (rp: RealPlayer, index: number) => {
    const basePrice = rp.base_price || rp.price || 0;
    setPlayers((prev) =>
      prev.map((p, i) =>
        i !== index
          ? p
          : {
              ...p,
              player_id: rp.player_id,
              name: rp.display_name || rp.player_name,
              photo_url: rp.photo_url,
              photo_position_x_circle: rp.photo_position_x_circle,
              photo_position_y_circle: rp.photo_position_y_circle,
              photo_scale_circle: rp.photo_scale_circle,
              category: rp.category,
              basePrice,
              bidAmount: basePrice,
              points: rp.points || 0,
            }
      )
    );
    setOpenDropdownIndex(null);
    setSearchTerms((t) => ({ ...t, [index]: '' }));
  };

  const updateBid = (id: string, value: number) => {
    setPlayers((prev) => prev.map((p) => (p.id === id ? { ...p, bidAmount: value } : p)));
  };

  const removePlayer = (id: string) => {
    if (players.length > requiredPlayers) {
      setPlayers((prev) => prev.filter((p) => p.id !== id));
    }
  };

  const addPlayer = () => {
    if (players.length < requiredPlayers) {
      setPlayers((prev) => [...prev, createEmptyPlayer(prev.length)]);
    }
  };

  const getFiltered = (index: number) => {
    const term = (searchTerms[index] || '').toLowerCase();
    return availableRealPlayers
      .filter(
        (p) =>
          normalizeStr(p.player_name).includes(normalizeStr(term)) ||
          normalizeStr(p.display_name).includes(normalizeStr(term)) ||
          normalizeStr(p.team).includes(normalizeStr(term)) ||
          normalizeStr(p.category).includes(normalizeStr(term))
      )
      .filter((p) => !players.some((pl) => pl.player_id === p.player_id));
  };

  const totalPlannedSpend = players.reduce((s, p) => s + (p.bidAmount || 0), 0);
  const remainingBudget = teamBudget - teamSpent - totalPlannedSpend;
  const isOverBudget = remainingBudget < 0;

  if (loading || isLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto" />
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading Planner...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'team') return null;

  return (
    <AuthGuard requiredRole="team">
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Back */}
        <Link
          href="/dashboard"
          className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center w-fit mb-4"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Dashboard
        </Link>

        {/* Header */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/10 flex-shrink-0">
              <Users className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-slate-800">
                Real Players Planner
              </h1>
              <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                Plan your bids for {requiredPlayers} SS Members · Auction preparation tool
              </p>
            </div>
          </div>
        </div>

        {/* Budget Summary */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-sky-500 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Total Budget</p>
              <Wallet className="w-4 h-4 text-sky-500" />
            </div>
            <p className="text-2xl font-black text-slate-800">{teamBudget.toLocaleString()}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">COINS available</p>
          </div>

          <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-violet-500 rounded-2xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Planned Bids</p>
              <Tag className="w-4 h-4 text-violet-500" />
            </div>
            <p className="text-2xl font-black text-violet-700">{totalPlannedSpend.toLocaleString()}</p>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
              {players.filter((p) => p.player_id).length} / {requiredPlayers} players selected
            </p>
          </div>

          <div className={`console-card bg-white border border-slate-200/60 border-l-4 rounded-2xl p-5 shadow-sm ${isOverBudget ? 'border-l-rose-500' : 'border-l-emerald-500'}`}>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Remaining</p>
              <span className={`px-2 py-0.5 rounded-lg text-[9px] font-black uppercase border ${isOverBudget ? 'bg-rose-50 text-rose-700 border-rose-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
                {isOverBudget ? 'Over Budget' : 'OK'}
              </span>
            </div>
            <p className={`text-2xl font-black ${isOverBudget ? 'text-rose-600' : 'text-emerald-700'}`}>
              {remainingBudget.toLocaleString()}
            </p>
            <p className="text-[10px] text-slate-400 font-bold uppercase mt-1">
              Already spent: {teamSpent > 0 ? `${teamSpent} COINS` : 'None'}
            </p>
          </div>
        </div>

        {/* Player Slots */}
        <div className="space-y-4">
          {players.map((player, index) => (
            <div
              key={player.id}
              className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm relative"
            >
              {/* Slot header */}
              <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
                <h3 className="text-xs font-black text-slate-800 flex items-center gap-2 uppercase tracking-wider">
                  <span className="bg-slate-800 text-amber-400 w-6 h-6 border border-slate-900 rounded-lg flex items-center justify-center font-black text-xs shadow-md">
                    {index + 1}
                  </span>
                  Roster Slot {index + 1}
                </h3>
                <button
                  onClick={() => removePlayer(player.id)}
                  disabled={players.length <= requiredPlayers}
                  className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  title="Remove slot"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left: player dropdown */}
                <div className="space-y-4">
                  <div className="relative">
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Select SS Member
                    </label>
                    <button
                      ref={(el) => { buttonRefs.current[index] = el; }}
                      onClick={(e) => {
                        e.stopPropagation();
                        setOpenDropdownIndex(openDropdownIndex === index ? null : index);
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 hover:border-amber-400/40 hover:bg-slate-50 transition-colors text-left flex items-center gap-3 cursor-pointer shadow-sm bg-white"
                    >
                      {player.photo_url ? (
                        <div className="w-9 h-9 rounded-xl overflow-hidden flex-shrink-0 border border-slate-200/80 shadow-sm relative bg-slate-100">
                          <OptimizedImage
                            src={player.photo_url}
                            alt={player.name}
                            width={80}
                            height={80}
                            quality={85}
                            className="w-full h-full object-cover"
                            photoPositionX={player.photo_position_x_circle}
                            photoPositionY={player.photo_position_y_circle}
                            photoScale={player.photo_scale_circle}
                            fallback={
                              <div className="w-full h-full flex items-center justify-center bg-slate-800 text-amber-400 font-extrabold text-xs">
                                {player.name[0].toUpperCase()}
                              </div>
                            }
                          />
                        </div>
                      ) : player.player_id ? (
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-800 text-amber-400 font-extrabold text-xs flex-shrink-0">
                          {player.name[0].toUpperCase()}
                        </div>
                      ) : (
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-slate-100 text-slate-400 text-xs flex-shrink-0">?</div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-extrabold truncate ${!player.player_id ? 'text-slate-400 uppercase' : 'text-slate-800'}`}>
                          {player.name}
                        </div>
                        {player.category && (
                          <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-black uppercase border mt-0.5 ${getCategoryStyle(player.category)}`}>
                            {player.category}
                          </span>
                        )}
                      </div>
                      <svg className="w-4 h-4 text-slate-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>

                    {/* Dropdown - using Portal to render outside container */}
                    {openDropdownIndex === index && typeof window !== 'undefined' && createPortal(
                      <>
                        {/* Backdrop to close dropdown when clicking outside */}
                        <div 
                          className="fixed inset-0 z-[9998]" 
                          onClick={() => setOpenDropdownIndex(null)}
                        />
                        
                        {/* Dropdown with fixed positioning */}
                        <div 
                          className="fixed bg-white rounded-xl shadow-xl border border-slate-200 max-h-96 overflow-hidden flex flex-col z-[9999]"
                          style={{
                            top: `${dropdownPosition.top}px`,
                            left: `${dropdownPosition.left}px`,
                            width: `${dropdownPosition.width}px`,
                          }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="p-2 border-b border-slate-100">
                            <input
                              type="text"
                              placeholder="Search name, team or category..."
                              value={searchTerms[index] || ''}
                              onChange={(e) => setSearchTerms((t) => ({ ...t, [index]: e.target.value }))}
                              className="w-full px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-bold focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                              autoFocus
                            />
                          </div>
                          <div className="overflow-y-auto max-h-72 divide-y divide-slate-100">
                            {getFiltered(index).length === 0 ? (
                              <div className="p-4 text-center text-slate-400 text-xs font-bold uppercase">
                                {searchTerms[index] ? 'No matching members' : 'All members selected'}
                              </div>
                            ) : (
                              getFiltered(index).map((rp) => (
                                <button
                                  key={rp.player_id}
                                  onClick={() => selectRealPlayer(rp, index)}
                                  className="w-full flex items-center gap-3 p-3 hover:bg-slate-50 transition-colors text-left"
                                >
                                  <div className="w-10 h-10 rounded-xl overflow-hidden flex-shrink-0 border border-slate-200 shadow-sm bg-slate-100">
                                    {rp.photo_url ? (
                                      <OptimizedImage
                                        src={rp.photo_url}
                                        alt={rp.player_name}
                                        width={80}
                                        height={80}
                                        quality={85}
                                        className="w-full h-full object-cover"
                                        photoPositionX={rp.photo_position_x_circle}
                                        photoPositionY={rp.photo_position_y_circle}
                                        photoScale={rp.photo_scale_circle}
                                        fallback={
                                          <div className="w-full h-full flex items-center justify-center bg-slate-800 text-amber-400 font-extrabold text-xs">
                                            {rp.player_name[0].toUpperCase()}
                                          </div>
                                        }
                                      />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center bg-slate-800 text-amber-400 font-extrabold text-xs">
                                        {rp.player_name[0].toUpperCase()}
                                      </div>
                                    )}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="font-extrabold text-slate-800 text-xs truncate">
                                      {rp.display_name || rp.player_name}
                                    </div>
                                    <div className="text-[9px] text-slate-400 font-bold uppercase truncate">{rp.team}</div>
                                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                      {rp.category && (
                                        <span className={`px-1.5 py-0.5 text-[8px] font-black uppercase rounded border ${getCategoryStyle(rp.category)}`}>
                                          {rp.category}
                                        </span>
                                      )}
                                      {(rp.base_price || rp.price) ? (
                                        <span className="px-1.5 py-0.5 text-[8px] font-black uppercase rounded bg-slate-100 text-slate-600 border border-slate-200">
                                          Floor: {rp.base_price || rp.price} COINS
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                  <div className="flex gap-3 text-center text-[10px] font-bold flex-shrink-0 pr-1">
                                    <div>
                                      <div className="font-extrabold text-slate-800">{rp.points || 0}</div>
                                      <div className="text-[8px] text-slate-400 uppercase">Pts</div>
                                    </div>
                                    <div>
                                      <div className="font-extrabold text-emerald-600 flex items-center gap-0.5">
                                        <SoccerBallIcon className="w-3 h-3" /> {rp.goals_scored || 0}
                                      </div>
                                      <div className="text-[8px] text-slate-400 uppercase">Gls</div>
                                    </div>
                                  </div>
                                </button>
                              ))
                            )}
                          </div>
                        </div>
                      </>,
                      document.body
                    )}
                  </div>
                </div>

                {/* Right: bid input + player stats */}
                <div className="space-y-4">
                  {/* Bid Amount */}
                  <div>
                    <label className="block text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                      Target Bid (COINS)
                    </label>
                    <input
                      type="number"
                      value={player.bidAmount || ''}
                      onChange={(e) => updateBid(player.id, e.target.value === '' ? 0 : Number(e.target.value))}
                      min={player.basePrice || 0}
                      step={10}
                      placeholder="Enter bid amount"
                      disabled={!player.player_id}
                      className={`w-full py-2 px-3 bg-white border rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono disabled:opacity-50 ${
                        player.player_id && player.bidAmount > 0 && player.bidAmount < player.basePrice
                          ? 'border-rose-400 bg-rose-50/50'
                          : 'border-slate-200'
                      }`}
                    />
                    {player.player_id && player.bidAmount > 0 && player.bidAmount < player.basePrice ? (
                      <span className="text-[8px] text-rose-600 font-bold block mt-1 uppercase">
                        Below base price floor of {player.basePrice} COINS
                      </span>
                    ) : (
                      <span className="text-[8px] text-slate-400 font-bold block mt-1 uppercase">
                        {player.player_id ? `Base price floor: ${player.basePrice} COINS` : 'Select a player first'}
                      </span>
                    )}
                  </div>

                  {/* Player stats summary */}
                  {player.player_id && (
                    <div className="bg-slate-50/70 border border-slate-100 rounded-xl p-3.5 font-mono">
                      <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider mb-2">Player Summary</p>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="text-center">
                          <p className="text-sm font-black text-slate-800">{player.points}</p>
                          <p className="text-[8px] text-slate-400 font-bold uppercase">Points</p>
                        </div>
                        <div className="text-center">
                          <p className="text-sm font-black text-violet-700">{player.basePrice}</p>
                          <p className="text-[8px] text-slate-400 font-bold uppercase">Base Price</p>
                        </div>
                        <div className="text-center">
                          <p className={`text-sm font-black ${player.bidAmount >= player.basePrice ? 'text-emerald-700' : 'text-rose-600'}`}>
                            {player.bidAmount || 0}
                          </p>
                          <p className="text-[8px] text-slate-400 font-bold uppercase">Your Bid</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Warnings */}
        {players.filter((p) => p.player_id).length < requiredPlayers && (
          <div className="console-card bg-amber-50/60 border border-amber-200/60 p-4 rounded-xl flex gap-3 items-center">
            <AlertTriangle className="w-5 h-5 flex-shrink-0 text-amber-500" />
            <div>
              <span className="font-extrabold text-amber-800 text-[10px] uppercase tracking-wider block mb-0.5">Roster Incomplete</span>
              <p className="text-xs text-amber-900 font-semibold">
                Select {requiredPlayers - players.filter((p) => p.player_id).length} more SS Member(s) to complete your roster of {requiredPlayers}.
              </p>
            </div>
          </div>
        )}

        {isOverBudget && (
          <div className="console-card bg-rose-50/60 border border-rose-200/60 p-4 rounded-xl flex gap-3 items-center">
            <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
            <div>
              <span className="font-extrabold text-rose-800 text-[10px] uppercase tracking-wider block mb-0.5">Over Budget</span>
              <p className="text-xs text-rose-900 font-semibold">
                Planned bids exceed budget by {Math.abs(remainingBudget).toLocaleString()} COINS. Reduce bids to stay within limits.
              </p>
            </div>
          </div>
        )}

        {/* Info */}
        <div className="console-card bg-white border border-slate-200/60 border-l-4 border-l-indigo-500 rounded-2xl p-5 shadow-sm font-mono">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-base">📝</span>
            <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider">Planning Guidelines</h4>
          </div>
          <ul className="text-xs text-slate-600 space-y-2 leading-relaxed font-semibold">
            <li className="flex items-start gap-1.5"><span>•</span><span>Must have exactly {requiredPlayers} SS Members (Real players) on your squad.</span></li>
            <li className="flex items-start gap-1.5"><span>•</span><span>Your bid must be at or above the player&apos;s base price (auction floor).</span></li>
            <li className="flex items-start gap-1.5"><span>•</span><span>Category (Legend, Icon, Star, Rising) determines how players were classified for this season.</span></li>
            <li className="flex items-start gap-1.5"><span>•</span><span>This is a planning sandbox — actual auction results may differ.</span></li>
          </ul>
        </div>
      </div>
    </div>
  
    </AuthGuard>
  );
}
