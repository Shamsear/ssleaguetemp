'use client';

import { useState, useEffect } from 'react';
import { useTournamentContext } from '@/contexts/TournamentContext';
import { AlertTriangle, Plus, CalendarClock, Link as LinkIcon, Save } from 'lucide-react';
import { usePermissions } from '@/hooks/usePermissions';
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

  if (!isCommitteeAdmin) return <div>Access denied.</div>;

  return (
    <div className="space-y-6 max-w-5xl mx-auto">
      <div className="flex justify-between items-center border-b pb-4">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <CalendarClock className="w-8 h-8 text-indigo-600" />
            Transfer Windows
          </h1>
          <p className="text-muted-foreground mt-1">Manage open/close periods and set request limits for teams.</p>
        </div>
        <div className="flex gap-2">
          <Link href="/dashboard/committee/requests">
            <Button variant="outline">View Requests</Button>
          </Link>
          <Button onClick={() => setIsCreating(!isCreating)} className="bg-indigo-600 hover:bg-indigo-700">
            {isCreating ? 'Cancel' : <><Plus className="w-4 h-4 mr-2" /> New Window</>}
          </Button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-5 h-5" />
          {error}
        </div>
      )}

      {/* Create Form */}
      {isCreating && (
        <Card className="border-indigo-200 bg-indigo-50/30">
          <CardHeader>
            <CardTitle className="text-indigo-900">Create New Transfer Window</CardTitle>
            <CardDescription>Windows are created in a 'Closed' state by default.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Window Name</label>
                  <input 
                    type="text"
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                    placeholder="e.g. Mid-Season Releases" 
                    value={newName} 
                    onChange={e => setNewName(e.target.value)} 
                    required 
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Type</label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
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
                  <label className="text-sm font-medium">Max Requests Allowed Per Team</label>
                  <input 
                    type="number" 
                    min="0" 
                    className="flex h-10 w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
                    value={newMaxRequests} 
                    onChange={e => setNewMaxRequests(parseInt(e.target.value) || 0)} 
                  />
                  <p className="text-xs text-muted-foreground">Set to 0 for unlimited requests.</p>
                </div>
                
                <div className="space-y-2">
                  <label className="text-sm font-medium flex items-center gap-1">
                    <LinkIcon className="w-3 h-3" /> Shared Limit Group (Optional)
                  </label>
                  <select 
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                    value={newLinkedId}
                    onChange={e => setNewLinkedId(e.target.value)}
                  >
                    <option value="none">-- Standalone Window (Isolated Limit) --</option>
                    {windows.filter(w => w.type === newType).map(w => (
                      <option key={w.id} value={w.id.toString()}>Link to: {w.name} (ID: {w.id})</option>
                    ))}
                  </select>
                  <p className="text-xs text-muted-foreground">If linked, teams share their request count pool across both windows.</p>
                </div>
              </div>

              <Button type="submit" disabled={submitting || !newName.trim()} className="mt-4">
                <Save className="w-4 h-4 mr-2" /> Save Window
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Windows List */}
      {loading ? (
        <div className="flex justify-center p-12">
          <div className="animate-spin w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full"></div>
        </div>
      ) : windows.length === 0 ? (
        <div className="bg-muted/30 border rounded-lg p-12 text-center text-muted-foreground">
          No transfer windows found for this season.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {windows.map((w) => (
            <Card key={w.id} className={w.status === 'open' ? 'border-green-300 shadow-md ring-1 ring-green-200' : 'opacity-80 grayscale-[20%]'}>
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <Badge variant="outline" className={`mb-2 uppercase text-[10px] ${w.type === 'release' ? 'text-red-600 bg-red-50' : 'text-blue-600 bg-blue-50'}`}>
                      {w.type} Window
                    </Badge>
                    <CardTitle className="text-lg">{w.name}</CardTitle>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[10px] font-mono text-muted-foreground mb-1">ID: {w.id}</span>
                    <Badge className={w.status === 'open' ? 'bg-green-500 hover:bg-green-600' : 'bg-slate-400'}>
                      {w.status.toUpperCase()}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-slate-50 p-3 rounded-lg border text-sm space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Limit Per Team:</span>
                    <span className="font-bold">{w.max_requests === 0 ? 'Unlimited' : `${w.max_requests} requests`}</span>
                  </div>
                  
                  {w.linked_window_id && (
                    <div className="flex justify-between items-center pt-2 border-t">
                      <span className="text-muted-foreground flex items-center gap-1">
                        <LinkIcon className="w-3 h-3" /> Linked To:
                      </span>
                      <span className="font-mono text-xs bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                        Window #{w.linked_window_id}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm font-medium">Status Toggle</span>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${w.status === 'closed' ? 'font-bold' : 'text-muted-foreground'}`}>Closed</span>
                    <button
                      type="button"
                      onClick={() => handleToggleStatus(w.id, w.status)}
                      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                        w.status === 'open' ? 'bg-indigo-600' : 'bg-slate-200'
                      }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                          w.status === 'open' ? 'translate-x-5' : 'translate-x-0'
                        }`}
                      />
                    </button>
                    <span className={`text-xs ${w.status === 'open' ? 'font-bold text-green-600' : 'text-muted-foreground'}`}>Open</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
