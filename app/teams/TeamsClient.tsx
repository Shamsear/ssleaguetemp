'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Activity, ChevronRight, Crown, Filter, Medal, Search, Shield, Star, TrendingUp, Trophy } from 'lucide-react';

interface Team {
  id: string;
  team_id: string;
  team_name: string;
  logo_url?: string;
  balance?: number;
  matches_played?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  goals_scored?: number;
  goals_conceded?: number;
  points?: number;
  created_at?: any;
  rank?: number;
}

interface Season {
  id: string;
  name: string;
  status: string;
}

function TeamsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const seasonId = searchParams.get('season');
  
  const [teams, setTeams] = useState<Team[]>([]);
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [filteredTeams, setFilteredTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<string>('points'); // Default to sorting by points
  const [seasonName, setSeasonName] = useState<string>('');

  useEffect(() => {
    fetchSeasonsList();
  }, []);

  useEffect(() => {
    fetchTeams();
  }, [seasonId]);

  useEffect(() => {
    applyFilters();
  }, [searchTerm, sortBy, teams]);

  const fetchSeasonsList = async () => {
    try {
      const response = await fetch('/api/seasons/all');
      const data = await response.json();
      if (data.success && data.seasons) {
        // Sort seasons descending by number in the ID (e.g. SSPSLS17 -> 17)
        const sorted = [...data.seasons].sort((a, b) => {
          const numA = parseInt(a.id.replace(/\D/g, '')) || 0;
          const numB = parseInt(b.id.replace(/\D/g, '')) || 0;
          return numB - numA;
        });
        setSeasons(sorted);
      }
    } catch (error) {
      console.error('Error fetching seasons list:', error);
    }
  };

  const fetchTeams = async () => {
    try {
      setLoading(true);
      
      // If season filter is provided, fetch teams for that season
      if (seasonId) {
        const [statsRes, detailsRes] = await Promise.all([
          fetch(`/api/seasons/${seasonId}/stats`),
          fetch(`/api/seasons/${seasonId}/details`).catch(() => null)
        ]);
        
        const statsData = await statsRes.json();
        let name = '';
        if (detailsRes) {
          const detailsData = await detailsRes.json();
          if (detailsData.success) {
            name = detailsData.data.name || '';
          }
        }
        
        if (statsData.success && statsData.data?.teams) {
          setTeams(statsData.data.teams);
          setSeasonName(name || statsData.data.season_name || `Season ${seasonId}`);
        }
      } else {
        // Fetch all teams from Firebase
        const response = await fetch('/api/teams');
        const data = await response.json();
        
        if (data.success && data.teams) {
          setTeams(data.teams);
          setSeasonName('');
        }
      }
    } catch (error) {
      console.error('Error fetching teams:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...teams];
    
    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(team =>
        team.team_name.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Sort
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'points':
          return (b.points || 0) - (a.points || 0);
        case 'rank':
          return (a.rank || 99) - (b.rank || 99);
        case 'name':
          return a.team_name.localeCompare(b.team_name);
        case 'balance':
          return (b.balance || 0) - (a.balance || 0);
        case 'wins':
          return (b.wins || 0) - (a.wins || 0);
        case 'goals':
          return (b.goals_scored || 0) - (a.goals_scored || 0);
        default:
          return 0;
      }
    });
    
    setFilteredTeams(filtered);
  };

  if (loading) {
    return (
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="text-slate-500 font-mono text-xs">Loading Teams Portal...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-8">
        
        {/* Title Panel */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">League Directory</span>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              {seasonName ? `${seasonName} Teams` : 'All Teams'}
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-1">
              {seasonName ? `TEAMS COMPETING IN ${seasonName.toUpperCase()}:` : 'REGISTERED LEAGUE TEAMS:'} <span className="text-amber-600 font-bold">{filteredTeams.length}</span>
            </p>
          </div>
          
          <div className="text-right bg-slate-50 border border-slate-200 px-5 py-2.5 rounded-xl font-mono">
            <div className="text-2xl font-black text-amber-600">{teams.length}</div>
            <div className="text-[9px] uppercase tracking-wider text-slate-400 font-bold">Total Teams</div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {/* Search */}
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2">
                Search Teams
              </label>
              <div className="relative">
                <input
                  type="text"
                  placeholder="Enter squad name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-700 bg-slate-50 focus:ring-1 focus:ring-amber-500 focus:outline-none"
                />
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              </div>
            </div>

            {/* Season Selector */}
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2">
                Season Filter
              </label>
              <div className="relative">
                <select
                  value={seasonId || 'all'}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === 'all') {
                      router.push('/teams');
                    } else {
                      router.push(`/teams?season=${val}`);
                    }
                  }}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-700 bg-slate-50 focus:ring-1 focus:ring-amber-500 focus:outline-none appearance-none cursor-pointer"
                >
                  <option value="all">All Seasons (Aggregate)</option>
                  {seasons.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} {s.status === 'active' && <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block ml-1.5" />}
                    </option>
                  ))}
                </select>
                <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>

            {/* Sort */}
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400 mb-2">
                Sort By
              </label>
              <div className="relative">
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 text-xs font-mono font-bold text-slate-700 bg-slate-50 focus:ring-1 focus:ring-amber-500 focus:outline-none appearance-none cursor-pointer"
                >
                  <option value="points">Points (High to Low)</option>
                  {seasonId && <option value="rank">Rank (1st to Last)</option>}
                  <option value="name">Name (A-Z)</option>
                  <option value="balance">Balance (High to Low)</option>
                  <option value="wins">Wins (High to Low)</option>
                  <option value="goals">Goals (High to Low)</option>
                </select>
                <TrendingUp className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Results Count */}
          <div className="mt-4 text-[10px] font-mono text-slate-400 uppercase flex justify-between items-center">
            <span>Showing {filteredTeams.length} of {teams.length} teams</span>
            {searchTerm || seasonId ? (
              <button
                onClick={() => {
                  setSearchTerm('');
                  if (seasonId) router.push('/teams');
                }}
                className="text-amber-600 hover:text-amber-700 font-bold hover:underline cursor-pointer"
              >
                Clear Filters
              </button>
            ) : null}
          </div>
        </div>

        {/* Teams Grid */}
        {filteredTeams.length === 0 ? (
          <div className="bg-white border border-slate-200/60 rounded-2xl p-12 text-center shadow-sm">
            <Shield className="w-12 h-12 text-slate-350 mx-auto mb-4" />
            <p className="text-slate-900 text-lg font-bold">No Teams Found</p>
            <p className="text-xs text-slate-400 font-mono mt-1">TRY ADJUSTING YOUR FILTER CRITERIA</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredTeams.map((team) => (
              <Link
                key={team.team_id}
                href={seasonId ? `/teams/${team.team_id}?season=${seasonId}` : `/teams/${team.team_id}`}
                className="block console-card rounded-xl p-5 hover:border-amber-400/40 transition-all duration-250 group bg-white border border-slate-200/60 shadow-sm"
              >
                {/* Team Header */}
                <div className="flex items-center gap-4 mb-4">
                  {/* Team Logo */}
                  {team.logo_url ? (
                    <div className="w-16 h-16 rounded-xl bg-white border border-slate-200/60 shadow-inner flex-shrink-0 flex items-center justify-center p-2 relative overflow-hidden">
                      <img
                        src={team.logo_url}
                        alt={team.team_name}
                        className="object-contain w-full h-full"
                      />
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-[#D4AF37]/10 to-[#D4AF37]/5 border border-[#D4AF37]/20 flex-shrink-0 flex items-center justify-center">
                      <Shield className="w-8 h-8 text-amber-600" />
                    </div>
                  )}
                  
                  <div className="flex-1 min-w-0">
                    <h3 className="text-lg font-bold text-slate-900 truncate group-hover:text-amber-600 transition-colors">
                      {team.team_name}
                    </h3>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                      {team.balance !== undefined && team.balance > 0 && (
                        <span className="inline-block bg-emerald-50 border border-emerald-200 text-emerald-800 text-[9px] font-mono font-bold px-2 py-0.5 rounded-full">
                          {team.balance.toLocaleString()}M BUDGET
                        </span>
                      )}

                    </div>
                  </div>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-4 gap-2 text-center font-mono text-xs text-slate-700 py-3 border-t border-slate-100">
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase">Matches</div>
                    <div className="font-bold text-slate-800 mt-0.5">{team.matches_played || 0}</div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase">W-D-L</div>
                    <div className="font-bold text-slate-800 mt-0.5">
                      {team.wins || 0}-{team.draws || 0}-{team.losses || 0}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] text-slate-400 uppercase">GD</div>
                    <div className={`font-bold mt-0.5 ${
                      ((team.goals_scored || 0) - (team.goals_conceded || 0)) > 0 ? 'text-emerald-600' :
                      ((team.goals_scored || 0) - (team.goals_conceded || 0)) < 0 ? 'text-rose-600' : 'text-slate-500'
                    }`}>
                      {((team.goals_scored || 0) - (team.goals_conceded || 0)) > 0 ? '+' : ''}
                      {(team.goals_scored || 0) - (team.goals_conceded || 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] text-amber-700 font-bold uppercase">Points</div>
                    <div className="font-black text-amber-600 mt-0.5">{team.points || 0}</div>
                  </div>
                </div>

                {/* Inspect Link */}
                <div className="pt-3 border-t border-slate-150 flex items-center justify-between text-xs font-mono font-bold text-slate-400 group-hover:text-amber-600 transition-colors">
                  <span>INSPECT SQUAD</span>
                  <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AllTeamsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="text-slate-500 font-mono text-xs">Loading Teams Portal...</p>
        </div>
      </div>
    }>
      <TeamsContent />
    </Suspense>
  );
}
