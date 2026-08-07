'use client';

import { useState, useEffect } from 'react';
import { useTournamentContext } from '@/contexts/TournamentContext';
import { AlertTriangle, Plus, CalendarClock, Link as LinkIcon, Save } from 'lucide-react';
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

export default function WindowsManagementPage() {
  const { seasonId: selectedSeason } = useTournamentContext();
  const { isCommitteeAdmin } = usePermissions();
  
  const [windows, setWindows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // New window form state
  const [isCreating, setIsCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'release' | 'swap'>('release');
  const [newMaxRequests, setNewMaxRequests] = useState<number>(0);
  const [newLinkedId, setNewLinkedId] = useState<string>('none');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchWindows();
  }, [selectedSeason]);

  const fetchWindows = async () => {
    if (!selectedSeason) return;
    
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/windows?season_id=${selectedSeason}`);
      const data = await response.json();
      
      if (data.success) {
        setWindows(data.data || []);
      } else {
        throw new Error(data.error);
      }
    } catch (error: any) {
      console.error('Error fetching windows:', error);
      setError('Failed to fetch windows');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (id: number, currentStatus: string) => {
    try {
      const newStatus = currentStatus === 'open' ? 'closed' : 'open';
      const response = await fetch(`/api/admin/windows/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      
      const result = await response.json();
      if (result.success) {
        setWindows(windows.map(w => w.id === id ? { ...w, status: newStatus } : w));
      } else {
        alert(result.error || 'Failed to update window status');
      }
    } catch (err) {
      console.error('Toggle error:', err);
      alert('An error occurred');
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSeason || !newName.trim()) return;

    setSubmitting(true);
    try {
      const response = await fetch('/api/admin/windows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          season_id: selectedSeason,
          name: newName,
          type: newType,
          status: 'closed', // Always create closed
          max_requests: newMaxRequests,
          linked_window_id: newLinkedId === 'none' ? null : newLinkedId
        })
      });
      
      const result = await response.json();
      if (result.success) {
        setWindows([result.data, ...windows]);
        setIsCreating(false);
        setNewName('');
        setNewMaxRequests(0);
        setNewLinkedId('none');
      } else {
        alert(result.error || 'Failed to create window');
      }
    } catch (err) {
      console.error('Create error:', err);
      alert('An error occurred');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isCommitteeAdmin) return (
    <div className="console-bg min-h-screen flex items-center justify-center font-mono relative">
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
      <div className="text-center relative z-10">
        <h1 className="text-xl font-black text-rose-600 uppercase tracking-widest">Access Denied</h1>
        <p className="mt-2 text-xs text-slate-500 font-bold uppercase tracking-wider">Committee credentials required</p>
      </div>
    </div>
  );

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Back Link */}
        <Link
          href="/dashboard/committee/requests"
          className="px-3 py-1.5 bg-white border border-slate-200/60 rounded-xl shadow-sm hover:border-amber-400/40 hover:text-amber-600 transition-all font-mono text-xs uppercase tracking-wider font-extrabold flex items-center justify-center w-fit mb-4"
        >
          <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Requests
        </Link>

        {/* Header Title Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-5 sm:p-6 shadow-sm font-mono relative overflow-hidden">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-gradient-to-br from-amber-500 to-amber-600 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/10 flex-shrink-0">
                <CalendarClock className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold uppercase tracking-wider text-slate-800">
                  Transfer Windows
                </h1>
                <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
                  Manage open/close periods and set request limits for teams
                </p>
              </div>
            </div>
            
            <div>
              <button 
                onClick={() => setIsCreating(!isCreating)} 
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-amber-400 border border-slate-900 shadow-md rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer"
              >
                {isCreating ? 'Cancel' : <><Plus className="w-4 h-4" /> New Window</>}
              </button>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2 font-bold uppercase tracking-wider">
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {/* Create Form */}
        {isCreating && (
          <Card className="border-slate-200 bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm relative overflow-hidden">
            <CardHeader className="border-b border-slate-100 pb-4 mb-4">
              <CardTitle className="text-slate-800 uppercase tracking-wider text-sm font-black">Create New Transfer Window</CardTitle>
              <CardDescription className="text-[10px] text-slate-500 font-bold uppercase mt-1">Windows are created in a 'Closed' state by default.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleCreate} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Window Name</label>
                    <input 
                      type="text"
                      className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                      placeholder="e.g. Mid-Season Releases" 
                      value={newName} 
                      onChange={e => setNewName(e.target.value)} 
                      required 
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Type</label>
                    <select 
                      className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      value={newType}
                      onChange={(e: any) => setNewType(e.target.value)}
                    >
                      <option value="release">Release Window</option>
                      <option value="swap">Swap Window</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">Max Requests Allowed Per Team</label>
                    <input 
                      type="number" 
                      min="0" 
                      className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 disabled:cursor-not-allowed disabled:opacity-50"
                      value={newMaxRequests} 
                      onChange={e => setNewMaxRequests(parseInt(e.target.value) || 0)} 
                    />
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Set to 0 for unlimited requests.</p>
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      <LinkIcon className="w-3 h-3 text-slate-400" /> Shared Limit Group (Optional)
                    </label>
                    <select 
                      className="flex h-10 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      value={newLinkedId}
                      onChange={e => setNewLinkedId(e.target.value)}
                    >
                      <option value="none">-- Standalone Window (Isolated Limit) --</option>
                      {windows.filter(w => w.type === newType).map(w => (
                        <option key={w.id} value={w.id.toString()}>Link to: {w.name} (ID: {w.id})</option>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">If linked, teams share request count across both windows.</p>
                  </div>
                </div>

                <div className="flex justify-end pt-2">
                  <button 
                    type="submit" 
                    disabled={submitting || !newName.trim()} 
                    className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-bold text-xs uppercase tracking-wider flex items-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" /> Save Window
                  </button>
                </div>
              </form>
            </CardContent>
          </Card>
        )}

        {/* Windows List */}
        {loading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin w-8 h-8 border-4 border-amber-500 border-t-transparent rounded-full"></div>
          </div>
        ) : windows.length === 0 ? (
          <div className="bg-slate-50 border border-dashed rounded-2xl p-12 text-center text-slate-400 text-xs font-bold uppercase tracking-wider">
            No transfer windows found for this season.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {windows.map((w) => (
              <Card 
                key={w.id} 
                className={w.status === 'open' 
                  ? 'border-emerald-250 bg-emerald-50/5 shadow-md ring-1 ring-emerald-100' 
                  : 'opacity-90 bg-white border-slate-200'
                }
              >
                <CardHeader className="pb-3 border-b border-slate-100/60 mb-3">
                  <div className="flex justify-between items-start">
                    <div>
                      <Badge variant="outline" className={`mb-2 uppercase text-[9px] font-black font-mono tracking-wider ${
                        w.type === 'release' 
                          ? 'text-rose-650 bg-rose-50 border-rose-100' 
                          : 'text-indigo-650 bg-indigo-50 border-indigo-100'
                      }`}>
                        {w.type} Window
                      </Badge>
                      <CardTitle className="text-base font-extrabold text-slate-800 uppercase truncate max-w-[200px]" title={w.name}>{w.name}</CardTitle>
                    </div>
                    <div className="flex flex-col items-end flex-shrink-0">
                      <span className="text-[9px] font-bold text-slate-400 font-mono mb-1">ID: #{w.id}</span>
                      <Badge className={w.status === 'open' 
                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white text-[9px] font-black uppercase tracking-wider font-mono' 
                        : 'bg-slate-400 text-white text-[9px] font-black uppercase tracking-wider font-mono'
                      }>
                        {w.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="bg-slate-50/80 p-3 rounded-xl border border-slate-150 text-xs space-y-2 font-mono">
                    <div className="flex justify-between items-center">
                      <span className="text-slate-500 font-bold uppercase text-[10px]">Limit Per Team:</span>
                      <span className="font-extrabold text-slate-700">{w.max_requests === 0 ? 'Unlimited' : `${w.max_requests} requests`}</span>
                    </div>
                    
                    {w.linked_window_id && (
                      <div className="flex justify-between items-center pt-2 border-t border-slate-150">
                        <span className="text-slate-500 font-bold uppercase text-[10px] flex items-center gap-1">
                          <LinkIcon className="w-3 h-3" /> Linked To:
                        </span>
                        <span className="font-bold text-[10px] bg-slate-200 text-slate-700 px-2 py-0.5 rounded border">
                          Window #{w.linked_window_id}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Status Toggle</span>
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${w.status === 'closed' ? 'text-slate-800' : 'text-slate-400'}`}>Closed</span>
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(w.id, w.status)}
                        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-amber-500 ${
                          w.status === 'open' ? 'bg-emerald-500' : 'bg-slate-200'
                        }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                            w.status === 'open' ? 'translate-x-5' : 'translate-x-0'
                          }`}
                        />
                      </button>
                      <span className={`text-[10px] font-bold uppercase tracking-wider ${w.status === 'open' ? 'text-emerald-600' : 'text-slate-400'}`}>Open</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
