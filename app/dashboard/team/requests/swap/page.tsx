'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useTournamentContext } from '@/contexts/TournamentContext';
import { useCachedTeamSeasons } from '@/hooks/useCachedFirebase';
import { ArrowRightLeft, AlertTriangle, Calendar } from 'lucide-react';
import SearchablePlayerSelect from '@/components/ui/SearchablePlayerSelect';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import Link from 'next/link';
import { normalizeStr } from '@/lib/utils/normalizeStr';

// Custom UI Components replacing missing shadcn imports
const Card = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm ${className || ''}`} {...props}>
    {children}
  </div>
);

const CardHeader = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`space-y-1.5 pb-4 ${className || ''}`} {...props}>
    {children}
  </div>
);

const CardTitle = ({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={`text-lg font-bold leading-none tracking-tight text-slate-900 flex items-center gap-2 ${className || ''}`} {...props}>
    {children}
  </h3>
);

const CardDescription = ({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={`text-sm text-slate-500 ${className || ''}`} {...props}>
    {children}
  </p>
);

const CardContent = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`${className || ''}`} {...props}>
    {children}
  </div>
);

const Button = ({ className, children, variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => {
  const baseStyle = "inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50 disabled:pointer-events-none px-4 py-2";
  const variants: Record<string, string> = {
    default: "bg-slate-900 text-white hover:bg-slate-800",
    outline: "border border-slate-200 hover:bg-slate-100 text-slate-700",
    ghost: "hover:bg-slate-100 hover:text-slate-900 font-normal",
  };
  const currentVariant = variants[variant || 'default'] || variant || variants.default;
  return (
    <button className={`${baseStyle} ${currentVariant} ${className || ''}`} {...props}>
      {children}
    </button>
  );
};

interface Player {
  id: string;
  player_id: string;
  player_name: string;
  team_id: string;
  team_name?: string;
  acquisition_value: number;
  star_rating: number; 
  position: string;
}

export default function TeamSwapRequestPage() {
  const { user } = useAuth();
  const { seasonId: selectedSeason } = useTournamentContext();
  const { data: teamSeasons, loading: teamsLoading } = useCachedTeamSeasons(
    selectedSeason ? { seasonId: selectedSeason } : undefined
  );
  const router = useRouter();
  
  const [resolvedTeamId, setResolvedTeamId] = useState<string | null>(null);

  // Load user's resolved team ID from Firestore user profile
  useEffect(() => {
    async function resolveUserTeam() {
      if (!user?.uid) return;
      try {
        const { db } = await import('@/lib/firebase/config');
        const { doc, getDoc } = await import('firebase/firestore');
        const userDoc = await getDoc(doc(db, 'users', user.uid));
        if (userDoc.exists()) {
          const tId = userDoc.data()?.teamId;
          setResolvedTeamId(tId || null);
          console.log('[SWAP] Resolved team ID from Firestore:', tId);
        }
      } catch (err) {
        console.error('Error resolving user team ID:', err);
      }
    }
    resolveUserTeam();
  }, [user]);

  const teamId = resolvedTeamId || '';

  // Form state
  const [targetTeamId, setTargetTeamId] = useState('');
  const [myPlayerId, setMyPlayerId] = useState('');
  const [theirPlayerId, setTheirPlayerId] = useState('');
  const [cashAmount, setCashAmount] = useState<number>(0);
  const [cashDirection, setCashDirection] = useState<'A_to_B' | 'B_to_A' | 'none'>('none');

  // Custom dropdown states
  const [isTeamDropdownOpen, setIsTeamDropdownOpen] = useState(false);
  const teamDropdownRef = useRef<HTMLDivElement>(null);
  const teamButtonRef = useRef<HTMLDivElement>(null);
  const [teamDropdownPosition, setTeamDropdownPosition] = useState({ top: 0, left: 0, width: 0 });
  const [teamSearch, setTeamSearch] = useState('');
  const teamInputRef = useRef<HTMLInputElement>(null);

  const [isWindowDropdownOpen, setIsWindowDropdownOpen] = useState(false);
  const windowDropdownRef = useRef<HTMLDivElement>(null);
  const windowButtonRef = useRef<HTMLDivElement>(null);
  const [windowDropdownPosition, setWindowDropdownPosition] = useState({ top: 0, left: 0, width: 0 });

  // Update dropdown positions when opened
  useEffect(() => {
    if (isTeamDropdownOpen && teamButtonRef.current) {
      const rect = teamButtonRef.current.getBoundingClientRect();
      setTeamDropdownPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [isTeamDropdownOpen]);

  useEffect(() => {
    if (isTeamDropdownOpen) {
      setTimeout(() => teamInputRef.current?.focus(), 100);
    }
  }, [isTeamDropdownOpen]);

  useEffect(() => {
    if (isWindowDropdownOpen && windowButtonRef.current) {
      const rect = windowButtonRef.current.getBoundingClientRect();
      setWindowDropdownPosition({
        top: rect.bottom + window.scrollY + 8,
        left: rect.left + window.scrollX,
        width: rect.width,
      });
    }
  }, [isWindowDropdownOpen]);

  // Click outside and scroll listeners to close dropdowns
  useEffect(() => {
    if (!isTeamDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (teamDropdownRef.current && !teamDropdownRef.current.contains(event.target as Node) &&
          teamButtonRef.current && !teamButtonRef.current.contains(event.target as Node)) {
        setIsTeamDropdownOpen(false);
        setTeamSearch('');
      }
    };
    const handleScroll = (event: Event) => {
      if (teamDropdownRef.current && teamDropdownRef.current.contains(event.target as Node)) {
        return;
      }
      setIsTeamDropdownOpen(false);
      setTeamSearch('');
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isTeamDropdownOpen]);

  useEffect(() => {
    if (!isWindowDropdownOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (windowDropdownRef.current && !windowDropdownRef.current.contains(event.target as Node) &&
          windowButtonRef.current && !windowButtonRef.current.contains(event.target as Node)) {
        setIsWindowDropdownOpen(false);
      }
    };
    const handleScroll = (event: Event) => {
      if (windowDropdownRef.current && windowDropdownRef.current.contains(event.target as Node)) {
        return;
      }
      setIsWindowDropdownOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('scroll', handleScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [isWindowDropdownOpen]);

  // Data state
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loadingPlayers, setLoadingPlayers] = useState(true);
  
  const [activeWindows, setActiveWindows] = useState<any[]>([]);
  const [selectedWindowId, setSelectedWindowId] = useState<string>('');

  // UI state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load all football players and windows
  useEffect(() => {
    const loadData = async () => {
      if (!selectedSeason || !teamId) return;

      setLoadingPlayers(true);
      setError(null);
      try {
        const [playersRes, windowsRes] = await Promise.all([
          fetchWithTokenRefresh(`/api/players/database?limit=2000&assigned_only=true&season_id=${selectedSeason}`),
          fetch(`/api/requests/windows?team_id=${teamId}&season_id=${selectedSeason}`)
        ]);
        
        const result = await playersRes.json();
        const windowsResult = await windowsRes.json();

        if (!result.success) {
          throw new Error('Failed to fetch players');
        }

        const loadedPlayers: Player[] = (result.data.players || [])
          .filter((p: any) => p.team_id) 
          .map((p: any) => ({
            id: p.id || p.player_id,
            player_id: p.player_id,
            player_name: p.name || 'Unknown Player',
            team_id: p.team_id,
            team_name: p.team_name || 'Unknown Team',
            acquisition_value: p.acquisition_value !== undefined && p.acquisition_value !== null ? p.acquisition_value : 0,
            star_rating: p.overall_rating || 70,
            position: p.position || p.position_group || 'N/A'
          }));

        setAllPlayers(loadedPlayers);
        
        if (windowsResult.success) {
          const swapWindows = (windowsResult.data || []).filter((w: any) => w.type === 'swap' && !w.isLimitReached);
          setActiveWindows(swapWindows);
          if (swapWindows.length === 1) {
            setSelectedWindowId(swapWindows[0].id.toString());
          }
        }
      } catch (error) {
        console.error('Error loading data:', error);
        setError('Failed to load players or active windows');
      } finally {
        setLoadingPlayers(false);
      }
    };

    loadData();
  }, [selectedSeason, teamId]);

  // Derived state
  const myPlayers = useMemo(() => {
    return allPlayers.filter(p => p.team_id === teamId);
  }, [allPlayers, teamId]);

  const targetTeamPlayers = useMemo(() => {
    if (!targetTeamId) return [];
    return allPlayers.filter(p => p.team_id === targetTeamId);
  }, [allPlayers, targetTeamId]);

  const otherTeams = useMemo(() => {
    const uniqueMap = new Map<string, any>();
    (teamSeasons || [])
      .filter((ts: any) => ts.team_id && ts.team_id !== teamId && ts.status === 'registered')
      .forEach((ts: any) => {
        if (!uniqueMap.has(ts.team_id)) {
          uniqueMap.set(ts.team_id, {
            id: ts.team_id,
            name: ts.team_name || 'Unknown Team'
          });
        }
      });
    return Array.from(uniqueMap.values());
  }, [teamSeasons, teamId]);

  const filteredOtherTeams = useMemo(() => {
    return otherTeams.filter(team => 
      normalizeStr(team.name).includes(normalizeStr(teamSearch))
    );
  }, [otherTeams, teamSearch]);

  const mySelectedPlayer = useMemo(() => {
    return allPlayers.find(p => p.id === myPlayerId);
  }, [allPlayers, myPlayerId]);

  const theirSelectedPlayer = useMemo(() => {
    return allPlayers.find(p => p.id === theirPlayerId);
  }, [allPlayers, theirPlayerId]);

  // Handle Target Team change
  const handleTargetTeamChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTargetTeamId(e.target.value);
    setTheirPlayerId(''); // Reset their player when team changes
  };

  // Handle submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!mySelectedPlayer || !theirSelectedPlayer || !teamId || !selectedSeason || !targetTeamId || !selectedWindowId) {
      setError('Please fill in all required fields');
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const payload = {
        season_id: selectedSeason,
        window_id: parseInt(selectedWindowId),
        requesting_team_id: teamId,
        target_team_id: targetTeamId,
        cash_amount: cashAmount,
        cash_direction: cashDirection,
        players: [
          {
            from_team_id: teamId,
            to_team_id: targetTeamId,
            player_id: mySelectedPlayer.player_id,
            player_name: mySelectedPlayer.player_name,
            player_type: 'football'
          },
          {
            from_team_id: targetTeamId,
            to_team_id: teamId,
            player_id: theirSelectedPlayer.player_id,
            player_name: theirSelectedPlayer.player_name,
            player_type: 'football'
          }
        ]
      };

      const response = await fetch('/api/requests/swap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to submit swap request');
      }

      router.push('/dashboard/team/requests');
    } catch (err: any) {
      setError(err.message || 'Failed to submit request');
      console.error('Submit error:', err);
      setSubmitting(false);
    }
  };

  if (loadingPlayers || teamsLoading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-10 w-10 border-b-4 border-amber-500"></div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Back Link */}
        <Link
          href="/dashboard/team/requests"
          className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center w-fit mb-4"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Requests Hub
        </Link>

        {/* Header Title Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm font-mono relative overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-500 to-blue-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/10 flex-shrink-0">
                <ArrowRightLeft className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-slate-800">
                  Swap Player
                </h1>
                <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                  Propose a trade deal with another team in your league
                </p>
              </div>
            </div>
          </div>
        </div>

        {activeWindows.length === 0 ? (
          <Card className="border-t-4 border-t-indigo-500 bg-white">
            <CardContent className="pt-12 pb-12 flex flex-col items-center justify-center text-center space-y-6">
              <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center border border-amber-100 shadow-sm text-amber-500 animate-pulse">
                <Calendar className="w-8 h-8" />
              </div>
              <div className="space-y-2 max-w-md">
                <h2 className="text-lg font-black text-slate-800 uppercase tracking-wider">No Active Swap Windows</h2>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-wider leading-relaxed">
                  There are no open swap windows available, or you have reached your request limit. Please check back when a swap window is opened by the committee.
                </p>
              </div>
              <Link href="/dashboard/team/requests">
                <button className="px-5 py-3 bg-slate-900 hover:bg-slate-800 text-amber-400 font-black text-xs uppercase tracking-wider rounded-xl shadow-md cursor-pointer transition-all border border-slate-950">
                  Return to Requests Hub
                </button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-t-4 border-t-indigo-500">
            <CardHeader>
              <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-indigo-500" />
                Trade Proposal Form
              </CardTitle>
              <CardDescription className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                Trades are only executed after being approved by the committee.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {error && (
                <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs mb-6 flex items-center gap-2 font-bold uppercase tracking-wider">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="mb-6">
                  <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Select Transfer Window</label>
                  <div className="relative font-mono text-xs">
                    <div
                      ref={windowButtonRef}
                      className={`w-full px-4 py-3 rounded-xl border ${
                        isWindowDropdownOpen ? 'border-slate-800 ring-2 ring-amber-500/20' : 'border-slate-200/80 hover:border-slate-400'
                      } bg-white cursor-pointer transition-all shadow-sm flex items-center justify-between text-slate-800 ${
                        activeWindows.length === 1 ? 'opacity-70 cursor-not-allowed' : ''
                      }`}
                      onClick={() => !submitting && activeWindows.length > 1 && setIsWindowDropdownOpen(!isWindowDropdownOpen)}
                    >
                      {selectedWindowId ? (
                        <span className="font-extrabold uppercase tracking-wide">
                          {activeWindows.find(w => w.id.toString() === selectedWindowId)?.name || 'Select Window'}
                          {activeWindows.find(w => w.id.toString() === selectedWindowId)?.max_requests > 0 
                            ? ` (${activeWindows.find(w => w.id.toString() === selectedWindowId)?.remaining} requests remaining)` 
                            : ''}
                        </span>
                      ) : (
                        <span className="text-slate-400 uppercase font-bold tracking-wider">-- Select Active Window --</span>
                      )}
                      {activeWindows.length > 1 && <span className="text-slate-400">▼</span>}
                    </div>

                    {isWindowDropdownOpen && typeof window !== 'undefined' && createPortal(
                      <>
                        <div 
                          className="fixed inset-0 z-[9998]" 
                          onClick={() => setIsWindowDropdownOpen(false)}
                        />
                        <div 
                          ref={windowDropdownRef}
                          className="fixed bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden font-mono z-[9999] max-h-[300px] overflow-y-auto"
                          style={{
                            top: `${windowDropdownPosition.top - window.scrollY}px`,
                            left: `${windowDropdownPosition.left - window.scrollX}px`,
                            width: `${windowDropdownPosition.width}px`
                          }}
                        >
                          {activeWindows.map((w) => (
                            <div
                              key={w.id}
                              onClick={() => {
                                setSelectedWindowId(w.id.toString());
                                setIsWindowDropdownOpen(false);
                              }}
                              className={`p-3 cursor-pointer transition-colors text-slate-800 hover:bg-slate-50 font-bold uppercase tracking-wide border-b border-slate-100 last:border-b-0 ${
                                w.id.toString() === selectedWindowId ? 'bg-amber-50/50 text-amber-600' : ''
                              }`}
                            >
                              {w.name} {w.max_requests > 0 ? `(${w.remaining} requests remaining)` : ''}
                            </div>
                          ))}
                        </div>
                      </>,
                      document.body
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-2">
                  {/* Left Side: My Player */}
                  <div className="space-y-4">
                    <div className="border-b border-slate-100 pb-2">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Step 1</span>
                      <h3 className="font-extrabold text-sm text-slate-700 uppercase tracking-wide">Select Your Player</h3>
                    </div>

                    <SearchablePlayerSelect
                      players={myPlayers}
                      value={myPlayerId}
                      onChange={setMyPlayerId}
                      disabled={submitting}
                      label="Your Player"
                      placeholder="Search your roster..."
                      color="amber"
                      playerType="football"
                    />

                    {mySelectedPlayer && (
                      <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4 space-y-2 text-xs font-mono">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold uppercase">Position:</span>
                          <span className="font-extrabold text-slate-700 uppercase">{mySelectedPlayer.position}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold uppercase">Original Value:</span>
                          <span className="font-extrabold text-slate-700">{mySelectedPlayer.acquisition_value} eCoin</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Side: Partner Team & Player */}
                  <div className="space-y-4">
                    <div className="border-b border-slate-100 pb-2">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Step 2</span>
                      <h3 className="font-extrabold text-sm text-slate-700 uppercase tracking-wide">Select Trade Partner</h3>
                    </div>

                    {/* Custom Trade Partner Select Dropdown */}
                    <div className="mb-4">
                      <label className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 block">Trade Partner Team</label>
                      <div className="relative font-mono text-xs">
                        <div
                          ref={teamButtonRef}
                          className={`w-full px-4 py-3 rounded-xl border ${
                            isTeamDropdownOpen ? 'border-slate-800 ring-2 ring-amber-500/20' : 'border-slate-200/80 hover:border-slate-400'
                          } bg-white cursor-pointer transition-all shadow-sm flex items-center justify-between text-slate-800`}
                          onClick={() => !submitting && setIsTeamDropdownOpen(!isTeamDropdownOpen)}
                        >
                          {targetTeamId ? (
                            <span className="font-extrabold uppercase tracking-wide">
                              {otherTeams.find(t => t.id === targetTeamId)?.name || 'Select Team'}
                            </span>
                          ) : (
                            <span className="text-slate-400 uppercase font-bold tracking-wider">-- Select Team --</span>
                          )}
                          <span className="text-slate-400">▼</span>
                        </div>

                        {isTeamDropdownOpen && typeof window !== 'undefined' && createPortal(
                          <>
                            <div 
                              className="fixed inset-0 z-[9998]" 
                              onClick={() => {
                                setIsTeamDropdownOpen(false);
                                setTeamSearch('');
                              }}
                            />
                            <div 
                              ref={teamDropdownRef}
                              className="fixed bg-white rounded-2xl shadow-xl border border-slate-200/80 overflow-hidden font-mono z-[9999] max-h-[300px] flex flex-col"
                              style={{
                                top: `${teamDropdownPosition.top - window.scrollY}px`,
                                left: `${teamDropdownPosition.left - window.scrollX}px`,
                                width: `${teamDropdownPosition.width}px`
                              }}
                            >
                              <div className="p-2 border-b border-slate-100 bg-slate-50">
                                <input
                                  ref={teamInputRef}
                                  type="text"
                                  placeholder="Search team..."
                                  value={teamSearch}
                                  onChange={(e) => setTeamSearch(e.target.value)}
                                  className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-slate-400 font-extrabold font-mono text-slate-800"
                                />
                              </div>
                              <div className="overflow-y-auto max-h-[220px] flex-1">
                                {filteredOtherTeams.length === 0 ? (
                                  <div className="p-4 text-center text-slate-400 uppercase font-bold text-[10px]">No matches found</div>
                                ) : (
                                  filteredOtherTeams.map((team) => (
                                    <div
                                      key={team.id}
                                      onClick={() => {
                                        handleTargetTeamChange({ target: { value: team.id } } as any);
                                        setIsTeamDropdownOpen(false);
                                        setTeamSearch('');
                                      }}
                                      className={`p-3 cursor-pointer transition-colors text-slate-850 hover:bg-slate-50 font-extrabold text-xs uppercase tracking-wide border-b border-slate-100 last:border-b-0 ${
                                        team.id === targetTeamId ? 'bg-amber-50/50 text-amber-600' : ''
                                      }`}
                                    >
                                      {team.name}
                                    </div>
                                  ))
                                )}
                              </div>
                            </div>
                          </>,
                          document.body
                        )}
                      </div>
                    </div>

                    {targetTeamId && (
                      <SearchablePlayerSelect
                        players={targetTeamPlayers}
                        value={theirPlayerId}
                        onChange={setTheirPlayerId}
                        disabled={submitting || !targetTeamId}
                        label="Their Player"
                        placeholder="Search partner's roster..."
                        color="blue"
                        playerType="football"
                      />
                    )}

                    {theirSelectedPlayer && (
                      <div className="bg-slate-50/60 border border-slate-200/80 rounded-xl p-4 space-y-2 text-xs font-mono">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold uppercase">Position:</span>
                          <span className="font-extrabold text-slate-700 uppercase">{theirSelectedPlayer.position}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold uppercase">Original Value:</span>
                          <span className="font-extrabold text-slate-700">{theirSelectedPlayer.acquisition_value} eCoin</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Step 3: Cash adjustments */}
                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <div className="pb-2">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Step 3 (Optional)</span>
                    <h3 className="font-extrabold text-sm text-slate-700 uppercase tracking-wide">Cash Adjustments</h3>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-4">
                    <button
                      type="button"
                      onClick={() => setCashDirection(prev => prev === 'none' ? 'A_to_B' : 'none')}
                      className={`flex-1 py-2.5 rounded-xl border font-bold text-xs uppercase tracking-wider transition-all cursor-pointer ${
                        cashDirection !== 'none'
                          ? 'bg-slate-800 text-amber-400 border-slate-900 shadow-md' 
                          : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {cashDirection !== 'none' ? 'Remove Cash Adjustment' : 'Include Cash Adjustment'}
                    </button>
                  </div>

                  {cashDirection !== 'none' && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50/80 border border-slate-200 p-4 rounded-xl">
                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Cash Direction</label>
                        <select
                          value={cashDirection}
                          onChange={(e: any) => setCashDirection(e.target.value)}
                          disabled={submitting}
                          className="w-full h-10 px-3 border border-slate-200 rounded-xl bg-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                        >
                          <option value="A_to_B">We pay them</option>
                          <option value="B_to_A">They pay us</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2 block">Cash Amount (eCoin)</label>
                        <input
                          type="number"
                          min="0"
                          value={cashAmount || ''}
                          onChange={(e) => setCashAmount(Math.max(0, parseInt(e.target.value) || 0))}
                          disabled={submitting}
                          className="w-full h-10 px-3 border border-slate-200 rounded-xl bg-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-amber-500/20"
                          placeholder="0"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={!myPlayerId || !theirPlayerId || !targetTeamId || !selectedWindowId || submitting || activeWindows.length === 0}
                  className={`w-full py-3 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl font-extrabold text-xs uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 ${
                    (!myPlayerId || !theirPlayerId || !targetTeamId || !selectedWindowId || submitting || activeWindows.length === 0) ? 'opacity-50 cursor-not-allowed bg-slate-200 hover:bg-slate-200 text-slate-400 border border-slate-200' : ''
                  }`}
                >
                  {submitting ? 'Submitting Trade Proposal...' : 'Submit Trade Proposal'}
                </button>
              </form>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
