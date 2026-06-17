'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTournamentContext } from '@/contexts/TournamentContext';
import { ArrowRightLeft, UserMinus, Clock, CheckCircle2, XCircle, AlertCircle, CalendarClock } from 'lucide-react';
import Link from 'next/link';

// Custom UI Components replacing missing shadcn imports
const Card = ({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={`bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm ${className || ''}`} {...props}>
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

export default function RequestsOverviewPage() {
  const { user } = useAuth();
  const { seasonId: selectedSeason } = useTournamentContext();
  const [releaseRequests, setReleaseRequests] = useState<any[]>([]);
  const [swapRequests, setSwapRequests] = useState<any[]>([]);
  const [activeWindows, setActiveWindows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const teamId = user?.email;

  useEffect(() => {
    async function fetchData() {
      if (!teamId || !selectedSeason) return;
      
      setLoading(true);
      try {
        const [releaseRes, swapRes, windowsRes] = await Promise.all([
          fetch(`/api/requests/release?team_id=${teamId}&season_id=${selectedSeason}`),
          fetch(`/api/requests/swap?team_id=${teamId}&season_id=${selectedSeason}`),
          fetch(`/api/requests/windows?team_id=${teamId}&season_id=${selectedSeason}`)
        ]);
        
        if (releaseRes.ok) {
          const releaseData = await releaseRes.json();
          setReleaseRequests(releaseData.data || []);
        }
        
        if (swapRes.ok) {
          const swapData = await swapRes.json();
          setSwapRequests(swapData.data || []);
        }

        if (windowsRes.ok) {
          const windowsData = await windowsRes.json();
          setActiveWindows(windowsData.data || []);
        }
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
  }, [teamId, selectedSeason]);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge className="bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1 font-black uppercase text-[9px] px-2 py-0.5"><Clock className="w-2.5 h-2.5" /> Pending</Badge>;
      case 'approved':
        return <Badge className="bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1 font-black uppercase text-[9px] px-2 py-0.5"><CheckCircle2 className="w-2.5 h-2.5" /> Approved</Badge>;
      case 'rejected':
        return <Badge className="bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1 font-black uppercase text-[9px] px-2 py-0.5"><XCircle className="w-2.5 h-2.5" /> Rejected</Badge>;
      default:
        return <Badge className="bg-slate-50 text-slate-700 border border-slate-200 px-2 py-0.5 uppercase text-[9px] font-black">{status}</Badge>;
    }
  };

  if (!teamId) return <div className="p-8 text-center font-mono text-sm uppercase tracking-wider text-slate-500">Please log in to view requests.</div>;

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
              <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/10 flex-shrink-0">
                <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                </svg>
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-slate-800">
                  Roster Requests
                </h1>
                <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                  Manage your team's requested swaps and releases
                </p>
              </div>
            </div>
            
            <div className="flex gap-2">
              {activeWindows.filter(w => w.type === 'release' && !w.isLimitReached).length > 0 ? (
                <Link href="/dashboard/team/requests/release">
                  <button className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors flex items-center cursor-pointer">
                    <UserMinus className="w-4 h-4 mr-2" /> New Release
                  </button>
                </Link>
              ) : (
                <button disabled className="px-4 py-2.5 bg-slate-100 border border-slate-200 text-slate-400 rounded-xl font-bold text-xs uppercase tracking-wider cursor-not-allowed flex items-center">
                  <UserMinus className="w-4 h-4 mr-2" /> Release Closed
                </button>
              )}
              
              {activeWindows.filter(w => w.type === 'swap' && !w.isLimitReached).length > 0 ? (
                <Link href="/dashboard/team/requests/swap">
                  <button className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors flex items-center cursor-pointer">
                    <ArrowRightLeft className="w-4 h-4 mr-2" /> New Swap
                  </button>
                </Link>
              ) : (
                <button disabled className="px-4 py-2.5 bg-slate-100 border border-slate-200 text-slate-400 rounded-xl font-bold text-xs uppercase tracking-wider cursor-not-allowed flex items-center">
                  <ArrowRightLeft className="w-4 h-4 mr-2" /> Swap Closed
                </button>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full"></div>
          </div>
        ) : (
          <div className="space-y-6">
            
            {/* Active Windows Status */}
            {activeWindows.length > 0 && (
              <Card className="border-l-4 border-l-amber-500 bg-amber-50/10">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <CalendarClock className="w-5 h-5 text-amber-500" /> 
                    Active Transfer Windows
                  </CardTitle>
                  <CardDescription className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                    You can only submit requests during active windows. Pay attention to your request limits.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {activeWindows.map(w => (
                      <div key={w.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 shadow-sm flex flex-col justify-between">
                        <div>
                          <div className="flex justify-between items-start mb-2">
                            <span className="font-extrabold text-xs text-slate-700 uppercase tracking-wide">{w.name}</span>
                            <Badge className={`px-2 py-0.5 text-[9px] font-black uppercase rounded ${
                              w.type === 'release' ? 'text-red-750 bg-red-50 border border-red-200' : 'text-blue-755 bg-blue-50 border border-blue-200'
                            }`}>
                              {w.type}
                            </Badge>
                          </div>
                          <div className="text-[10px] text-slate-400 font-bold uppercase mt-4 mb-1">Request Limit</div>
                          {w.max_requests === 0 ? (
                            <div className="font-bold text-xs text-emerald-600 uppercase">Unlimited</div>
                          ) : (
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs font-bold text-slate-600">
                                <span>Used: {w.usage}</span>
                                <span>Remaining: {w.remaining}</span>
                              </div>
                              <div className="w-full bg-slate-200 rounded-full h-1.5">
                                <div 
                                  className={`h-1.5 rounded-full ${w.isLimitReached ? 'bg-red-500' : 'bg-emerald-500'}`} 
                                  style={{ width: `${Math.min(100, (w.usage / w.max_requests) * 100)}%` }}
                                ></div>
                              </div>
                              {w.isLimitReached && (
                                <p className="text-[10px] text-red-650 font-black uppercase mt-1">Limit Reached</p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Swap Requests */}
              <Card className="border-t-4 border-t-indigo-500">
                <CardHeader>
                  <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <ArrowRightLeft className="w-5 h-5 text-indigo-500" />
                    Swap Requests
                  </CardTitle>
                  <CardDescription className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                    Your requested trades with other teams
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {swapRequests.length === 0 ? (
                    <div className="text-center p-8 bg-slate-50 border border-dashed rounded-xl text-slate-400 text-xs uppercase tracking-wider font-bold">
                      No swap requests found for this season.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {swapRequests.map((req) => (
                        <div key={req.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3 relative hover:border-amber-400/40 hover:shadow-md transition-all">
                          <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                            <div className="text-[10px] font-bold text-slate-400 font-mono">
                              {new Date(req.submitted_at).toLocaleDateString()}
                            </div>
                            {getStatusBadge(req.status)}
                          </div>
                          
                          <div className="flex flex-col gap-2">
                            {req.players?.map((p: any) => (
                              <div key={p.id} className="flex justify-between items-center bg-white border border-slate-100 p-2.5 rounded-xl text-xs">
                                <span className="font-extrabold text-slate-700">{p.player_name}</span>
                                <div className="flex items-center gap-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded">
                                  <span>{p.from_team_id}</span>
                                  <ArrowRightLeft className="w-3 h-3 mx-1 text-slate-400" />
                                  <span>{p.to_team_id}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                          
                          {Number(req.cash_amount) > 0 && (
                            <div className="text-xs bg-indigo-50 border border-indigo-100 text-indigo-800 p-2.5 rounded-xl flex items-center gap-2 font-bold uppercase tracking-wider">
                              <AlertCircle className="w-4 h-4 text-indigo-600 flex-shrink-0" />
                              <span>
                                Cash transfer: <strong>${req.cash_amount}</strong> 
                                <span className="text-[9px] font-normal block mt-0.5">
                                  {req.cash_direction === 'A_to_B' ? 'Paying Out' : 'Receiving'}
                                </span>
                              </span>
                            </div>
                          )}
                          
                          {req.rejection_reason && (
                            <div className="text-xs bg-rose-50 border border-rose-100 text-rose-800 p-2.5 rounded-xl font-bold uppercase tracking-wider">
                              <strong className="text-rose-900 block text-[9px] mb-0.5">Rejection Reason:</strong> 
                              {req.rejection_reason}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Release Requests */}
              <Card className="border-t-4 border-t-rose-500">
                <CardHeader>
                  <CardTitle className="text-sm font-black text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <UserMinus className="w-5 h-5 text-rose-500" />
                    Release Requests
                  </CardTitle>
                  <CardDescription className="text-[10px] text-slate-500 font-bold uppercase mt-1">
                    Players you have requested to release to Free Agency
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {releaseRequests.length === 0 ? (
                    <div className="text-center p-8 bg-slate-50 border border-dashed rounded-xl text-slate-400 text-xs uppercase tracking-wider font-bold">
                      No release requests found for this season.
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {releaseRequests.map((req) => (
                        <div key={req.id} className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex flex-col gap-2 hover:border-amber-400/40 hover:shadow-md transition-all">
                          <div className="flex justify-between items-center pb-2 border-b border-slate-200/60">
                            <span className="font-extrabold text-sm text-slate-700">{req.player_name}</span>
                            {getStatusBadge(req.status)}
                          </div>
                          <div className="flex justify-between items-center text-xs mt-1">
                            <span className="text-[10px] font-bold text-slate-400 font-mono">
                              Submitted: {new Date(req.submitted_at).toLocaleDateString()}
                            </span>
                            <span className="font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded uppercase text-[10px]">
                              Refund: ${req.refund_amount}
                            </span>
                          </div>
                          {req.rejection_reason && (
                            <div className="text-xs bg-rose-50 border border-rose-100 text-rose-800 p-2.5 rounded-xl font-bold uppercase tracking-wider mt-2">
                              <strong className="text-rose-900 block text-[9px] mb-0.5">Rejection Reason:</strong> 
                              {req.rejection_reason}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
