'use client';

import { useEffect, useState } from 'react';
import { X, Clock, AlertTriangle, RefreshCw, ClipboardList } from 'lucide-react';

interface TimelineEvent {
  id: string | number;
  type: string;
  action: string;
  user: string;
  user_id?: string;
  timestamp: string;
  icon: string;
  color: string;
  details: string;
  changes?: any;
  notes?: string;
}

interface FixtureTimelineProps {
  fixtureId: string;
  isOpen: boolean;
  onClose: () => void;
}

export default function FixtureTimeline({ fixtureId, isOpen, onClose }: FixtureTimelineProps) {
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [fixture, setFixture] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && fixtureId) {
      fetchTimeline();
    }
  }, [isOpen, fixtureId]);

  const fetchTimeline = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/fixtures/${fixtureId}/audit-log`);
      
      if (!response.ok) {
        throw new Error('Failed to fetch timeline');
      }

      const data = await response.json();
      setTimeline(data.timeline || []);
      setFixture(data.fixture);
    } catch (err: any) {
      console.error('Error fetching timeline:', err);
      setError(err.message || 'Failed to load timeline');
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  const getColorClasses = (color: string) => {
    switch (color) {
      case 'blue':
        return 'bg-blue-50 text-blue-700 border-blue-200/60 ring-blue-500/10';
      case 'green':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200/60 ring-emerald-500/10';
      case 'yellow':
        return 'bg-amber-50 text-amber-700 border-amber-200/60 ring-amber-500/10';
      case 'orange':
        return 'bg-orange-50 text-orange-700 border-orange-200/60 ring-orange-500/10';
      case 'red':
        return 'bg-rose-50 text-rose-700 border-rose-200/60 ring-rose-500/10';
      case 'purple':
        return 'bg-indigo-50 text-indigo-700 border-indigo-200/60 ring-indigo-500/10';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-250 ring-slate-500/10';
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-955/65 backdrop-blur-xs z-[9999] flex items-center justify-center p-4 transition-all duration-300 animate-in fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-hidden flex flex-col font-mono text-slate-800 animate-in fade-in-0 zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="border-b border-slate-100 px-6 py-5 flex justify-between items-start">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-gray-900 tracking-tight flex items-center gap-2">
              <Clock className="w-5 h-5 text-amber-500" /> Fixture Timeline
            </h2>
            {fixture && (
              <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mt-1 flex items-center gap-1.5">
                <span>{fixture.home_team}</span>
                <span className="text-slate-350">vs</span>
                <span>{fixture.away_team}</span>
                <span className="text-slate-300">•</span>
                <span className="bg-slate-50 border border-slate-200/50 px-2 py-0.5 rounded text-slate-650">Round {fixture.round_number}</span>
                <span className="bg-slate-50 border border-slate-200/50 px-2 py-0.5 rounded text-slate-650">Match {fixture.match_number}</span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-xl p-2 transition-all border border-transparent hover:border-slate-150 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-amber-500 mx-auto"></div>
                <p className="mt-4 text-xs text-slate-500 font-extrabold uppercase tracking-wider animate-pulse">Loading timeline...</p>
              </div>
            </div>
          ) : error ? (
            <div className="text-center py-16 max-w-md mx-auto">
              <div className="w-12 h-12 bg-rose-50 border border-rose-200 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <AlertTriangle className="w-6 h-6 text-rose-500" />
              </div>
              <h3 className="font-bold text-sm text-slate-800 mb-1">Loading Failed</h3>
              <p className="text-xs text-slate-550 mb-6 leading-relaxed">{error}</p>
              <button
                onClick={fetchTimeline}
                className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 mx-auto cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Try Again
              </button>
            </div>
          ) : timeline.length === 0 ? (
            <div className="text-center py-20 max-w-sm mx-auto">
              <div className="w-12 h-12 bg-slate-50 border border-slate-200/60 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <ClipboardList className="w-6 h-6 text-slate-400" />
              </div>
              <h3 className="font-bold text-sm text-slate-700 mb-1">No Activity</h3>
              <p className="text-xs text-slate-500 leading-relaxed">No timeline events have been logged for this fixture yet.</p>
            </div>
          ) : (
            <div className="relative pl-4 sm:pl-8">
              {/* Timeline line */}
              <div className="absolute left-10 sm:left-14 top-2 bottom-2 w-[1px] bg-slate-200"></div>

              {/* Timeline events */}
              <div className="space-y-6">
                {timeline.map((event) => (
                  <div key={event.id} className="relative pl-14 sm:pl-16">
                    
                    {/* Circle Dot with Icon */}
                    <div className={`absolute left-0 w-10 h-10 sm:w-12 sm:h-12 rounded-2xl border border-slate-250/30 ring-4 ring-white flex items-center justify-center text-lg sm:text-xl shadow-xs transition-all ${getColorClasses(event.color)}`}>
                      {event.icon}
                    </div>

                    {/* Event Card */}
                    <div className="bg-white border border-slate-200/70 rounded-2xl p-4 shadow-2xs hover:shadow-sm hover:border-slate-300 transition-all duration-200">
                      <div className="flex flex-col sm:flex-row justify-between items-start gap-2 mb-2.5">
                        <div>
                          <h3 className="font-extrabold text-slate-900 text-xs sm:text-sm uppercase tracking-tight">{event.action}</h3>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            by <span className="font-black text-slate-700">{event.user}</span>
                          </p>
                        </div>
                        <span className="text-[9px] font-bold text-slate-450 bg-slate-50 border border-slate-200/50 px-2.5 py-1 rounded-lg shrink-0">
                          {new Date(event.timestamp).toLocaleString()}
                        </span>
                      </div>

                      {event.details && (
                        <p className="text-xs text-slate-650 leading-relaxed bg-slate-50/75 border border-slate-100 rounded-xl p-3">
                          {event.details}
                        </p>
                      )}

                      {event.notes && (
                        <div className="mt-2.5 text-[10px] text-amber-700 bg-amber-50/50 border border-amber-200/50 p-2.5 rounded-xl flex items-start gap-1.5">
                          <span className="shrink-0 mt-0.5">⚠️</span>
                          <div>
                            <span className="font-extrabold uppercase tracking-wide">Note:</span> {event.notes}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50/60 px-6 py-4 border-t border-slate-100 flex justify-between items-center">
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            {timeline.length > 0 ? (
              <>
                Total: <span className="font-extrabold text-slate-700 bg-slate-100 px-2 py-0.5 rounded border border-slate-200/50">{timeline.length}</span> event{timeline.length !== 1 ? 's' : ''}
              </>
            ) : (
              'No events'
            )}
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 border border-slate-200 text-slate-700 font-bold text-xs uppercase tracking-wider rounded-xl transition-all cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
