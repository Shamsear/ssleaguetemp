'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';

interface ImportStep {
  name: string;
  description: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number;
  message?: string;
  error?: string;
}

interface ImportProgress {
  status: 'running' | 'completed' | 'failed';
  overall_progress: number;
  current_step: number;
  steps: ImportStep[];
  summary?: {
    new_players_created: number;
    existing_players_updated: number;
    total_operations: number;
    total_processed: number;
  };
}

function PlayersImportProgressContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const importId = searchParams.get('id');

  const [progress, setProgress] = useState<ImportProgress>({
    status: 'running',
    overall_progress: 0,
    current_step: 0,
    steps: [
      { name: 'Initializing Import', description: 'Preparing player import process', status: 'running', progress: 0 },
      { name: 'Validating Data', description: 'Checking player data integrity', status: 'pending', progress: 0 },
      { name: 'Creating Players', description: 'Adding new players to database', status: 'pending', progress: 0 },
      { name: 'Updating Players', description: 'Updating existing player records', status: 'pending', progress: 0 },
      { name: 'Finalizing', description: 'Completing import and cleanup', status: 'pending', progress: 0 },
    ],
  });

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  // Simulate progress updates - Replace with actual Server-Sent Events or WebSocket
  useEffect(() => {
    if (!importId) return;

    let currentStep = 0;
    const interval = setInterval(() => {
      setProgress(prev => {
        const newSteps = [...prev.steps];
        const step = newSteps[currentStep];

        if (step) {
          // Update current step progress
          if (step.progress < 100) {
            step.progress = Math.min(step.progress + 20, 100);
            step.status = 'running';
            step.message = `Processing... ${step.progress}%`;
          } else if (step.progress === 100 && step.status === 'running') {
            step.status = 'completed';
            step.message = 'Completed successfully';
            currentStep++;
            
            // Start next step
            if (currentStep < newSteps.length) {
              newSteps[currentStep].status = 'running';
              newSteps[currentStep].progress = 0;
            }
          }
        }

        const completedSteps = newSteps.filter(s => s.status === 'completed').length;
        const overallProgress = Math.round((completedSteps / newSteps.length) * 100);
        const allCompleted = completedSteps === newSteps.length;

        return {
          ...prev,
          steps: newSteps,
          overall_progress: overallProgress,
          current_step: currentStep,
          status: allCompleted ? 'completed' : 'running',
          summary: allCompleted ? {
            new_players_created: 45,
            existing_players_updated: 23,
            total_operations: 68,
            total_processed: 68,
          } : undefined,
        };
      });
    }, 800);

    return () => clearInterval(interval);
  }, [importId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-amber-50 border border-amber-200 text-amber-700';
      case 'completed':
        return 'bg-emerald-50 border border-emerald-200 text-emerald-700';
      case 'failed':
        return 'bg-rose-50 border border-rose-200 text-rose-700';
      default:
        return 'bg-slate-50 border border-slate-200 text-slate-700';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <div className="w-5 h-5 rounded-full bg-slate-200 border border-slate-300"></div>;
      case 'running':
        return <div className="w-5 h-5 rounded-full bg-amber-500 animate-pulse border border-amber-600"></div>;
      case 'completed':
        return (
          <svg className="w-5 h-5 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-5 h-5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        );
      default:
        return null;
    }
  };

  const getStepBorderClass = (status: string) => {
    switch (status) {
      case 'running':
        return 'border-amber-200 bg-amber-50/40 text-amber-805';
      case 'completed':
        return 'border-emerald-100 bg-emerald-50/20 text-emerald-800';
      case 'failed':
        return 'border-rose-200 bg-rose-50/25 text-rose-800';
      default:
        return 'border-slate-100 bg-slate-50/5 text-slate-400';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center pt-32">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-500 font-mono text-xs tracking-wider uppercase animate-pulse">Syncing import status...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  if (!importId) {
    return (
      <div className="flex items-center justify-center pt-32">
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-8 max-w-md w-full shadow-sm text-center">
          <p className="text-slate-600 mb-6 font-mono text-sm">No active import sequence ID found.</p>
          <button
            onClick={() => router.push('/dashboard/superadmin/players')}
            className="px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm"
          >
            Return to Database
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in font-mono">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/60">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/superadmin/players')}
            className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-650 hover:text-slate-950 transition-all flex-shrink-0 shadow-sm"
            title="Back to Database"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
              Player Import Progress
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-1">
              Synchronizing spreadsheet player registry records to database.
            </p>
          </div>
        </div>
        <div className="flex items-center">
          <div className={`flex items-center gap-2 px-4 py-2 border rounded-xl text-xs font-bold font-mono shadow-sm ${getStatusColor(progress.status)}`}>
            {progress.status === 'running' && (
              <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            )}
            <span>
              {progress.status === 'running' && 'Processing Sync'}
              {progress.status === 'completed' && 'Sync Completed'}
              {progress.status === 'failed' && 'Sync Failed'}
            </span>
          </div>
        </div>
      </div>

      {/* Overall Progress */}
      <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700">Overall Synchronization Progress</h2>
            <span className="text-xl font-extrabold text-amber-600">{progress.overall_progress}%</span>
          </div>
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
            <div
              className="bg-amber-500 h-full rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress.overall_progress}%` }}
            ></div>
          </div>
        </div>
        <div className="text-xs text-slate-500 font-mono">
          {progress.steps[progress.current_step] && (
            <>
              Current sequence: <span className="font-semibold text-slate-700">{progress.steps[progress.current_step].name}</span>
              {progress.steps[progress.current_step].message && (
                <span className="block text-[10px] text-slate-400 mt-1 italic">
                  {progress.steps[progress.current_step].message}
                </span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Detailed Steps */}
      <div className="console-card bg-white border border-slate-200/60 rounded-2xl shadow-sm overflow-hidden mb-8">
        <div className="px-6 py-4 border-b border-slate-200/60 bg-slate-50/50">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
            </svg>
            Execution Sync Log
          </h3>
        </div>

        <div className="p-6">
          <div className="space-y-4">
            {progress.steps.map((step, index) => (
              <div key={index} className={`flex items-center p-4 rounded-xl border transition-all ${getStepBorderClass(step.status)}`}>
                <div className="flex-shrink-0 mr-4">
                  {getStatusIcon(step.status)}
                </div>
                <div className="flex-grow min-w-0">
                  <h4 className="font-bold text-sm text-slate-800">
                    {step.name}
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">{step.description}</p>
                  {step.message && (
                    <p className="text-[10px] text-slate-400 mt-1 italic">{step.message}</p>
                  )}
                  {step.error && (
                    <p className="text-[10px] text-rose-600 mt-1">Error code: {step.error}</p>
                  )}
                </div>
                <div className="flex-shrink-0 ml-4">
                  {step.status === 'running' && step.progress > 0 && (
                    <div className="w-16">
                      <div className="w-full bg-slate-205/60 rounded-full h-1.5 overflow-hidden border border-slate-200">
                        <div
                          className="bg-amber-500 h-full rounded-full transition-all duration-300"
                          style={{ width: `${step.progress}%` }}
                        ></div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Import Summary */}
      {progress.summary && progress.status === 'completed' && (
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm mb-8">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-slate-700 mb-6 flex items-center gap-2">
            <svg className="w-4 h-4 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
            </svg>
            Sync Operation Statistics
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono">
            <div className="text-center p-4 bg-emerald-50 border border-emerald-200 rounded-xl">
              <div className="text-2xl font-extrabold text-emerald-705">{progress.summary.new_players_created}</div>
              <div className="text-[10px] text-emerald-800 uppercase tracking-wider mt-1">New Players</div>
            </div>
            <div className="text-center p-4 bg-blue-50 border border-blue-200 rounded-xl">
              <div className="text-2xl font-extrabold text-blue-600">{progress.summary.existing_players_updated}</div>
              <div className="text-[10px] text-blue-800 uppercase tracking-wider mt-1">Updated Players</div>
            </div>
            <div className="text-center p-4 bg-slate-50 border border-slate-200 rounded-xl">
              <div className="text-2xl font-extrabold text-slate-800">{progress.summary.total_operations}</div>
              <div className="text-[10px] text-slate-600 uppercase tracking-wider mt-1">Total Operations</div>
            </div>
            <div className="text-center p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="text-2xl font-extrabold text-amber-700">{progress.summary.total_processed}</div>
              <div className="text-[10px] text-amber-800 uppercase tracking-wider mt-1">Processed</div>
            </div>
          </div>
        </div>
      )}

      {/* Action Button */}
      {progress.status === 'completed' && (
        <div className="flex justify-center">
          <button
            onClick={() => router.push('/dashboard/superadmin/players')}
            className="inline-flex items-center gap-1.5 px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            View Roster Results
          </button>
        </div>
      )}

      {progress.status === 'failed' && (
        <div className="flex justify-center gap-4">
          <button
            onClick={() => router.push('/dashboard/superadmin/players')}
            className="inline-flex items-center gap-1.5 px-6 py-3 bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-700 font-mono text-xs font-bold rounded-xl transition-all shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Players
          </button>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Retry Import Sync
          </button>
        </div>
      )}
    </div>
  );
}

export default function PlayersImportProgress() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center pt-32 animate-fade-in font-mono">
        <div className="text-center space-y-4">
          <div className="relative w-16 h-16 mx-auto">
            <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
            <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
          </div>
          <p className="text-slate-500 font-mono text-xs tracking-wider uppercase animate-pulse">Initializing Sub-System...</p>
        </div>
      </div>
    }>
      <PlayersImportProgressContent />
    </Suspense>
  );
}
