'use client';
import { Users, Trophy, Activity, BarChart2 } from 'lucide-react';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import AuthGuard from '@/components/auth/AuthGuard';

export default function FantasyRecalculatePage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const startRecalculation = async () => {
    if (!confirm('Are you sure you want to recalculate all fantasy points? This will:\n\n1. Recalculate all player points\n2. Recalculate all passive team bonuses\n3. Update squad totals\n4. Update team totals and ranks\n\nThis may take a few minutes.')) {
      return;
    }

    setIsRecalculating(true);
    setProgress('Starting fantasy points recalculation...');
    setLogs([]);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetchWithTokenRefresh('/api/admin/fantasy/recalculate-all-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Recalculation failed');
      }

      const data = await response.json();
      setProgress('Fantasy points recalculation completed successfully!');
      setLogs(data.logs || []);
      setSuccess(true);
    } catch (err) {
      console.error('Recalculation error:', err);
      setError(err instanceof Error ? err.message : 'Failed to recalculate points');
      setProgress('Recalculation failed');
    } finally {
      setIsRecalculating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <AuthGuard requiredRole="committee_admin">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <div className="mb-6">
          <Link href="/dashboard/committee/fantasy" className="text-blue-600 hover:underline mb-2 inline-block">
            &larr; Back to Fantasy Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Recalculate Fantasy Points</h1>
          <p className="text-gray-600 mt-1">Recalculate fantasy points, multipliers, bonuses, and rankings</p>
        </div>

        {/* Warning Card */}
        <div className="bg-yellow-50 border-2 border-yellow-300 rounded-xl p-6 mb-6">
          <div className="flex items-start gap-3">
            <svg className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h3 className="font-bold text-yellow-900 mb-2">Fantasy Points Recalculation</h3>
              <ul className="text-sm text-yellow-800 space-y-1">
                <li>• Recalculates match performance fantasy points for drafted players</li>
                <li>• Applies captain (2x) and vice-captain (1.5x) multipliers</li>
                <li>• Recalculates team passive outcome bonuses</li>
                <li>• Updates fantasy leaderboards and team ranks</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Action Button */}
        <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-6 mb-6">
          <button
            onClick={startRecalculation}
            disabled={isRecalculating}
            className={`w-full py-4 px-6 rounded-xl font-bold text-lg transition-all ${
              isRecalculating
                ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl'
            }`}
          >
            {isRecalculating ? (
              <span className="flex items-center justify-center gap-3">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div>
                Recalculating Fantasy Points...
              </span>
            ) : (
              'Start Fantasy Points Recalculation'
            )}
          </button>
        </div>

        {/* Progress */}
        {progress && (
          <div className={`rounded-xl p-4 mb-6 ${
            success ? 'bg-green-50 border-2 border-green-300' :
            error ? 'bg-red-50 border-2 border-red-300' :
            'bg-blue-50 border-2 border-blue-300'
          }`}>
            <div className="flex items-center gap-3">
              {success ? (
                <svg className="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : error ? (
                <svg className="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
              )}
              <p className={`font-semibold ${
                success ? 'text-green-900' :
                error ? 'text-red-900' :
                'text-blue-900'
              }`}>
                {progress}
              </p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 mb-6">
            <p className="text-red-900 font-semibold mb-2">Error:</p>
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}

        {/* Logs */}
        {logs.length > 0 && (
          <div className="bg-gray-900 rounded-xl p-4 mb-6">
            <h3 className="text-white font-bold mb-3">Recalculation Log</h3>
            <div className="space-y-1 max-h-96 overflow-y-auto font-mono text-xs">
              {logs.map((log, idx) => (
                <div key={idx} className="text-green-400">{log}</div>
              ))}
            </div>
          </div>
        )}
      </div>
    </AuthGuard>
  );
}
