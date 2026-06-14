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
  FileText, 
  ArrowLeft, 
  Clock, 
  CheckCircle2, 
  XCircle, 
  Shield 
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
    
    setFilteredRequests(filtered);
  }, [requests, filter]);

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
    alert('Link copied to clipboard!');
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
        return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
      case 'approved':
        return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
      case 'rejected':
        return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
      case 'completed':
        return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      default:
        return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  if (loading || loadingRequests) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-950 text-slate-100 animate-pulse">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-500 mx-auto"></div>
          <p className="mt-4 text-slate-400 font-mono text-sm">Loading requests...</p>
        </div>
      </div>
    );
  }

  if (!user || user.role !== 'super_admin') {
    return null;
  }

  return (
    <div className="min-h-screen py-6 sm:py-10 px-4 sm:px-6 bg-gradient-to-tr from-slate-900 via-slate-800 to-slate-950 text-slate-100 animate-fade-in">
      <div className="container mx-auto max-w-screen-2xl">
        
        {/* Page Header */}
        <header className="mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6 border-b border-white/10 pb-8">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard/superadmin')}
              className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 transition-all duration-300 hover:scale-105"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-3xl md:text-5xl font-black bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 bg-clip-text text-transparent mb-2">
                Password Requests
              </h1>
              <p className="text-slate-400 text-sm font-mono">
                Review and process account recovery requests
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={fetchRequests}
              className="flex items-center gap-2 px-4 py-2.5 bg-white/5 border border-white/10 hover:bg-white/10 rounded-xl text-xs font-semibold uppercase tracking-wider text-slate-300 transition-all duration-300"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </button>
          </div>
        </header>

        {/* Filter Tabs */}
        <div className="relative overflow-hidden rounded-2xl bg-white/5 border border-white/10 backdrop-blur-md p-4 mb-6 shadow-md">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wider uppercase transition-all ${
                filter === 'all'
                  ? 'bg-indigo-500 text-white shadow-lg shadow-indigo-500/25'
                  : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10'
              }`}
            >
              All ({requests.length})
            </button>
            <button
              onClick={() => setFilter('pending')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wider uppercase transition-all ${
                filter === 'pending'
                  ? 'bg-amber-500 text-white shadow-lg shadow-amber-500/25'
                  : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10'
              }`}
            >
              Pending ({requests.filter(r => r.status === 'pending').length})
            </button>
            <button
              onClick={() => setFilter('approved')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wider uppercase transition-all ${
                filter === 'approved'
                  ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/25'
                  : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10'
              }`}
            >
              Approved ({requests.filter(r => r.status === 'approved').length})
            </button>
            <button
              onClick={() => setFilter('rejected')}
              className={`px-4 py-2 rounded-xl text-xs font-semibold tracking-wider uppercase transition-all ${
                filter === 'rejected'
                  ? 'bg-rose-500 text-white shadow-lg shadow-rose-500/25'
                  : 'bg-white/5 text-slate-300 border border-white/10 hover:bg-white/10'
              }`}
            >
              Rejected ({requests.filter(r => r.status === 'rejected').length})
            </button>
          </div>
        </div>

        {/* Requests List */}
        <div className="relative overflow-hidden rounded-3xl bg-white/5 border border-white/10 backdrop-blur-md shadow-xl">
          {filteredRequests.length > 0 ? (
            <div className="divide-y divide-white/5">
              {filteredRequests.map((request) => (
                <div key={request.id} className="px-6 py-5 hover:bg-white/5 transition-all duration-200 group">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-indigo-500/10 border border-indigo-500/20 flex items-center justify-center shadow-inner">
                          <span className="text-indigo-400 font-black text-lg">
                            {request.username[0].toUpperCase()}
                          </span>
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-slate-200">{request.username}</h3>
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadge(request.status)}`}>
                            {request.status.toUpperCase()}
                          </span>
                        </div>
                      </div>

                      <div className="space-y-2 text-xs text-slate-400 font-mono">
                        <div className="flex items-center">
                          <Mail className="w-4 h-4 mr-2 text-slate-500" />
                          {request.userEmail}
                        </div>
                        {request.teamName && (
                          <div className="flex items-center">
                            <Shield className="w-4 h-4 mr-2 text-slate-500" />
                            Team: <span className="text-slate-300 font-semibold">{request.teamName}</span>
                          </div>
                        )}
                        <div className="flex items-center">
                          <Calendar className="w-4 h-4 mr-2 text-slate-500" />
                          Requested: {formatDate(request.requestedAt)}
                        </div>
                        {request.reason && (
                          <div className="mt-2 p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-xl">
                            <p className="text-xs text-slate-300"><strong className="text-indigo-400">Reason:</strong> {request.reason}</p>
                          </div>
                        )}
                        {request.adminNotes && (
                          <div className="mt-2 p-3 bg-white/5 border border-white/10 rounded-xl">
                            <p className="text-xs text-slate-300"><strong className="text-slate-400">Admin Notes:</strong> {request.adminNotes}</p>
                          </div>
                        )}
                        {request.resetLink && request.status === 'approved' && (
                          <div className="mt-2 p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-bold text-emerald-400">Reset Link Generated</p>
                              <button
                                onClick={() => {
                                  setGeneratedLink(request.resetLink!);
                                  setShowLinkModal(true);
                                }}
                                className="text-xs text-emerald-400 hover:text-emerald-300 underline font-semibold flex items-center gap-1"
                              >
                                <ExternalLink className="w-3.5 h-3.5" /> View Link
                              </button>
                            </div>
                            {request.resetLinkExpiresAt && (
                              <p className="text-[10px] text-slate-500 mt-1">
                                Expires: {formatDate(request.resetLinkExpiresAt)}
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex flex-wrap gap-2 md:opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                      {request.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleApprove(request.id)}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-xs font-bold rounded-xl text-white bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-600 hover:to-emerald-700 transition-all duration-200 shadow-md hover:shadow-xl transform hover:-translate-y-0.5"
                          >
                            <Check className="w-4 h-4 mr-1.5" />
                            Approve
                          </button>
                          <button
                            onClick={() => handleReject(request.id)}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-xs font-bold rounded-xl text-white bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-600 hover:to-rose-700 transition-all duration-200 shadow-md hover:shadow-xl transform hover:-translate-y-0.5"
                          >
                            <X className="w-4 h-4 mr-1.5" />
                            Reject
                          </button>
                        </>
                      )}
                      {request.status !== 'pending' && (
                        <button
                          onClick={() => handleDelete(request.id)}
                          className="inline-flex items-center px-4 py-2 border border-transparent text-xs font-bold rounded-xl text-white bg-gradient-to-r from-slate-600 to-slate-700 hover:from-slate-700 hover:to-slate-800 transition-all duration-200 shadow-md hover:shadow-xl transform hover:-translate-y-0.5"
                        >
                          <Trash2 className="w-4 h-4 mr-1.5" />
                          Delete
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-8 py-20 text-center animate-fade-in">
              <div className="w-20 h-20 mx-auto mb-6 rounded-3xl bg-white/5 border border-white/10 flex items-center justify-center animate-pulse">
                <KeyRound className="w-10 h-10 text-indigo-400" />
              </div>
              <h3 className="text-xl font-bold text-slate-200 mb-2">No Requests Found</h3>
              <p className="text-slate-400 text-xs font-sans">
                {filter === 'all' 
                  ? 'There are no password reset requests yet.'
                  : `There are no ${filter} password reset requests.`}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Reset Link Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in" onClick={() => setShowLinkModal(false)}>
          <div className="relative overflow-hidden rounded-3xl bg-slate-900 border border-white/10 p-6 max-w-2xl w-full shadow-2xl animate-fade-in" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5 pb-3 border-b border-white/5">
              <h3 className="text-xl font-black text-slate-200 flex items-center gap-2">
                <KeyRound className="w-5 h-5 text-indigo-400" /> Password Reset Link
              </h3>
              <button
                onClick={() => setShowLinkModal(false)}
                className="p-2.5 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 mb-5 text-xs text-amber-200 font-sans leading-relaxed">
              <strong>Important security notice:</strong> Copy and send this link to the user via a secure channel. The link will expire in 24 hours.
            </div>
            <div className="bg-white/5 p-4 rounded-2xl border border-white/10 mb-5 break-all font-mono text-xs text-slate-300 shadow-inner">
              {generatedLink}
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => copyToClipboard(generatedLink)}
                className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl transition-all duration-300 flex items-center justify-center font-bold text-sm shadow-lg shadow-indigo-600/25 transform hover:-translate-y-0.5"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy Link
              </button>
              <button
                onClick={() => setShowLinkModal(false)}
                className="px-4 py-3 bg-white/5 border border-white/10 text-slate-300 hover:bg-white/10 rounded-2xl transition-all duration-300 text-sm font-semibold"
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
