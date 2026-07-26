'use client';

import { useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  KeyRound,
  Search,
  RefreshCw,
  Send,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  Info,
  ShieldCheck,
  Loader2,
} from 'lucide-react';

type Tab = 'request' | 'status';
type RequestStatus = 'pending' | 'approved' | 'rejected' | 'completed' | 'expired';

interface StatusResult {
  found: boolean;
  status?: RequestStatus;
  username?: string;
  requestedAt?: string;
  reviewedAt?: string;
  adminNotes?: string;
  token?: string | null;
  expiresAt?: string | null;
  message?: string;
}

function formatDate(iso?: string | null) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const STATUS_CONFIG: Record<RequestStatus, { label: string; icon: React.ElementType; bg: string; text: string; border: string; desc: string }> = {
  pending: {
    label: 'Pending Review',
    icon: Clock,
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    desc: 'Your request is awaiting review by the super admin. Please check back later.',
  },
  approved: {
    label: 'Approved!',
    icon: CheckCircle2,
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    desc: 'Your request has been approved. Set your new password below.',
  },
  rejected: {
    label: 'Rejected',
    icon: XCircle,
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    desc: 'Your request was rejected by the admin. Check the notes below, or submit a new request.',
  },
  completed: {
    label: 'Completed',
    icon: ShieldCheck,
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    desc: 'Your password was already reset successfully using this request.',
  },
  expired: {
    label: 'Approval Expired',
    icon: Clock,
    bg: 'bg-slate-50',
    text: 'text-slate-600',
    border: 'border-slate-200',
    desc: 'The admin approval has expired. Please submit a new reset request.',
  },
};

export default function ResetPasswordRequest() {
  // ── Tab ─────────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<Tab>('request');

  // ── Submit Request Tab ────────────────────────────────────────────────────
  const [reqUsername, setReqUsername] = useState('');
  const [reqReason, setReqReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // ── Check Status Tab ──────────────────────────────────────────────────────
  const [checkUsername, setCheckUsername] = useState('');
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);
  const [statusResult, setStatusResult] = useState<StatusResult | null>(null);

  // ── Password Change (when approved) ──────────────────────────────────────
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // ── Submit request ────────────────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reqUsername.trim()) { setSubmitError('Username is required'); return; }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/auth/request-password-reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: reqUsername.trim(), reason: reqReason.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to submit request');
      setSubmitSuccess(true);
      // Pre-fill check tab with the same username
      setCheckUsername(reqUsername.trim());
    } catch (err: any) {
      setSubmitError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // ── Check status ──────────────────────────────────────────────────────────
  const handleCheck = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!checkUsername.trim()) { setCheckError('Username is required'); return; }
    setChecking(true);
    setCheckError(null);
    setStatusResult(null);
    setResetSuccess(false);
    setResetError(null);
    try {
      const res = await fetch(`/api/auth/check-reset-status?username=${encodeURIComponent(checkUsername.trim())}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.error);
      setStatusResult(data);
    } catch (err: any) {
      setCheckError(err.message);
    } finally {
      setChecking(false);
    }
  };

  // ── Set new password ──────────────────────────────────────────────────────
  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!statusResult?.token) return;
    if (newPassword.length < 6) { setResetError('Password must be at least 6 characters'); return; }
    if (newPassword !== confirmPassword) { setResetError('Passwords do not match'); return; }
    setResetting(true);
    setResetError(null);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: statusResult.token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || 'Failed to reset password');
      setResetSuccess(true);
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setResetError(err.message);
    } finally {
      setResetting(false);
    }
  };

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="console-bg min-h-screen flex items-center justify-center px-4 pt-5 lg:pt-24 pb-12 sm:px-6 lg:px-8 relative">
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-md w-full relative z-10 space-y-4">

        {/* Header */}
        <div className="text-center mb-2">
          <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">ACCOUNT RECOVERY</span>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight mt-0.5">Password Reset</h1>
          <p className="text-xs text-slate-500 font-mono mt-1 uppercase">Request a reset · Check your approval status</p>
        </div>

        {/* Tab switcher */}
        <div className="flex bg-white border border-slate-200 rounded-2xl p-1 shadow-sm">
          {([
            { key: 'request', label: 'Submit Request', icon: Send },
            { key: 'status',  label: 'Check Status',   icon: Search },
          ] as const).map(t => {
            const Icon = t.icon;
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl text-xs font-mono font-bold uppercase tracking-wide transition-all ${
                  tab === t.key
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* ── TAB: SUBMIT REQUEST ─────────────────────────────────────────────── */}
        {tab === 'request' && (
          <div className="console-card bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm animate-fade-in space-y-5">

            {submitSuccess ? (
              /* Success state */
              <div className="text-center space-y-5">
                <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-emerald-50 border border-emerald-200">
                  <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                </div>
                <div>
                  <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">STATUS: SUBMITTED</span>
                  <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">Request Submitted!</h2>
                  <p className="text-xs text-slate-500 font-sans mt-2 leading-relaxed">
                    Your request is pending admin review. Switch to the <strong>"Check Status"</strong> tab to monitor approval and set your new password once approved — no link needed.
                  </p>
                </div>
                <button
                  onClick={() => setTab('status')}
                  className="w-full py-3 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-mono font-bold text-xs uppercase flex items-center justify-center gap-2 transition-all"
                >
                  Check Status Now <ArrowRight className="w-4 h-4" />
                </button>
                <button
                  onClick={() => { setSubmitSuccess(false); setReqUsername(''); setReqReason(''); setSubmitError(null); }}
                  className="w-full py-2.5 rounded-xl border border-slate-200 text-slate-600 text-xs font-mono font-semibold hover:bg-slate-50 transition-all"
                >
                  Submit Another Request
                </button>
              </div>
            ) : (
              <>
                {/* Info */}
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl flex items-start gap-3">
                  <Info className="w-4 h-4 flex-shrink-0 text-slate-400 mt-0.5" />
                  <p className="text-xs text-slate-500 font-sans leading-normal">
                    Once submitted, come back to the <strong>Check Status</strong> tab to see when your request is approved and set your new password directly — no link required.
                  </p>
                </div>

                {/* Error */}
                {submitError && (
                  <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
                    <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs font-mono font-bold text-rose-800">{submitError}</p>
                  </div>
                )}

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label htmlFor="req-username" className="block text-[10px] font-mono font-bold text-slate-450 uppercase tracking-wider mb-1.5">
                      Username *
                    </label>
                    <input
                      id="req-username"
                      type="text"
                      value={reqUsername}
                      onChange={e => setReqUsername(e.target.value)}
                      required
                      disabled={submitting}
                      placeholder="Enter your username"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-1 focus:ring-amber-500 focus:outline-none bg-slate-50 focus:bg-white transition-all text-sm font-mono text-slate-700 placeholder:text-slate-400 shadow-sm"
                    />
                  </div>

                  <div>
                    <label htmlFor="req-reason" className="block text-[10px] font-mono font-bold text-slate-450 uppercase tracking-wider mb-1.5">
                      Reason (Optional)
                    </label>
                    <textarea
                      id="req-reason"
                      rows={3}
                      value={reqReason}
                      onChange={e => setReqReason(e.target.value)}
                      disabled={submitting}
                      placeholder="Briefly explain why you need a password reset…"
                      className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-1 focus:ring-amber-500 focus:outline-none bg-slate-50 focus:bg-white transition-all text-sm font-mono text-slate-700 placeholder:text-slate-400 shadow-sm resize-none"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={submitting}
                    className="w-full py-3.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-mono font-bold text-xs uppercase flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                  >
                    {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting…</> : <><Send className="w-4 h-4" /> Submit Request</>}
                  </button>

                  <div className="text-center">
                    <Link href="/login" className="text-xs font-mono font-bold text-amber-600 hover:text-amber-700 uppercase tracking-wide">
                      Remember password? Sign in
                    </Link>
                  </div>
                </form>
              </>
            )}
          </div>
        )}

        {/* ── TAB: CHECK STATUS ───────────────────────────────────────────────── */}
        {tab === 'status' && (
          <div className="console-card bg-white p-8 rounded-3xl border border-slate-200/60 shadow-sm animate-fade-in space-y-5">

            {/* Search form */}
            <form onSubmit={handleCheck} className="space-y-3">
              <div>
                <label htmlFor="check-username" className="block text-[10px] font-mono font-bold text-slate-450 uppercase tracking-wider mb-1.5">
                  Your Username
                </label>
                <div className="flex gap-2">
                  <input
                    id="check-username"
                    type="text"
                    value={checkUsername}
                    onChange={e => setCheckUsername(e.target.value)}
                    disabled={checking}
                    placeholder="Enter your username"
                    className="flex-1 px-4 py-3 border border-slate-200 rounded-xl focus:ring-1 focus:ring-amber-500 focus:outline-none bg-slate-50 focus:bg-white transition-all text-sm font-mono text-slate-700 placeholder:text-slate-400 shadow-sm"
                  />
                  <button
                    type="submit"
                    disabled={checking}
                    className="px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-mono text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    Check
                  </button>
                </div>
              </div>
            </form>

            {/* Check error */}
            {checkError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                <p className="text-xs font-mono font-bold text-rose-800">{checkError}</p>
              </div>
            )}

            {/* No request found */}
            {statusResult && !statusResult.found && (
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-2xl text-center space-y-2">
                <KeyRound className="w-8 h-8 text-slate-300 mx-auto" />
                <p className="text-sm font-bold text-slate-600">No request found</p>
                <p className="text-xs text-slate-400 font-mono">No password reset request exists for this username. Submit one on the <strong>Request</strong> tab.</p>
              </div>
            )}

            {/* Status result */}
            {statusResult?.found && statusResult.status && (() => {
              const cfg = STATUS_CONFIG[statusResult.status];
              const Icon = cfg.icon;
              return (
                <div className="space-y-4 animate-fade-in">
                  {/* Status badge */}
                  <div className={`p-4 ${cfg.bg} border ${cfg.border} rounded-2xl`}>
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-xl ${cfg.bg} border ${cfg.border}`}>
                        <Icon className={`w-5 h-5 ${cfg.text}`} />
                      </div>
                      <div>
                        <p className={`text-sm font-extrabold ${cfg.text} font-mono uppercase tracking-wide`}>{cfg.label}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{cfg.desc}</p>
                      </div>
                    </div>

                    {/* Timestamps */}
                    <div className="mt-3 pt-3 border-t border-current/10 grid grid-cols-2 gap-3 text-xs font-mono">
                      <div>
                        <p className="text-slate-400 uppercase tracking-wider text-[10px]">Requested</p>
                        <p className="text-slate-600 font-semibold">{formatDate(statusResult.requestedAt)}</p>
                      </div>
                      {statusResult.reviewedAt && (
                        <div>
                          <p className="text-slate-400 uppercase tracking-wider text-[10px]">Reviewed</p>
                          <p className="text-slate-600 font-semibold">{formatDate(statusResult.reviewedAt)}</p>
                        </div>
                      )}
                    </div>

                    {/* Expiry (if approved) */}
                    {statusResult.expiresAt && statusResult.status === 'approved' && (
                      <div className="mt-2 text-xs font-mono text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        ⏱ Approval expires: <strong>{formatDate(statusResult.expiresAt)}</strong>
                      </div>
                    )}

                    {/* Admin notes */}
                    {statusResult.adminNotes && (
                      <div className="mt-3 p-3 bg-white/60 rounded-xl border border-current/10">
                        <p className="text-[10px] font-mono font-bold text-slate-400 uppercase tracking-wider mb-1">Admin Note</p>
                        <p className="text-xs text-slate-700 font-sans">{statusResult.adminNotes}</p>
                      </div>
                    )}
                  </div>

                  {/* ── PASSWORD FORM (only when approved + has token) ──────────── */}
                  {statusResult.status === 'approved' && statusResult.token && (
                    <div className="border-2 border-emerald-300 rounded-2xl overflow-hidden">
                      <div className="bg-emerald-50 px-4 py-3 border-b border-emerald-200 flex items-center gap-2">
                        <Lock className="w-4 h-4 text-emerald-600" />
                        <p className="text-sm font-bold text-emerald-800 font-mono">Set Your New Password</p>
                      </div>

                      {resetSuccess ? (
                        <div className="p-6 text-center space-y-3">
                          <ShieldCheck className="w-10 h-10 text-emerald-500 mx-auto" />
                          <p className="font-bold text-emerald-700 font-mono">Password Changed Successfully!</p>
                          <p className="text-xs text-slate-500">You can now sign in with your new password.</p>
                          <Link href="/login" className="inline-flex items-center gap-2 px-5 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-mono font-bold transition-all hover:bg-slate-800">
                            Go to Login <ArrowRight className="w-3.5 h-3.5" />
                          </Link>
                        </div>
                      ) : (
                        <form onSubmit={handlePasswordReset} className="p-5 space-y-4">
                          {resetError && (
                            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2">
                              <AlertTriangle className="w-4 h-4 text-rose-500 flex-shrink-0 mt-0.5" />
                              <p className="text-xs font-mono font-bold text-rose-800">{resetError}</p>
                            </div>
                          )}

                          <div>
                            <label htmlFor="new-password" className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                              New Password
                            </label>
                            <div className="relative">
                              <input
                                id="new-password"
                                type={showNew ? 'text' : 'password'}
                                value={newPassword}
                                onChange={e => setNewPassword(e.target.value)}
                                minLength={6}
                                required
                                placeholder="Minimum 6 characters"
                                className="w-full px-4 py-3 pr-10 border border-slate-200 rounded-xl focus:ring-1 focus:ring-emerald-500 focus:outline-none bg-slate-50 focus:bg-white transition-all text-sm font-mono text-slate-700 placeholder:text-slate-400"
                              />
                              <button type="button" onClick={() => setShowNew(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </div>

                          <div>
                            <label htmlFor="confirm-password" className="block text-[10px] font-mono font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                              Confirm Password
                            </label>
                            <div className="relative">
                              <input
                                id="confirm-password"
                                type={showConfirm ? 'text' : 'password'}
                                value={confirmPassword}
                                onChange={e => setConfirmPassword(e.target.value)}
                                minLength={6}
                                required
                                placeholder="Repeat your new password"
                                className={`w-full px-4 py-3 pr-10 border rounded-xl focus:ring-1 focus:outline-none bg-slate-50 focus:bg-white transition-all text-sm font-mono text-slate-700 placeholder:text-slate-400 ${
                                  confirmPassword && confirmPassword !== newPassword
                                    ? 'border-rose-300 focus:ring-rose-400'
                                    : 'border-slate-200 focus:ring-emerald-500'
                                }`}
                              />
                              <button type="button" onClick={() => setShowConfirm(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                            {confirmPassword && confirmPassword !== newPassword && (
                              <p className="text-xs text-rose-600 font-mono mt-1">Passwords don't match</p>
                            )}
                          </div>

                          <button
                            type="submit"
                            disabled={resetting || (!!confirmPassword && confirmPassword !== newPassword)}
                            className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold text-xs uppercase flex items-center justify-center gap-2 transition-all disabled:opacity-50"
                          >
                            {resetting ? <><Loader2 className="w-4 h-4 animate-spin" /> Changing Password…</> : <><Lock className="w-4 h-4" /> Change Password</>}
                          </button>
                        </form>
                      )}
                    </div>
                  )}

                  {/* Refresh + resubmit actions */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleCheck()}
                      disabled={checking}
                      className="flex-1 flex items-center justify-center gap-1.5 py-2.5 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-600 hover:bg-slate-50 transition-all"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${checking ? 'animate-spin' : ''}`} /> Refresh Status
                    </button>
                    {(statusResult.status === 'rejected' || statusResult.status === 'expired' || statusResult.status === 'completed') && (
                      <button
                        onClick={() => setTab('request')}
                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-amber-50 border border-amber-200 rounded-xl text-xs font-mono font-bold text-amber-700 hover:bg-amber-100 transition-all"
                      >
                        <Send className="w-3.5 h-3.5" /> New Request
                      </button>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Empty placeholder (before searching) */}
            {!statusResult && !checkError && !checking && (
              <div className="py-8 text-center space-y-2 text-slate-400">
                <Search className="w-8 h-8 mx-auto opacity-30" />
                <p className="text-xs font-mono">Enter your username above to check your request status</p>
              </div>
            )}

            <div className="text-center pt-1">
              <Link href="/login" className="text-xs font-mono font-bold text-amber-600 hover:text-amber-700 uppercase tracking-wide">
                Remember password? Sign in
              </Link>
            </div>
          </div>
        )}

      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in { animation: fadeIn 0.35s ease-out forwards; }
      ` }} />
    </div>
  );
}
