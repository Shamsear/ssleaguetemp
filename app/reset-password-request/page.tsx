'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function ResetPasswordRequest() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!username.trim()) {
      setError('Username is required');
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      // Call API to create password reset request
      const response = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          username: username.trim(),
          reason: reason.trim() || undefined,
        }),
      });

      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit request');
      }

      setSuccess(true);
    } catch (error) {
      console.error('Error requesting password reset:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to submit request';
      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center px-4 pt-5 lg:pt-24 pb-12 sm:px-6 lg:px-8 relative">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>
        <div className="max-w-md w-full relative z-10">
          <div className="console-card bg-white rounded-3xl p-8 shadow-sm border border-slate-200/60 text-center space-y-6">
            <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-emerald-50 border border-emerald-250">
              <svg className="h-8 w-8 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">STATUS: SUBMITTED</span>
              <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">Request Submitted</h2>
              <p className="text-xs text-slate-500 font-sans mt-2 leading-relaxed">
                Your password reset request has been submitted successfully. A super admin will review your request and provide a password reset link if approved.
              </p>
            </div>
            <Link
              href="/login"
              className="group relative w-full py-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-mono font-bold text-xs uppercase transition-all duration-300 hover:shadow-md hover:shadow-amber-600/10 flex items-center justify-center gap-2 cursor-pointer"
            >
              Return to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen flex items-center justify-center px-4 pt-5 lg:pt-24 pb-12 sm:px-6 lg:px-8 relative">
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>
      
      <div className="max-w-md w-full relative z-10">
        <div className="console-card bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm transition-all duration-300 animate-fade-in space-y-6">
          <div className="text-center">
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">RECOVERY REQUEST</span>
            <h2 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              Request Reset
            </h2>
            <p className="text-xs text-slate-500 font-mono mt-1 uppercase">
              Submit a request to reset your password. A super admin will review and approve your request.
            </p>
          </div>

          {/* Info Alert */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-3">
            <svg className="w-5 h-5 flex-shrink-0 text-slate-400 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-[10px] font-mono font-bold text-slate-550 uppercase tracking-wider mb-0.5">Security Notice</p>
              <p className="text-xs text-slate-450 font-sans leading-normal">
                For security reasons, password resets require super admin approval. Once approved, you will receive a password reset link.
              </p>
            </div>
          </div>

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-250/60 rounded-2xl flex items-start gap-3 animate-fade-in">
              <span className="text-lg">⚠️</span>
              <div className="text-xs font-mono font-bold text-rose-800 uppercase tracking-wide">
                {error}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="username" className="block text-[10px] font-mono font-bold text-slate-450 uppercase tracking-wider mb-1.5">
                Username
              </label>
              <input
                type="text"
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={submitting}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-1 focus:ring-amber-500 focus:outline-none bg-slate-50 focus:bg-white transition-all duration-200 shadow-sm text-sm font-mono text-slate-700 placeholder:text-slate-405"
                placeholder="Enter your username"
              />
            </div>

            <div>
              <label htmlFor="reason" className="block text-[10px] font-mono font-bold text-slate-450 uppercase tracking-wider mb-1.5">
                Reason for Password Reset (Optional)
              </label>
              <textarea
                id="reason"
                rows={4}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                disabled={submitting}
                className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-1 focus:ring-amber-500 focus:outline-none bg-slate-50 focus:bg-white transition-all duration-200 shadow-sm text-sm font-mono text-slate-700 placeholder:text-slate-405 resize-none"
                placeholder="Please explain why you need to reset your password (e.g., forgot password, security concern, etc.)"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="group relative w-full py-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-mono font-bold text-xs uppercase transition-all duration-300 hover:shadow-md hover:shadow-amber-600/10 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
            >
              {submitting ? (
                <>
                  <svg className="animate-spin w-4 h-4 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Submitting Request...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  Submit Request
                </>
              )}
            </button>

            <div className="text-center pt-2">
              <Link
                href="/login"
                className="text-xs font-mono font-bold text-amber-600 hover:text-amber-700 uppercase tracking-wide transition-colors"
              >
                Remember password? Sign in
              </Link>
            </div>
          </form>
        </div>
      </div>
      
      <style jsx>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(15px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out forwards;
        }
      `}</style>
    </div>
  );
}
