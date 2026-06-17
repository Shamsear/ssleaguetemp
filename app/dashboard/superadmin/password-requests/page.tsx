'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { 
  getAllPasswordResetRequests, 
  approveResetRequest, 
  rejectResetRequest,
  deleteResetRequest 
} from '@/lib/firebase/passwordResetRequests';
import { PasswordResetRequest } from '@/types/passwordResetRequest';
import { 
  KeyRound, 
  Mail, 
  Calendar, 
  Check, 
  X, 
  Trash2, 
  RefreshCw, 
  Copy, 
  ExternalLink, 
  ArrowLeft, 
  Clock, 
  Shield,
  Search,
  AlertCircle,
  CheckCircle,
  CopyCheck,
  UserX,
  FileText
} from 'lucide-react';

export default function PasswordRequestsManagement() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [requests, setRequests] = useState<PasswordResetRequest[]>([]);
  const [filteredRequests, setFilteredRequests] = useState<PasswordResetRequest[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
    if (!loading && user && user.role !== 'super_admin') {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  useEffect(() => {
    if (user && user.role === 'super_admin') {
      fetchRequests();
    }
  }, [user]);

  useEffect(() => {
    let filtered = requests;
    
    if (filter === 'pending') {
      filtered = requests.filter(r => r.status === 'pending');
    } else if (filter === 'approved') {
      filtered = requests.filter(r => r.status === 'approved');
    } else if (filter === 'rejected') {
      filtered = requests.filter(r => r.status === 'rejected');
    }

    if (searchQuery.trim() !== '') {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(r => 
        (r.username || '').toLowerCase().includes(q) || 
        (r.userEmail || '').toLowerCase().includes(q) ||
        (r.teamName || '').toLowerCase().includes(q) ||
        (r.reason || '').toLowerCase().includes(q)
      );
    }
    
    setFilteredRequests(filtered);
  }, [requests, filter, searchQuery]);

  const fetchRequests = async () => {
    try {
      setLoadingRequests(true);
      const allRequests = await getAllPasswordResetRequests();
      setRequests(allRequests);
    } catch (error) {
      console.error('Error fetching requests:', error);
      alert('Failed to load password reset requests');
    } finally {
      setLoadingRequests(false);
    }
  };

  const handleApprove = async (requestId: string) => {
    if (!user) return;
    
    const notes = prompt('Optional: Add notes for this approval');
    
    try {
      const resetLink = await approveResetRequest(requestId, {
        reviewedBy: user.uid,
        adminNotes: notes || undefined,
      });
      
      setGeneratedLink(resetLink);
      setCopiedLink(false);
      setShowLinkModal(true);
      await fetchRequests();
    } catch (error) {
      console.error('Error approving request:', error);
      alert('Failed to approve request: ' + (error instanceof Error ? error.message : 'Unknown error'));
    }
  };

  const handleReject = async (requestId: string) => {
    if (!user) return;
    
    const reason = prompt('Please provide a reason for rejection:');
    if (!reason) return;
    
    try {
      await rejectResetRequest(requestId, {
        reviewedBy: user.uid,
        adminNotes: reason,
      });
      
      alert('Request rejected successfully');
      await fetchRequests();
    } catch (error) {
      console.error('Error rejecting request:', error);
      alert('Failed to reject request');
    }
  };

  const handleDelete = async (requestId: string) => {
    if (!confirm('Are you sure you want to delete this request? This action cannot be undone.')) {
      return;
    }
    
    try {
      await deleteResetRequest(requestId);
      alert('Request deleted successfully');
      await fetchRequests();
    } catch (error) {
      console.error('Error deleting request:', error);
      alert('Failed to delete request');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const formatDate = (date: Date) => {
    return new Date(date).toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-amber-50 text-amber-700 border-amber-200/60';
      case 'approved':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/60';
      case 'rejected':
        return 'bg-rose-50 text-rose-700 border-rose-200/60';
      case 'completed':
        return 'bg-blue-50 text-blue-700 border-blue-200/60';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-200/60';
    }
  };

  if (loading || loadingRequests) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center relative font-mono text-slate-800">
        <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
        <div className="text-center relative z-10">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-550 uppercase tracking-wider font-extrabold font-mono">Fetching Recovery Logs...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="space-y-8 animate-fade-in font-mono">
      
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200/60">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/dashboard/superadmin')}
            className="p-3 rounded-2xl bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-500 hover:text-slate-850 transition-all flex-shrink-0 shadow-sm"
            title="Back to Dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-850 uppercase tracking-wider">
              Recovery Management
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-1">
              Audit, authorize, or deny password reset credentials requests from platform members.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchRequests}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-slate-200/60 hover:bg-slate-50 text-slate-700 text-xs font-mono font-semibold transition-all shadow-sm cursor-pointer"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </div>

      {/* Controls: Filter & Search */}
      <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-4 sm:p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {[
            { id: 'all', label: `All Requests (${requests.length})` },
            { id: 'pending', label: `Pending (${requests.filter(r => r.status === 'pending').length})` },
            { id: 'approved', label: `Approved (${requests.filter(r => r.status === 'approved').length})` },
            { id: 'rejected', label: `Rejected (${requests.filter(r => r.status === 'rejected').length})` }
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => setFilter(btn.id as any)}
              className={`px-4 py-2.5 rounded-xl text-xs font-mono font-bold uppercase tracking-wider transition-all border ${
                filter === btn.id
                  ? 'bg-slate-800 text-white border-slate-900 shadow-sm font-extrabold'
                  : 'bg-white hover:bg-slate-50 text-slate-700 border-slate-200/60'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>

        <div className="relative max-w-md w-full">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search request history details..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200/60 rounded-xl focus:border-amber-400/50 focus:outline-none focus:ring-1 focus:ring-amber-400/20 text-xs font-bold transition-all placeholder-slate-400"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-700 font-mono"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Requests List */}
      <div className="console-card bg-white border border-slate-200/60 shadow-sm rounded-3xl overflow-hidden">
        {filteredRequests.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {filteredRequests.map((request) => (
              <div 
                key={request.id} 
                className="p-6 hover:bg-slate-50/40 transition-all duration-200 group flex flex-col lg:flex-row lg:items-center justify-between gap-6"
              >
                <div className="flex-1 space-y-4">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 border border-slate-200/60 flex items-center justify-center flex-shrink-0 shadow-sm">
                      <span className="text-slate-755 font-extrabold text-lg font-mono">
                        {request.username?.[0]?.toUpperCase() || '?'}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-base font-bold text-slate-900">
                          {request.username}
                        </h3>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-mono font-bold border ${getStatusBadge(request.status)}`}>
                          {request.status.toUpperCase()}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-slate-500 font-mono">
                        <div className="flex items-center gap-1.5">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span>{request.userEmail}</span>
                        </div>

                        {request.teamName && (
                          <div className="flex items-center gap-1.5">
                            <Shield className="w-3.5 h-3.5 text-slate-400" />
                            <span>Team: <strong className="text-amber-600 font-semibold">{request.teamName}</strong></span>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5 text-slate-400" />
                          <span>Requested: {formatDate(request.requestedAt)}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Explanations / Notes */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-16">
                    {request.reason && (
                      <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-150">
                        <p className="text-slate-400 font-mono mb-1 uppercase tracking-wider text-[10px] font-bold">User Provided Reason</p>
                        <p className="text-xs text-slate-700 leading-relaxed font-sans">{request.reason}</p>
                      </div>
                    )}
                    {request.adminNotes && (
                      <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-150">
                        <p className="text-slate-400 font-mono mb-1 uppercase tracking-wider text-[10px] font-bold">Administrative Notes</p>
                        <p className="text-xs text-slate-700 leading-relaxed font-sans">{request.adminNotes}</p>
                      </div>
                    )}
                  </div>

                  {/* Link Generated Status */}
                  {request.resetLink && request.status === 'approved' && (
                    <div className="pl-16">
                      <div className="bg-emerald-50 border border-emerald-200/60 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-emerald-700 font-mono">AUTHORIZED RESET LINK ACTIVE</p>
                          {request.resetLinkExpiresAt && (
                            <p className="text-[10px] text-slate-500 font-mono">
                              Expires: {formatDate(request.resetLinkExpiresAt)}
                            </p>
                          )}
                        </div>
                        <button
                          onClick={() => {
                            setGeneratedLink(request.resetLink!);
                            setCopiedLink(false);
                            setShowLinkModal(true);
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 border border-emerald-800 text-white text-xs font-mono font-bold rounded-xl transition-all shadow-sm cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          View Credentials Link
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions (Always visible for clarity/accessibility) */}
                <div className="flex flex-wrap items-center gap-2 pl-16 lg:pl-0">
                  {request.status === 'pending' && (
                    <>
                      <button
                        onClick={() => handleApprove(request.id)}
                        className="inline-flex items-center gap-1 px-4 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-250 text-emerald-700 text-xs font-mono font-bold rounded-xl transition-all shadow-sm cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(request.id)}
                        className="inline-flex items-center gap-1 px-4 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-250 text-rose-700 text-xs font-mono font-bold rounded-xl transition-all shadow-sm cursor-pointer"
                      >
                        <UserX className="w-3.5 h-3.5" />
                        Reject
                      </button>
                    </>
                  )}
                  {request.status !== 'pending' && (
                    <button
                      onClick={() => handleDelete(request.id)}
                      className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-600 hover:bg-rose-100 hover:text-rose-700 transition-all cursor-pointer"
                      title="Delete Log Entry"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-8 py-20 text-center bg-slate-50/50">
            <div className="max-w-sm mx-auto space-y-4">
              <div className="w-16 h-16 mx-auto rounded-3xl bg-white border border-slate-200/60 flex items-center justify-center shadow-sm">
                <KeyRound className="w-8 h-8 text-slate-400" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">No requests found</h3>
                <p className="text-xs text-slate-500 font-mono mt-1 uppercase">
                  All recovery logs are up-to-date for the current selected filter.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Reset Link Modal */}
      {showLinkModal && (
        <div 
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" 
          onClick={() => setShowLinkModal(false)}
        >
          <div 
            className="relative overflow-hidden rounded-3xl bg-white border border-slate-200 p-6 max-w-2xl w-full shadow-2xl space-y-5" 
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center pb-3 border-b border-slate-200">
              <h3 className="text-base font-mono font-extrabold text-slate-800 flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-amber-500" /> Authorized Recovery Credentials
              </h3>
              <button
                onClick={() => setShowLinkModal(false)}
                className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500 hover:text-slate-800 transition-all cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="bg-amber-50 border border-amber-250 rounded-2xl p-4 text-xs text-amber-800 font-sans leading-relaxed flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div>
                <strong>Critical Security Warning:</strong> Copy and dispatch this link to the user via a private channel immediately. The token will invalidate in 24 hours.
              </div>
            </div>

            <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-2xl break-all font-mono text-xs text-amber-600 shadow-inner select-all font-bold">
              {generatedLink}
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={() => copyToClipboard(generatedLink)}
                className="flex-1 px-4 py-3 bg-slate-800 hover:bg-slate-900 border border-slate-950 text-white rounded-2xl transition-all flex items-center justify-center font-mono font-bold text-xs shadow-sm cursor-pointer"
              >
                {copiedLink ? (
                  <>
                    <CopyCheck className="w-4 h-4 mr-2" />
                    Copied Successfully!
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Reset URL
                  </>
                )}
              </button>
              <button
                onClick={() => setShowLinkModal(false)}
                className="px-5 py-3 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-2xl transition-all text-xs font-mono font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
