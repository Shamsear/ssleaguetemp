'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import Link from 'next/link';
import Image from 'next/image';

interface TeamData {
  team: {
    id: string;
    name: string;
    logoUrl: string | null;
    balance: number;
  };
  totalPlayers: number;
  totalValue: number;
  avgRating: number;
  positionBreakdown: { [key: string]: number };
  footballBudget?: number;
  realPlayerBudget?: number;
  currencySystem?: string;
  footballSpent?: number;
  realPlayerSpent?: number;
}

export default function CommitteeTeamsPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { isCommitteeAdmin, userSeasonId } = usePermissions();
  const [teams, setTeams] = useState<TeamData[]>([]);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'players' | 'balance'>('name');
  const [seasonName, setSeasonName] = useState('');
  const [seasonType, setSeasonType] = useState<'single' | 'multi'>('single');
  const [maxPlayers, setMaxPlayers] = useState(25);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && !isCommitteeAdmin) {
      router.push('/dashboard');
    }
  }, [user, loading, router, isCommitteeAdmin]);

  useEffect(() => {
    const fetchTeams = async () => {
      if (!userSeasonId) {
        setError('No season assigned');
        setLoadingTeams(false);
        return;
      }

      try {
        setLoadingTeams(true);
        const response = await fetchWithTokenRefresh(`/api/team/all?season_id=${userSeasonId}`);
        const data = await response.json();

        if (data.success && data.data?.teams) {
          setTeams(data.data.teams);
          setSeasonName(data.data.seasonName || '');
          setSeasonType(data.data.seasonType || 'single');
          setMaxPlayers(data.data.maxPlayers || 25);
          setError(null);
        } else {
          setError(data.error || 'Failed to load teams');
        }
      } catch (err) {
        console.error('Error fetching teams:', err);
        setError('Failed to load teams');
      } finally {
        setLoadingTeams(false);
      }
    };

    if (isCommitteeAdmin && userSeasonId) {
      fetchTeams();
    }
  }, [isCommitteeAdmin, userSeasonId]);

  // Filter and sort teams
  const filteredTeams = teams
    .filter(team => 
      team.team.name.toLowerCase().includes(searchQuery.toLowerCase())
    )
    .sort((a, b) => {
      switch (sortBy) {
        case 'name':
          return a.team.name.localeCompare(b.team.name);
        case 'players':
          return b.totalPlayers - a.totalPlayers;
        case 'balance':
          return b.team.balance - a.team.balance;
        default:
          return 0;
      }
    });

  const getPositionColor = (position: string) => {
    const colors: { [key: string]: string } = {
      GK: 'bg-amber-50 text-amber-700 border border-amber-200/40',
      CB: 'bg-rose-50 text-rose-700 border border-rose-200/40',
      LB: 'bg-rose-50/60 text-rose-700 border border-rose-200/30',
      RB: 'bg-rose-50/60 text-rose-700 border border-rose-200/30',
      DMF: 'bg-indigo-50 text-indigo-700 border border-indigo-200/40',
      CMF: 'bg-sky-50 text-sky-700 border border-sky-200/40',
      AMF: 'bg-violet-50 text-violet-700 border border-violet-200/40',
      LMF: 'bg-sky-50/60 text-sky-700 border border-sky-200/30',
      RMF: 'bg-sky-50/60 text-sky-700 border border-sky-200/30',
      LWF: 'bg-emerald-50/60 text-emerald-700 border border-emerald-200/30',
      RWF: 'bg-emerald-50/60 text-emerald-700 border border-emerald-200/30',
      SS: 'bg-emerald-50 text-emerald-700 border border-emerald-200/40',
      CF: 'bg-emerald-50 text-emerald-700 border border-emerald-200/40',
    };
    return colors[position] || 'bg-slate-50 text-slate-700 border border-slate-200/40';
  };

  const copyBalancesToWhatsApp = () => {
    try {
      let message = '💰 *TEAM BALANCES*\n\n';
      message += `📅 Season: ${seasonName || userSeasonId}\n`;
      message += `──────────────────────────────\n\n`;

      // Sort teams by name for the copy
      const sortedTeams = [...filteredTeams].sort((a, b) => 
        a.team.name.localeCompare(b.team.name)
      );

      sortedTeams.forEach((teamData, index) => {
        message += `${index + 1}. *${teamData.team.name}*\n`;
        if (seasonType === 'multi' || teamData.currencySystem === 'dual') {
          message += `   💶 eCoin Budget Left: ${(teamData.footballBudget || 0).toLocaleString()}\n`;
          message += `   🪙 SSCoin Budget Left: ${(teamData.realPlayerBudget || 0).toLocaleString()}\n`;
          message += `   💰 Master Wallet Balance: ${(teamData.team.balance ?? 0).toLocaleString()}\n\n`;
        } else {
          message += `   💰 Balance: ${(teamData.team.balance ?? 0).toLocaleString()}\n\n`;
        }
      });

      // Calculate totals
      message += `──────────────────────────────\n`;
      message += `*TOTALS*\n`;
      
      if (seasonType === 'multi') {
        const totalFootballLeft = sortedTeams.reduce((sum, t) => sum + (t.footballBudget ?? 0), 0);
        const totalRealLeft = sortedTeams.reduce((sum, t) => sum + (t.realPlayerBudget ?? 0), 0);
        const totalWallet = sortedTeams.reduce((sum, t) => sum + (t.team.balance ?? 0), 0);
        
        message += `💶 Total eCoin Left: ${totalFootballLeft.toLocaleString()}\n`;
        message += `🪙 Total SSCoin Left: ${totalRealLeft.toLocaleString()}\n`;
        message += `💰 Total Wallet: ${totalWallet.toLocaleString()}\n\n`;
      } else {
        const totalBalance = sortedTeams.reduce((sum, t) => sum + (t.team.balance ?? 0), 0);
        message += `💰 Total Balance: ${totalBalance.toLocaleString()}\n\n`;
      }
      
      message += `📊 ${sortedTeams.length} teams\n`;
      message += `🕐 ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true })}\n`;

      navigator.clipboard.writeText(message).then(() => {
        alert('✅ Team balances copied to clipboard!\nPaste in WhatsApp.');
      }).catch(err => {
        console.error('Failed to copy:', err);
        alert('❌ Failed to copy. Please try again.');
      });
    } catch (error) {
      console.error('Error generating WhatsApp message:', error);
      alert('❌ Error generating summary.');
    }
  };

  if (loading || loadingTeams) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10 font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading Teams...</p>
        </div>
      </div>
    );
  }

  if (!user || !isCommitteeAdmin) {
    return null;
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="font-mono">
            <h1 className="text-2xl sm:text-3xl font-extrabold uppercase tracking-wider text-slate-800">Season Teams</h1>
            <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
              Season: <span className="font-extrabold text-amber-500">{seasonName || userSeasonId}</span>
            </p>
          </div>
          
          <div className="flex flex-wrap gap-2">
            <button
              onClick={copyBalancesToWhatsApp}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white border border-emerald-700 rounded-xl shadow-sm hover:shadow transition-all font-mono text-xs uppercase tracking-wider font-bold cursor-pointer"
              title="Copy all team balances to WhatsApp"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
              </svg>
              <span>Copy Balances</span>
            </button>

            <Link 
              href="/dashboard/committee" 
              className="flex items-center gap-2 px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-bold"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to Dashboard</span>
            </Link>
          </div>
        </div>

        {error && (
          <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 text-center max-w-md w-full mx-auto relative z-10 font-mono">
            <div className="text-rose-500 mb-4">
              <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wider mb-2">Error</h2>
            <p className="text-xs text-slate-500 uppercase font-semibold mb-4">{error}</p>
          </div>
        )}

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8 font-mono">
          <div className="console-card bg-white rounded-2xl p-5 border border-slate-200/60 hover:border-amber-400/40 transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 shadow-md">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                </svg>
              </div>
            </div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Total Teams</div>
            <div className="text-2xl font-black text-slate-800">{teams.length}</div>
          </div>

          <div className="console-card bg-white rounded-2xl p-5 border border-slate-200/60 hover:border-purple-500/40 transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-purple-500 to-purple-600 shadow-md">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
            </div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Total Players</div>
            <div className="text-2xl font-black text-purple-600">
              {teams.reduce((sum, team) => sum + team.totalPlayers, 0)}
            </div>
          </div>

          <div className="console-card bg-white rounded-2xl p-5 border border-slate-200/60 hover:border-amber-500/40 transition-all hover:-translate-y-1">
            <div className="flex items-center justify-between mb-3">
              <div className="p-3 rounded-xl bg-gradient-to-br from-amber-400 to-amber-500 shadow-md">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </div>
            </div>
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider mb-1">Avg Rating</div>
            <div className="text-2xl font-black text-amber-500 flex items-center gap-1">
              ★ {teams.length > 0 
                ? (teams.reduce((sum, team) => sum + team.avgRating, 0) / teams.length).toFixed(1)
                : '0.0'
              }
            </div>
          </div>
        </div>

        {/* Search and Filter */}
        <div className="console-card bg-white rounded-3xl p-6 shadow-sm border border-slate-200/60 mb-6 font-mono">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <svg className="absolute left-4 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                placeholder="Search teams..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-12 pr-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/20 text-xs uppercase tracking-wider font-bold transition-all"
              />
            </div>
            
            <div className="flex gap-2">
              <button
                onClick={() => setSortBy('name')}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                  sortBy === 'name'
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-900'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/60'
                }`}
              >
                Name
              </button>
              <button
                onClick={() => setSortBy('players')}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                  sortBy === 'players'
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-900'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/60'
                }`}
              >
                Players
              </button>
              <button
                onClick={() => setSortBy('balance')}
                className={`px-4 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wider transition-all ${
                  sortBy === 'balance'
                    ? 'bg-slate-800 text-white shadow-sm border border-slate-900'
                    : 'bg-white hover:bg-slate-50 text-slate-700 border border-slate-200/60'
                }`}
              >
                Balance
              </button>
            </div>
          </div>
          
          {searchQuery && (
            <div className="mt-4 text-[10px] text-slate-400 uppercase tracking-wider font-bold">
              Found {filteredTeams.length} team{filteredTeams.length !== 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* Teams Grid */}
        <div className="console-card bg-white rounded-3xl p-6 shadow-sm border border-slate-200/60">
          {filteredTeams.length > 0 ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredTeams.map((teamData) => (
                <div 
                  key={teamData.team.id} 
                  className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 hover:border-amber-400/40 hover:shadow-md transition-all duration-200 font-mono flex flex-col justify-between"
                >
                  <div>
                    {/* Team Header */}
                    <div className="flex items-center mb-4 gap-3 justify-between">
                      <div className="flex items-center gap-3">
                        <div className="h-14 w-14 flex-shrink-0 bg-slate-50 border border-slate-200/60 rounded-xl flex items-center justify-center p-1.5 relative overflow-hidden shadow-inner">
                          {teamData.team.logoUrl ? (
                            <Image 
                              src={teamData.team.logoUrl} 
                              alt={teamData.team.name} 
                              width={56}
                              height={56}
                              className="object-contain w-full h-full"
                            />
                          ) : (
                            <svg className="w-6 h-6 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                            </svg>
                          )}
                        </div>
                        <div>
                          <h2 className="text-lg font-bold text-slate-800 uppercase tracking-wide leading-tight">{teamData.team.name}</h2>
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold bg-green-50 text-green-700 border border-green-200/40 mt-1 uppercase tracking-wider">
                            <svg className="w-2.5 h-2.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
                            </svg>
                            Registered
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Team Stats Grid */}
                    <div className="grid grid-cols-2 gap-2 mb-4 text-[10px] uppercase font-bold tracking-wider">
                      {/* Players Count */}
                      <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between">
                        <span className="text-slate-400 text-[8px] mb-1">Squad Players</span>
                        <span className="text-slate-700 flex items-center gap-1 font-mono">
                          ⚽ {teamData.totalPlayers} / {maxPlayers}
                        </span>
                      </div>

                      {/* Currency Display (Dynamically checking if multi-currency or single currency) */}
                      {seasonType === 'multi' || teamData.currencySystem === 'dual' ? (
                        <>
                          <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between col-span-1">
                            <span className="text-slate-400 text-[8px] mb-1">eCoin Spent</span>
                            <span className="text-blue-600 font-extrabold font-mono text-xs">
                              {(teamData.footballSpent || 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between col-span-1">
                            <span className="text-slate-400 text-[8px] mb-1">SSCoin Spent</span>
                            <span className="text-purple-600 font-extrabold font-mono text-xs">
                              {(teamData.realPlayerSpent || 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between col-span-1">
                            <span className="text-slate-400 text-[8px] mb-1">eCoin Left</span>
                            <span className="text-indigo-600 font-extrabold font-mono text-xs">
                              {(teamData.footballBudget || 0).toLocaleString()}
                            </span>
                          </div>
                          <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between col-span-1">
                            <span className="text-slate-400 text-[8px] mb-1">SSCoin Left</span>
                            <span className="text-amber-600 font-extrabold font-mono text-xs">
                              {(teamData.realPlayerBudget || 0).toLocaleString()}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between col-span-1">
                            <span className="text-slate-400 text-[8px] mb-1">Total Value</span>
                            <span className="text-emerald-600 font-extrabold font-mono text-xs">
                              {teamData.totalValue.toLocaleString()}
                            </span>
                          </div>
                          <div className="bg-slate-50 border border-slate-100 p-2.5 rounded-xl flex flex-col justify-between col-span-1">
                            <span className="text-slate-400 text-[8px] mb-1">Wallet Balance</span>
                            <span className="text-amber-600 font-extrabold font-mono text-xs">
                              {teamData.team.balance.toLocaleString()}
                            </span>
                          </div>
                        </>
                      )}
                    </div>

                    {/* Average Rating */}
                    {teamData.avgRating > 0 && (
                      <div className="mb-4 p-3 bg-amber-50/50 border border-amber-200/50 rounded-xl">
                        <div className="flex items-center justify-between font-mono">
                          <span className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Squad Avg Rating</span>
                          <span className="text-lg font-black text-amber-500">
                            ★ {teamData.avgRating.toFixed(1)}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Squad Composition */}
                    <div className="space-y-2 mb-4">
                      <h3 className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Squad Composition</h3>
                      <div className="grid grid-cols-4 gap-1 text-[9px] font-mono font-bold">
                        {['GK', 'CB', 'LB', 'RB', 'DMF', 'CMF', 'AMF', 'LMF', 'RMF', 'LWF', 'RWF', 'SS', 'CF'].map((position) => {
                          const count = teamData.positionBreakdown[position] || 0;
                          return (
                            <div 
                              key={position} 
                              className={`rounded-lg py-1 px-1.5 flex justify-between items-center ${getPositionColor(position)} ${
                                count === 0 ? 'opacity-30' : ''
                              }`}
                            >
                              <span>{position}</span>
                              <span className="font-extrabold">{count}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  {/* View Details Button */}
                  <div className="mt-auto pt-3 border-t border-slate-100">
                    <Link
                      href={`/dashboard/committee/teams/${teamData.team.id}`}
                      className="w-full inline-flex items-center justify-center px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-900 rounded-xl font-mono font-bold text-xs uppercase tracking-wider transition-all shadow-sm"
                    >
                      View Details
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-16 font-mono">
              <svg className="w-16 h-16 mx-auto text-slate-300 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
              </svg>
              <h3 className="text-lg font-bold text-slate-800 uppercase tracking-wider mb-2">
                {searchQuery ? 'No teams found' : 'No teams registered'}
              </h3>
              <p className="text-xs text-slate-500 font-semibold uppercase">
                {searchQuery 
                  ? 'Try adjusting your search query'
                  : 'Teams will appear here once they register for the season'
                }
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
