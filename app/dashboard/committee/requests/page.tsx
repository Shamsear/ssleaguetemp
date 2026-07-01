'use client';

import { useState, useEffect } from 'react';
import { useTournamentContext } from '@/contexts/TournamentContext';
import { ArrowRightLeft, UserMinus, Clock, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
import Link from 'next/link';

// Custom UI Components replacing missing shadcn imports
const Card = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm ${className || ''}`} {...props}>
    {children}
  </div>
);

const CardHeader = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`space-y-1.5 pb-4 ${className || ''}`} {...props}>
    {children}
  </div>
);

const CardTitle = ({ className, children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={`text-lg font-bold leading-none tracking-tight text-slate-900 flex items-center gap-2 ${className || ''}`} {...props}>
    {children}
  </h3>
);

const CardDescription = ({ className, children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => (
  <p className={`text-sm text-slate-500 ${className || ''}`} {...props}>
    {children}
  </p>
);

const CardContent = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`${className || ''}`} {...props}>
    {children}
  </div>
);

const CardFooter = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`flex items-center pt-4 ${className || ''}`} {...props}>
    {children}
  </div>
);

const Button = ({ className, children, variant, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: string }) => {
  const baseStyle = "inline-flex items-center justify-center rounded-lg text-sm font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400 disabled:opacity-50 disabled:pointer-events-none px-4 py-2";
  const variants: Record<string, string> = {
    default: "bg-slate-900 text-white hover:bg-slate-800",
    outline: "border border-slate-200 hover:bg-slate-100 text-slate-700",
    ghost: "hover:bg-slate-100 hover:text-slate-900 font-normal",
  };
  const currentVariant = variants[variant || 'default'] || variant || variants.default;
  return (
    <button className={`${baseStyle} ${currentVariant} ${className || ''}`} {...props}>
      {children}
    </button>
  );
};

const Badge = ({ className, children, variant, ...props }: React.HTMLAttributes<HTMLSpanElement> & { variant?: string }) => {
  const baseStyle = "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2";
  const variants: Record<string, string> = {
    default: "border-transparent bg-slate-900 text-white hover:bg-slate-800",
    outline: "text-slate-950 border-slate-200",
  };
  const currentVariant = variants[variant || 'default'] || variant || variants.default;
  return (
    <span className={`${baseStyle} ${currentVariant} ${className || ''}`} {...props}>
      {children}
    </span>
  );
};

export default function CommitteeRequestsPage() {
  const { seasonId: selectedSeason } = useTournamentContext();
  const { user } = usePermissions();
  
  const [releaseRequests, setReleaseRequests] = useState<any[]>([]);
  const [swapRequests, setSwapRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchRequests();
  }, [selectedSeason]);

  const fetchRequests = async () => {
    if (!selectedSeason) return;
    
    setLoading(true);
    try {
      const [releaseRes, swapRes] = await Promise.all([
        fetch(`/api/requests/release?season_id=${selectedSeason}`),
        fetch(`/api/requests/swap?season_id=${selectedSeason}`)
      ]);
      
      if (releaseRes.ok) {
        const releaseData = await releaseRes.json();
        setReleaseRequests(releaseData.data || []);
      }
      
      if (swapRes.ok) {
        const swapData = await swapRes.json();
        setSwapRequests(swapData.data || []);
      }
    } catch (error) {
      console.error('Error fetching requests:', error);
      setError('Failed to fetch pending requests');
    } finally {
      setLoading(false);
    }
  };

  const handleProcessRelease = async (id: number | string, status: 'approved' | 'rejected') => {
    if (!user) return;
    
    const reason = status === 'rejected' ? prompt('Enter reason for rejection:') : null;
    if (status === 'rejected' && reason === null) return; // cancelled prompt
    
    if (status === 'approved' && !confirm('Are you sure you want to approve this release? This will execute the player drop and refund immediately.')) {
      return;
    }

    setProcessingId(`release-${id}`);
    setError(null);
    
    try {
      const response = await fetch(`/api/requests/release/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          processed_by: user.uid,
          processed_by_name: user.username || user.email,
          rejection_reason: reason
        })
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || `Failed to ${status} request`);
      }
      
      // Remove from list or update status
      fetchRequests();
    } catch (err: any) {
      console.error('Process error:', err);
      setError(err.message || 'An error occurred during processing');
    } finally {
      setProcessingId(null);
    }
  };

  const handleProcessSwap = async (id: number | string, status: 'approved' | 'rejected') => {
    if (!user) return;
    
    const reason = status === 'rejected' ? prompt('Enter reason for rejection:') : null;
    if (status === 'rejected' && reason === null) return; // cancelled prompt
    
    if (status === 'approved' && !confirm('Are you sure you want to approve this swap? This will execute the player swap and budget transfers immediately.')) {
      return;
    }

    setProcessingId(`swap-${id}`);
    setError(null);
    
    try {
      const response = await fetch(`/api/requests/swap/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          processed_by: user.uid,
          processed_by_name: user.username || user.email,
          rejection_reason: reason
        })
      });
      
      const result = await response.json();
      
      if (!result.success) {
        throw new Error(result.error || `Failed to ${status} request`);
      }
      
      // Remove from list or update status
      fetchRequests();
    } catch (err: any) {
      console.error('Process error:', err);
      setError(err.message || 'An error occurred during processing');
    } finally {
      setProcessingId(null);
    }
  };

  if (!user) return <div className="p-8 text-center font-mono text-sm uppercase tracking-wider text-slate-500">Access denied.</div>;

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Back Link */}
        <Link
          href="/dashboard"
          className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center w-fit mb-4"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Dashboard
        </Link>

        {/* Header Title Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm font-mono relative overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-indigo-650 to-purple-650 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/10 flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-slate-800">
                  Roster Requests
                </h1>
                <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                  Approve or reject roster drops and player swaps
                </p>
              </div>
            </div>
            
            <div>
              <Link href="/dashboard/committee/requests/windows">
                <button className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-900 shadow-md rounded-xl font-bold text-xs uppercase tracking-wider flex items-center cursor-pointer">
                  Manage Windows
                </button>
              </Link>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2 font-bold uppercase tracking-wider">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Swap Requests */}
            <div>
              <h2 className="text-sm font-black text-slate-850 uppercase tracking-wider flex items-center gap-2 mb-4">
                <ArrowRightLeft className="w-5 h-5 text-indigo-500" /> 
                Swap Requests 
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border rounded-lg text-xs font-black font-mono">{swapRequests.length}</span>
              </h2>
              
              {swapRequests.length === 0 ? (
                <div className="bg-slate-50 border border-dashed rounded-xl p-8 text-center text-slate-400 text-xs uppercase tracking-wider font-bold">
                  No pending swap requests.
                </div>
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {swapRequests.map((req) => (
                    <Card key={req.id} className="border-t-4 border-t-indigo-500">
                      <CardHeader className="bg-slate-50/50 pb-3 flex flex-row justify-between items-center">
                        <div>
                          <CardTitle className="text-xs font-black text-indigo-900 uppercase">Trade Proposal</CardTitle>
                          <CardDescription className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                            {req.requesting_team_id} &harr; {req.target_team_id}
                          </CardDescription>
                        </div>
                        <div className="text-[10px] font-bold text-slate-400 font-mono">
                          {new Date(req.submitted_at).toLocaleDateString()}
                        </div>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-4">
                        {req.players?.map((p: any) => (
                          <div key={p.id} className="flex flex-col bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs">
                            <span className="font-extrabold text-sm text-slate-700 mb-1">{p.player_name}</span>
                            <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              <span className="bg-white px-2 py-0.5 rounded border border-slate-150">{p.from_team_id}</span>
                              <ArrowRightLeft className="w-3 h-3 text-slate-400" />
                              <span className="bg-white px-2 py-0.5 rounded border border-slate-150">{p.to_team_id}</span>
                            </div>
                          </div>
                        ))}
                        
                        {Number(req.cash_amount) > 0 && (
                          <div className="bg-emerald-50 text-emerald-800 p-3 rounded-xl border border-emerald-150 text-xs flex items-center justify-center font-bold uppercase tracking-wider">
                            <DollarSign className="w-4 h-4 mr-1 text-emerald-600" />
                            {req.cash_direction === 'A_to_B' 
                              ? `${req.requesting_team_id} pays ${req.target_team_id} $${req.cash_amount}`
                              : `${req.target_team_id} pays ${req.requesting_team_id} $${req.cash_amount}`}
                          </div>
                        )}
                      </CardContent>
                      <CardFooter className="flex justify-between border-t pt-4 bg-slate-50/30 gap-2">
                        <button 
                          onClick={() => handleProcessSwap(req.id, 'rejected')}
                          disabled={processingId !== null}
                          className="px-4 py-2 bg-white border border-slate-200 text-rose-600 hover:bg-rose-50 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer"
                        >
                          Reject
                        </button>
                        <button 
                          onClick={() => handleProcessSwap(req.id, 'approved')}
                          disabled={processingId !== null}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer"
                        >
                          {processingId === `swap-${req.id}` ? 'Processing...' : 'Approve & Execute'}
                        </button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </div>

            {/* Release Requests */}
            <div>
              <h2 className="text-sm font-black text-slate-850 uppercase tracking-wider flex items-center gap-2 mb-4">
                <UserMinus className="w-5 h-5 text-rose-500" /> 
                Release Requests
                <span className="px-2 py-0.5 bg-slate-100 text-slate-700 border rounded-lg text-xs font-black font-mono">{releaseRequests.length}</span>
              </h2>
              
              {releaseRequests.length === 0 ? (
                <div className="bg-slate-50 border border-dashed rounded-xl p-8 text-center text-slate-400 text-xs uppercase tracking-wider font-bold">
                  No pending release requests.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {releaseRequests.map((req) => (
                    <Card key={req.id} className="border-t-4 border-t-rose-500">
                      <CardHeader className="bg-slate-50/50 pb-3">
                        <CardTitle className="text-xs font-black text-rose-900 uppercase">{req.player_name}</CardTitle>
                        <CardDescription className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                          Requested by: {req.team_id}
                        </CardDescription>
                      </CardHeader>
                      <CardContent className="pt-4 space-y-2 text-xs">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold uppercase">Submitted:</span>
                          <span className="font-mono">{new Date(req.submitted_at).toLocaleDateString()}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-bold uppercase">Type:</span>
                          <span className="uppercase text-[9px] font-black bg-slate-200 px-2 py-0.5 rounded text-slate-700">{req.player_type}</span>
                        </div>
                        <div className="flex justify-between pt-2 border-t font-extrabold text-slate-700">
                          <span className="uppercase">Expected Refund:</span>
                          <span className="text-emerald-600">${req.refund_amount}</span>
                        </div>
                      </CardContent>
                      <CardFooter className="flex justify-between border-t pt-4 bg-slate-50/30 gap-2">
                        <button 
                          onClick={() => handleProcessRelease(req.id, 'rejected')}
                          disabled={processingId !== null}
                          className="px-4 py-2 bg-white border border-slate-200 text-rose-600 hover:bg-rose-50 rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer"
                        >
                          Reject
                        </button>
                        <button 
                          onClick={() => handleProcessRelease(req.id, 'approved')}
                          disabled={processingId !== null}
                          className="px-4 py-2 bg-indigo-650 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider cursor-pointer"
                        >
                          {processingId === `release-${req.id}` ? 'Processing...' : 'Approve'}
                        </button>
                      </CardFooter>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function DollarSign(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" x2="12" y1="2" y2="22" />
      <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  )
}
