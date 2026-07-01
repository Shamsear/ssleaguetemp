'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, Suspense } from 'react';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { ArrowLeft } from 'lucide-react';


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
    season_created: boolean;
    teams_created: number;
    players_created: number;
    awards_created: number;
    total_operations: number;
  };
}

function ImportProgressContent() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const importId = searchParams.get('id');
  const [seasonId, setSeasonId] = useState<string | null>(searchParams.get('seasonId'));
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  const [progress, setProgress] = useState<ImportProgress>({
    status: 'running',
    overall_progress: 0,
    current_step: 0,
    steps: [
      { name: 'Initializing Import', description: 'Preparing historical season import process', status: 'running', progress: 0 },
      { name: 'Creating Season', description: 'Setting up season record in database', status: 'pending', progress: 0 },
      { name: 'Importing Teams', description: 'Adding teams to the season', status: 'pending', progress: 0 },
      { name: 'Importing Players', description: 'Adding players and assigning to teams', status: 'pending', progress: 0 },
      { name: 'Importing Awards', description: 'Creating season awards and winners', status: 'pending', progress: 0 },
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

  // Fetch real progress from API
  useEffect(() => {
    if (!importId) return;

    const fetchProgress = async () => {
      try {
        const response = await fetchWithTokenRefresh(`/api/seasons/historical/import?importId=${importId}`);
        const result = await response.json();
        
        if (result.success) {
          const apiProgress = result.progress;
          
          // Extract seasonId if available
          if (apiProgress.seasonId && !seasonId) {
            setSeasonId(apiProgress.seasonId);
          }
          
          // Map API progress to our component structure
          setProgress(prev => {
            const newSteps = [...prev.steps];
            
            // Reset all steps first
            newSteps.forEach(step => {
              step.status = 'pending';
              step.progress = 0;
              step.message = undefined;
            });
            
            // Update based on API status
            let currentStepIndex = 0;
            
            switch (apiProgress.status) {
              case 'initializing':
                currentStepIndex = 0;
                break;
              case 'importing_season':
                newSteps[0].status = 'completed';
                currentStepIndex = 1;
                break;
              case 'importing_teams':
                newSteps[0].status = 'completed';
                newSteps[1].status = 'completed';
                currentStepIndex = 2;
                break;
              case 'importing_players':
                newSteps[0].status = 'completed';
                newSteps[1].status = 'completed';
                newSteps[2].status = 'completed';
                currentStepIndex = 3;
                break;
              case 'importing_awards':
                newSteps[0].status = 'completed';
                newSteps[1].status = 'completed';
                newSteps[2].status = 'completed';
                newSteps[3].status = 'completed';
                currentStepIndex = 4;
                break;
              case 'importing_matches':
                newSteps[0].status = 'completed';
                newSteps[1].status = 'completed';
                newSteps[2].status = 'completed';
                newSteps[3].status = 'completed';
                newSteps[4].status = 'completed';
                currentStepIndex = 5;
                break;
              case 'completed':
                newSteps.forEach(step => step.status = 'completed');
                currentStepIndex = newSteps.length;
                break;
              case 'failed':
                newSteps[currentStepIndex].status = 'failed';
                newSteps[currentStepIndex].error = apiProgress.error;
                break;
            }
            
            // Update current running step
            if (currentStepIndex < newSteps.length && apiProgress.status !== 'completed' && apiProgress.status !== 'failed') {
              newSteps[currentStepIndex].status = 'running';
              newSteps[currentStepIndex].progress = Math.round(apiProgress.progress);
              newSteps[currentStepIndex].message = apiProgress.currentTask;
            }
            
            const completedSteps = newSteps.filter(s => s.status === 'completed').length;
            const overallProgress = apiProgress.status === 'completed' ? 100 : Math.round((completedSteps / newSteps.length) * 100);
            const allCompleted = apiProgress.status === 'completed';
            const failed = apiProgress.status === 'failed';
            
            return {
              ...prev,
              steps: newSteps,
              overall_progress: overallProgress,
              current_step: currentStepIndex,
              status: failed ? 'failed' : (allCompleted ? 'completed' : 'running'),
              summary: allCompleted ? {
                season_created: true,
                teams_created: 0, // Will be updated with real data
                players_created: 0,
                awards_created: 0,
                total_operations: apiProgress.totalItems || 0,
              } : undefined,
            };
          });
        }
      } catch (error) {
        console.error('Error fetching progress:', error);
      }
    };
    
    // Initial fetch
    fetchProgress();
    
    // Poll for updates every 1 second
    const interval = setInterval(fetchProgress, 1000);

    return () => clearInterval(interval);
  }, [importId]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'bg-blue-100 text-amber-700';
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'failed':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pending':
        return <div className="w-5 h-5 rounded-full bg-slate-200 border border-slate-300"></div>;
      case 'running':
        return <div className="w-5 h-5 rounded-full bg-amber-500 border border-amber-600 animate-pulse"></div>;
      case 'completed':
        return (
          <svg className="w-6 h-6 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        );
      case 'failed':
        return (
          <svg className="w-6 h-6 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
        return 'border-amber-200 bg-amber-500/5';
      case 'completed':
        return 'border-emerald-200 bg-emerald-50/20';
      case 'failed':
        return 'border-rose-200 bg-rose-50/20';
      default:
        return 'border-gray-200';
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
          <p className="text-slate-550 font-mono text-xs tracking-widest uppercase animate-pulse">Checking import status...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  if (!importId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No import ID provided</p>
          <button
            onClick={() => router.push('/dashboard/superadmin/historical-seasons')}
            className="mt-4 px-5 py-2.5 bg-slate-800 hover:bg-slate-900 text-white font-mono text-xs font-bold rounded-xl transition-all shadow-sm"
          >
            Return to Historical Seasons
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-fade-in font-mono">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/60">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
            Season Import in Progress
          </h1>
          <p className="text-xs text-slate-505 font-mono mt-1">
            Importing historical season data records to the database.
          </p>
        </div>
        <div className="flex items-center">
          <div className={`flex items-center px-3 py-1.5 rounded-xl text-xs font-bold border ${getStatusColor(progress.status)}`}>
            {progress.status === 'running' && (
              <span className="w-3.5 h-3.5 border-2 border-amber-600 border-t-transparent rounded-full animate-spin mr-2"></span>
            )}
            <span>
              {progress.status === 'running' && 'Processing...'}
              {progress.status === 'completed' && 'Completed!'}
              {progress.status === 'failed' && 'Failed'}
            </span>
          </div>
        </div>
      </div>

        {/* Overall Progress */}
        <div className="console-card bg-white border border-slate-200/60 shadow-sm rounded-2xl p-6 mb-8 shadow-lg backdrop-blur-md border border-white/20">
          <div className="mb-4">
            <div className="flex justify-between items-center mb-2">
              <h2 className="text-xl font-semibold text-gray-800">Overall Progress</h2>
              <span className="text-2xl font-bold text-amber-600">{progress.overall_progress}%</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className="bg-amber-500 h-4 rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress.overall_progress}%` }}
              ></div>
            </div>
          </div>
          <div className="text-sm text-gray-600">
            {progress.steps[progress.current_step] && (
              <>
                <span className="font-medium">{progress.steps[progress.current_step].name}</span>
                {progress.steps[progress.current_step].message && (
                  <span className="block text-xs text-gray-500 mt-1">
                    {progress.steps[progress.current_step].message}
                  </span>
                )}
              </>
            )}
          </div>
        </div>

        {/* Detailed Steps */}
        <div className="console-card bg-white border border-slate-200/60 shadow-sm rounded-2xl shadow-lg backdrop-blur-md border border-white/20 overflow-hidden mb-8">
          <div className="px-6 py-5 bg-slate-50 border-b border-slate-200/60">
            <h3 className="text-xl font-semibold text-amber-600 flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
              Season Import Steps
            </h3>
          </div>

          <div className="p-6">
            <div className="space-y-4">
              {progress.steps.map((step, index) => (
                <div key={index} className={`flex items-center p-4 rounded-lg border ${getStepBorderClass(step.status)}`}>
                  <div className="flex-shrink-0 mr-4">
                    {getStatusIcon(step.status)}
                  </div>
                  <div className="flex-grow">
                    <h4 className={`font-medium ${step.status === 'running' ? 'text-amber-700' : step.status === 'completed' ? 'text-green-800' : step.status === 'failed' ? 'text-red-800' : 'text-gray-600'}`}>
                      {step.name}
                    </h4>
                    <p className="text-sm text-gray-600">{step.description}</p>
                    {step.message && (
                      <p className="text-xs text-gray-500 mt-1">{step.message}</p>
                    )}
                    {step.error && (
                      <p className="text-xs text-red-600 mt-1">Error: {step.error}</p>
                    )}
                  </div>
                  <div className="flex-shrink-0 ml-4">
                    {step.status === 'running' && step.progress > 0 && (
                      <div className="w-16">
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-amber-500 h-2 rounded-full transition-all duration-300"
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
          <div className="console-card bg-white border border-slate-200/60 shadow-sm rounded-2xl p-6 shadow-lg backdrop-blur-md border border-white/20 mb-8">
            <h3 className="text-xl font-semibold text-gray-800 mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
              Import Statistics
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="text-center p-4 bg-purple-50 rounded-xl border border-purple-200">
                <div className="text-2xl font-bold text-purple-600">
                  {progress.summary.season_created ? '✓' : '✗'}
                </div>
                <div className="text-sm text-gray-600">Season Created</div>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-xl border border-blue-200">
                <div className="text-2xl font-bold text-blue-600">{progress.summary.teams_created}</div>
                <div className="text-sm text-gray-600">Teams</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-xl border border-green-200">
                <div className="text-2xl font-bold text-green-600">{progress.summary.players_created}</div>
                <div className="text-sm text-gray-600">Players</div>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-xl border border-yellow-200">
                <div className="text-2xl font-bold text-yellow-600">{progress.summary.awards_created}</div>
                <div className="text-sm text-gray-600">Awards</div>
              </div>
              <div className="text-center p-4 bg-indigo-50 rounded-xl border border-indigo-200">
                <div className="text-2xl font-bold text-indigo-600">{progress.summary.total_operations}</div>
                <div className="text-sm text-gray-600">Total Items</div>
              </div>
            </div>
          </div>
        )}

        {/* Action Button */}
        {progress.status === 'completed' && (
          <div className="flex justify-center">
            <button
              onClick={() => router.push('/dashboard/superadmin/historical-seasons')}
              className="inline-flex items-center px-6 py-3 bg-slate-800 hover:bg-slate-900 text-white text-sm font-medium rounded-lg transition-colors shadow-lg"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              View Historical Seasons
            </button>
          </div>
        )}

        {progress.status === 'failed' && (
          <div className="space-y-6">
            {/* Error Alert */}
            <div className="console-card bg-white border border-slate-200/60 shadow-sm rounded-2xl p-6 bg-red-50/50 border border-red-200">
              <div className="flex items-start">
                <svg className="w-6 h-6 text-red-600 mt-0.5 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <h3 className="text-lg font-semibold text-red-800 mb-2">Import Failed</h3>
                  <p className="text-sm text-red-700 mb-4">
                    The import process encountered an error. You can clean up partial data and retry the import.
                  </p>
                  {seasonId && (
                    <p className="text-xs text-red-600 mb-4">
                      Season ID: <code className="bg-red-100 px-2 py-1 rounded">{seasonId}</code>
                    </p>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row justify-center gap-4">
              <button
                onClick={() => router.push('/dashboard/superadmin/historical-seasons')}
                className="inline-flex items-center justify-center px-6 py-3 bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Historical Seasons
              </button>
              
              {seasonId && (
                <button
                  onClick={async () => {
                    if (!confirm('Are you sure you want to clean up all data for this failed import? This will delete teams, players, stats, awards, and trophies associated with this season.')) {
                      return;
                    }
                    
                    setIsCleaningUp(true);
                    try {
                      const response = await fetchWithTokenRefresh(`/api/seasons/historical/${seasonId}/cleanup`, {
                        method: 'DELETE',
                      });
                      
                      const result = await response.json();
                      
                      if (result.success) {
                        alert(`Cleanup successful!\n\nDeleted:\n- ${result.deleted.team_trophies} team trophies\n- ${result.deleted.player_awards} player awards\n- ${result.deleted.teamstats} team stats\n- ${result.deleted.realplayerstats} player stats\n\nYou can now retry the import.`);
                        router.push('/dashboard/superadmin/historical-seasons/import');
                      } else {
                        alert(`Cleanup failed: ${result.error}`);
                      }
                    } catch (error: any) {
                      alert(`Error during cleanup: ${error.message}`);
                    } finally {
                      setIsCleaningUp(false);
                    }
                  }}
                  disabled={isCleaningUp}
                  className="inline-flex items-center justify-center px-6 py-3 bg-red-600 hover:bg-red-700 disabled:bg-red-400 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  {isCleaningUp ? (
                    <>
                      <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                      </svg>
                      Cleaning Up...
                    </>
                  ) : (
                    <>
                      <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                      Clean Up & Retry
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}
      </div>
  );
}

export default function HistoricalSeasonImportProgress() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center pt-32">
          <div className="text-center space-y-4">
            <div className="relative w-16 h-16 mx-auto">
              <div className="absolute inset-0 rounded-full border-t-2 border-amber-500 animate-spin" />
              <div className="absolute inset-2 rounded-full border-b-2 border-amber-300 animate-spin animate-reverse" />
            </div>
            <p className="text-slate-550 font-mono text-xs tracking-widest uppercase animate-pulse">Initializing progress stream...</p>
          </div>
        </div>
      }
    >
      <ImportProgressContent />
    </Suspense>
  );
}
