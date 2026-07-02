'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Trophy, Shield, Search, SlidersHorizontal, Info } from 'lucide-react';

interface Season {
  id: string;
  name: string;
  short_name?: string;
  status: string;
  is_historical: boolean;
  season_start?: any;
  season_end?: any;
  champion_team_name?: string;
  runner_up_team_name?: string;
  total_teams?: number;
  total_players?: number;
}

export default function SeasonsArchivePage() {
  const [seasons, setSeasons] = useState<Season[]>([]);
  const [filteredSeasons, setFilteredSeasons] = useState<Season[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'historical' | 'active'>('all');

  useEffect(() => {
    fetchSeasons();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [searchTerm, filterType, seasons]);

  const fetchSeasons = async () => {
    try {
      setLoading(true);
      
      // Fetch from API (cached)
      const response = await fetch('/api/seasons/all');
      const data = await response.json();
      
      if (data.success && data.seasons) {
        setSeasons(data.seasons);
      }
    } catch (error) {
      console.error('Error fetching seasons:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...seasons];
    
    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(season =>
        season.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        season.short_name?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Type filter
    if (filterType === 'historical') {
      filtered = filtered.filter(season => season.is_historical);
    } else if (filterType === 'active') {
      filtered = filtered.filter(season => !season.is_historical && season.status !== 'completed');
    }

    // Sort in descending order based on season number (e.g. from ID like "SSPSLS17" -> 17)
    filtered.sort((a, b) => {
      const numA = parseInt(a.id.replace(/\D/g, '')) || 0;
      const numB = parseInt(b.id.replace(/\D/g, '')) || 0;
      if (numA !== numB) {
        return numB - numA;
      }
      return b.name.localeCompare(a.name);
    });
    
    setFilteredSeasons(filtered);
  };

  if (loading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center font-mono">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-[#D4AF37] border-t-transparent mx-auto"></div>
          <p className="text-xs text-slate-500 uppercase tracking-widest leading-none">Initializing ledger archive...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-8">
        
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">Ledger Archive</span>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight text-slate-900 mt-0.5">Seasons Archive</h1>
            <p className="text-slate-500 text-xs mt-1">Browse all historical and active competitive seasons</p>
          </div>
        </div>

        {/* Filters Panel */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-end">
            
            {/* Search query */}
            <div className="md:col-span-7 space-y-2">
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                {`> SEARCH_QUERY`}
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs select-none">
                  <Search className="w-3.5 h-3.5" />
                </span>
                <input
                  type="text"
                  placeholder="Enter season name or identifier..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-[#FAF9F6]/50 border border-slate-200 hover:border-[#D4AF37]/40 rounded-xl py-2.5 pl-10 pr-4 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/20 transition-all"
                />
              </div>
            </div>

            {/* Filter type dropdown */}
            <div className="md:col-span-5 space-y-2">
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-slate-500">
                {`> FILTER_TYPE`}
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs select-none">
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </span>
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value as 'all' | 'historical' | 'active')}
                  className="w-full bg-[#FAF9F6]/50 border border-slate-200 hover:border-[#D4AF37]/40 rounded-xl py-2.5 pl-10 pr-4 text-xs font-mono text-slate-800 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/20 transition-all appearance-none cursor-pointer"
                >
                  <option value="all">ALL SEASONS</option>
                  <option value="active">ACTIVE SEASONS</option>
                  <option value="historical">HISTORICAL SEASONS</option>
                </select>
              </div>
            </div>
          </div>

          {/* Results Count Console Bar */}
          <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between text-[9px] font-mono text-slate-400 select-none">
            <span>SHOWING: {filteredSeasons.length} OF {seasons.length} RECORDED LOGS</span>
            <span>SYSTEM::SECURE_QUERY</span>
          </div>
        </div>

        {/* Seasons Grid or Empty State */}
        {filteredSeasons.length === 0 ? (
          <div className="bg-white border border-slate-200/60 rounded-2xl p-12 text-center select-none font-mono">
            <Info className="w-10 h-10 text-[#D4AF37]/50 mx-auto mb-4" />
            <p className="text-slate-700 text-sm font-bold uppercase tracking-wider">No seasons found</p>
            <p className="text-slate-400 text-xs mt-1.5">No records matched the active filter query parameters.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredSeasons.map((season) => {
              const isActive = !season.is_historical && season.status !== 'completed';
              // Only active seasons go to /season/current, all others (completed, historical) go to their own page
              const detailLink = season.status === 'active' && !season.is_historical
                ? '/season/current' 
                : `/seasons/${season.id}`;
              
              return (
                <Link
                  key={season.id}
                  href={detailLink}
                  className="console-card rounded-xl p-5 border border-slate-200 hover:border-[#D4AF37]/45 relative overflow-hidden bg-white shadow-sm flex flex-col justify-between group transition-all"
                >
                  <div>
                    {/* Season Header */}
                    <div className="mb-4">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="text-lg font-bold text-slate-900 group-hover:text-amber-600 transition-colors flex-1 leading-snug">
                          {season.name}
                        </h3>
                        {isActive && (
                          <span className="px-2 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono text-[8px] font-bold uppercase select-none flex-shrink-0">
                            ACTIVE
                          </span>
                        )}
                      </div>
                      {season.short_name && (
                        <p className="text-xs text-slate-400 font-mono mt-1 select-none">{season.short_name.toUpperCase()}</p>
                      )}
                    </div>

                    {/* Champion Panel Info */}
                    {season.champion_team_name && (
                      <div className="mb-4 p-3.5 bg-amber-50/50 border border-amber-200/50 rounded-xl relative overflow-hidden">
                        <div className="flex items-center gap-1.5 mb-1.5 select-none">
                          <Trophy className="w-3.5 h-3.5 text-[#D4AF37]" />
                          <span className="text-[9px] font-mono font-bold text-amber-700 uppercase tracking-wider">Champion</span>
                        </div>
                        <p className="font-bold text-slate-900 text-sm truncate leading-snug">
                          {season.champion_team_name}
                        </p>
                        {season.runner_up_team_name && (
                          <p className="text-[10px] font-mono text-slate-500 mt-1 truncate">
                            RUNNER-UP: {season.runner_up_team_name}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Monospace Stats Grid */}
                    {(season.total_teams || season.total_players) && (
                      <div className="grid grid-cols-2 gap-3 mb-5 font-mono text-center select-none">
                        {season.total_teams && (
                          <div className="bg-[#FAF9F6]/50 border border-slate-100 rounded-xl p-2.5">
                            <div className="text-[9px] text-slate-400 uppercase tracking-wide">Clubs</div>
                            <div className="text-base font-black text-slate-800 mt-0.5">{season.total_teams}</div>
                          </div>
                        )}
                        {season.total_players && (
                          <div className="bg-[#FAF9F6]/50 border border-slate-100 rounded-xl p-2.5">
                            <div className="text-[9px] text-slate-400 uppercase tracking-wide">Squads</div>
                            <div className="text-base font-black text-slate-800 mt-0.5">{season.total_players}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Actions Bar Footer */}
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-amber-700 hover:text-amber-600 font-bold font-mono text-[10px] uppercase mt-auto">
                    <span>[ INSPECT_SEASON ]</span>
                    <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform text-[#D4AF37]" />
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
