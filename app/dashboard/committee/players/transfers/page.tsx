'use client';
import { DollarSign, RefreshCw, Trash2, Activity, BarChart2, Unlock } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { usePermissions } from '@/hooks/usePermissions';
import TransferFormV2 from './TransferFormV2';
import SwapFormV2 from './SwapFormV2';
import FootballPlayerForm from './FootballPlayerForm';
import ReleaseRealPlayerForm from './ReleaseRealPlayerForm';
import ReleaseFootballPlayerForm from './ReleaseFootballPlayerForm';
import BulkReleaseFootballPlayerForm from './BulkReleaseFootballPlayerForm';
import BulkSwapForm from './BulkSwapForm';
import Link from 'next/link';

type TabType = 'transfer' | 'swap' | 'bulk_swap' | 'release' | 'bulk_release';

export default function PlayerTransfersPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { isCommitteeAdmin } = usePermissions();

  const [activeTab, setActiveTab] = useState<TabType>('swap');
  const [playerType, setPlayerType] = useState<'real' | 'football'>('real');

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && !isCommitteeAdmin) {
      router.push('/dashboard');
    }
  }, [user, loading, router, isCommitteeAdmin]);

  // Adjust default tab when playerType changes (real doesn't have bulk tabs)
  useEffect(() => {
    if (playerType === 'real' && (activeTab === 'bulk_swap' || activeTab === 'bulk_release')) {
      setActiveTab('swap');
    }
  }, [playerType, activeTab]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center font-mono">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-xs text-slate-550 font-mono font-extrabold uppercase tracking-wider">Loading transfer system...</p>
        </div>
      </div>
    );
  }

  if (!user || !isCommitteeAdmin) {
    return null;
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-5xl mx-auto relative z-10 space-y-8">
        {/* Header Back Button & ID Badge */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <Link href="/dashboard/committee/players" className="inline-flex items-center px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all">
            &larr; Back to Player List
          </Link>
          
          <div className="bg-slate-800 text-white font-mono font-bold text-xs uppercase tracking-wider px-3 py-1.5 rounded-xl border border-slate-700 shadow-sm shrink-0">
            SYSTEM: TRANSFERS
          </div>
        </div>

        {/* Title, Subtitle and Player Type Selector */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm">
          <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-6">
            <div>
              <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tight font-mono">
                Player Swap & Release v2.0
              </h1>
              <p className="text-xs text-slate-400 font-mono mt-1 leading-normal">
                Swap and release players for free with category-based value increases and automatic upgrades.
              </p>
            </div>

            {/* Player Type Selector Toggles */}
            <div className="flex gap-2 p-1.5 bg-slate-50 border border-slate-150 rounded-2xl shrink-0 font-mono text-[10px] uppercase font-bold tracking-wider">
              <button
                onClick={() => {
                  setPlayerType('real');
                  setActiveTab('swap');
                }}
                className={`px-4 py-2.5 rounded-xl transition-all ${
                  playerType === 'real'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                👤 Real Players
              </button>
              <button
                onClick={() => {
                  setPlayerType('football');
                  setActiveTab('swap');
                }}
                className={`px-4 py-2.5 rounded-xl transition-all ${
                  playerType === 'football'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-100'
                }`}
              >
                <Activity className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Football Players
              </button>
            </div>
          </div>

          {/* Quick Links */}
          <div className="flex gap-3 flex-wrap mt-6 font-mono text-[10px] uppercase font-bold tracking-wider">
            <Link
              href="/dashboard/committee/players/transfers/history"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl shadow-sm transition-all"
            >
              <BarChart2 className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Transaction History
            </Link>
            <Link
              href="/dashboard/committee/reports/fees"
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-xl shadow-sm transition-all"
            >
              <DollarSign className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Committee Fee Reports
            </Link>
          </div>
        </div>

        {/* Global System Rules Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 shadow-sm font-mono text-xs">
          <h3 className="text-xs font-bold text-amber-600 uppercase tracking-wider mb-3 flex items-center gap-1.5">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            System Rules Summary
          </h3>
          <ul className="space-y-1.5 text-slate-500">
            <li>• <strong className="text-slate-800">Transfer Limits:</strong> 2 operations per team per season</li>
            <li>• <strong className="text-slate-800">Free Swaps & Releases:</strong> No swap fees, committee fees, or financial transactions</li>
            <li>• <strong className="text-slate-800">Value Appreciation:</strong> Player card values increase based on category multiplier on swap</li>
            <li>• <strong className="text-slate-800">Auto Upgrades:</strong> Players upgrade their category automatically as points increase</li>
          </ul>
        </div>

        {/* Operation Tabs Selector */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-2 shadow-sm font-mono text-[10px] uppercase font-bold tracking-wider">
          {playerType === 'real' ? (
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('transfer')}
                className={`flex-1 px-3 py-2.5 rounded-2xl transition-all ${
                  activeTab === 'transfer'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                💸 Transfer Player
              </button>
              <button
                onClick={() => setActiveTab('swap')}
                className={`flex-1 px-3 py-2.5 rounded-2xl transition-all ${
                  activeTab === 'swap'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <RefreshCw className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Swap Players
              </button>
              <button
                onClick={() => setActiveTab('release')}
                className={`flex-1 px-3 py-2.5 rounded-2xl transition-all ${
                  activeTab === 'release'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Unlock className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Release Player
              </button>
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap sm:flex-nowrap">
              <button
                onClick={() => setActiveTab('swap')}
                className={`flex-1 px-3 py-2.5 rounded-2xl transition-all ${
                  activeTab === 'swap'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <RefreshCw className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Swap Players
              </button>
              <button
                onClick={() => setActiveTab('bulk_swap')}
                className={`flex-1 px-3 py-2.5 rounded-2xl transition-all ${
                  activeTab === 'bulk_swap'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <RefreshCw className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /><RefreshCw className="w-4 h-4 inline-block text-slate-500 mr-1 align-text-bottom" /> Bulk Swap
              </button>
              <button
                onClick={() => setActiveTab('release')}
                className={`flex-1 px-3 py-2.5 rounded-2xl transition-all ${
                  activeTab === 'release'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Unlock className="w-4 h-4 inline-block text-emerald-500 mr-1 align-text-bottom" /> Release Player
              </button>
              <button
                onClick={() => setActiveTab('bulk_release')}
                className={`flex-1 px-3 py-2.5 rounded-2xl transition-all ${
                  activeTab === 'bulk_release'
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                <Trash2 className="w-4 h-4 inline-block text-rose-500 mr-1 align-text-bottom" /> Bulk Release
              </button>
            </div>
          )}
        </div>

        {/* Tab Forms Content */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm !overflow-visible">
          {playerType === 'football' ? (
            <>
              {/* Football Player Swap */}
              {activeTab === 'swap' && (
                <div className="space-y-6">
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 shadow-inner font-mono text-xs">
                    <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-2.5">How Football Player Swaps Work</h3>
                    <ul className="space-y-1.5 text-slate-600">
                      <li>• Exchange team assignments AND acquisition values between two players</li>
                      <li>• First 6 swaps FREE, 7th swap = 100, 8th swap = 125</li>
                      <li>• Values are swapped: Player A gets Player B's value, Player B gets Player A's value</li>
                    </ul>
                  </div>
                  <FootballPlayerForm key={playerType} />
                </div>
              )}

              {/* Football Player Bulk Swap */}
              {activeTab === 'bulk_swap' && (
                <div>
                  <BulkSwapForm />
                </div>
              )}

              {/* Football Player Release */}
              {activeTab === 'release' && (
                <div className="space-y-6">
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 shadow-inner font-mono text-xs">
                    <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-2.5">How Football Player Release Works</h3>
                    <ul className="space-y-1.5 text-slate-600">
                      <li>• Release players at season start or mid-season</li>
                      <li>• <strong className="text-slate-800">Manually select refund percentage</strong> (0-100%)</li>
                      <li>• Refund added to team's football budget</li>
                      <li>• Player becomes a free agent immediately</li>
                      <li>• Example: 1000 eCoin player with 75% refund = 750 eCoin back to team</li>
                    </ul>
                  </div>
                  <ReleaseFootballPlayerForm />
                </div>
              )}

              {/* Football Player Bulk Release */}
              {activeTab === 'bulk_release' && (
                <div className="space-y-6">
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 shadow-inner font-mono text-xs">
                    <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-2.5">How Bulk Release Works</h3>
                    <ul className="space-y-1.5 text-slate-600">
                      <li>• Release multiple players at once with individual refund percentages</li>
                      <li>• Set a default refund percentage for all players</li>
                      <li>• Customize refund percentage for each player individually</li>
                      <li>• See total refund amount before confirming</li>
                      <li>• All refunds added to respective team's football budget</li>
                    </ul>
                  </div>
                  <BulkReleaseFootballPlayerForm />
                </div>
              )}
            </>
          ) : (
            <>
              {/* Real Player Transfer */}
              {activeTab === 'transfer' && (
                <div className="space-y-6">
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 shadow-inner font-mono text-xs">
                    <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-2.5">How Transfers Work</h3>
                    <ul className="space-y-1.5 text-slate-600">
                      <li>• Player value increases based on star rating (115%-150%)</li>
                      <li>• Buying team pays: New Value + 10% committee fee</li>
                      <li>• Selling team receives: New Value - 10% committee fee</li>
                      <li>• Player may upgrade star rating based on value increase</li>
                      <li>• Both teams use 1 transfer slot (max 2 per season)</li>
                    </ul>
                  </div>
                  <TransferFormV2 key={playerType} playerType={playerType} />
                </div>
              )}

              {/* Real Player Swap */}
              {activeTab === 'swap' && (
                <div className="space-y-6">
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 shadow-inner font-mono text-xs">
                    <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-2.5">How Swaps Work</h3>
                    <ul className="space-y-1.5 text-slate-600">
                      <li>• Both player values increase based on star ratings</li>
                      <li>• Fixed committee fees based on star ratings (30-100)</li>
                      <li>• Optional cash addition up to 30% of player value</li>
                      <li>• Both players may upgrade star ratings</li>
                      <li>• Both teams use 1 transfer slot (max 2 per season)</li>
                    </ul>
                  </div>
                  <SwapFormV2 key={playerType} playerType={playerType} />
                </div>
              )}

              {/* Real Player Release */}
              {activeTab === 'release' && (
                <div className="space-y-6">
                  <div className="bg-slate-50 border border-slate-100 rounded-2xl p-5 shadow-inner font-mono text-xs">
                    <h3 className="font-extrabold text-slate-800 uppercase tracking-wider mb-2.5">How Player Release Works</h3>
                    <ul className="space-y-1.5 text-slate-600">
                      <li>• Release players at season start or mid-season</li>
                      <li>• <strong className="text-slate-800">Manually select refund percentage</strong> (0-100%)</li>
                      <li>• Refund added to team's dollar balance</li>
                      <li>• Player becomes a free agent immediately</li>
                      <li>• Example: $1000 player with 75% refund = $750 back to team</li>
                    </ul>
                  </div>
                  <ReleaseRealPlayerForm />
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer info */}
        <div className="text-center font-mono text-[10px] text-slate-550 font-mono font-extrabold uppercase tracking-wider mt-8">
          Need help? Check the{' '}
          <a href="#" className="text-amber-600 hover:underline">
            Committee Admin Guide
          </a>
          {' '}or contact support.
        </div>
      </div>
    </div>
  );
}
