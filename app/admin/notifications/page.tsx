'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import {
  ArrowLeft,
  Settings,
  Info,
  Layers,
  Send,
  CheckCircle,
  AlertCircle,
  Sparkles,
  HelpCircle,
  Globe,
  Calendar,
  MessageSquare,
  Users,
  Bell,
  Clock
} from 'lucide-react';


export default function AdminNotificationsPage() {
  const [notificationType, setNotificationType] = useState<'round_deadline' | 'lineup_deadline' | 'custom'>('custom');
  const [seasons, setSeasons] = useState<any[]>([]);
  const [rounds, setRounds] = useState<any[]>([]);
  const [fixtures, setFixtures] = useState<any[]>([]);
  
  const [selectedSeason, setSelectedSeason] = useState('');
  const [selectedRound, setSelectedRound] = useState('');
  const [selectedFixture, setSelectedFixture] = useState('');
  
  const [customTitle, setCustomTitle] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [targetType, setTargetType] = useState<'all' | 'season' | 'specific'>('all');
  
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);

  // Load seasons
  useEffect(() => {
    loadSeasons();
  }, []);

  // Load rounds when season changes
  useEffect(() => {
    if (selectedSeason) {
      loadRounds(selectedSeason);
    }
  }, [selectedSeason]);

  // Load fixtures when season changes
  useEffect(() => {
    if (selectedSeason) {
      loadFixtures(selectedSeason);
    }
  }, [selectedSeason]);

  const loadSeasons = async () => {
    try {
      const response = await fetchWithTokenRefresh('/api/seasons/list');
      if (response.ok) {
        const data = await response.json();
        setSeasons(data.data || []);
      }
    } catch (error) {
      console.error('Error loading seasons:', error);
    }
  };

  const loadRounds = async (seasonId: string) => {
    try {
      const response = await fetchWithTokenRefresh(`/api/rounds?season_id=${seasonId}&status=active`);
      if (response.ok) {
        const data = await response.json();
        setRounds(data.data || []);
      }
    } catch (error) {
      console.error('Error loading rounds:', error);
    }
  };

  const loadFixtures = async (seasonId: string) => {
    try {
      const response = await fetchWithTokenRefresh(`/api/fixtures/season?season_id=${seasonId}`);
      if (response.ok) {
        const data = await response.json();
        setFixtures(data.fixtures || []);
      }
    } catch (error) {
      console.error('Error loading fixtures:', error);
    }
  };

  const handleSend = async () => {
    setSending(true);
    setResult(null);

    try {
      const payload: any = {
        type: notificationType,
      };

      if (notificationType === 'round_deadline') {
        if (!selectedRound) {
          alert('Please select a round');
          setSending(false);
          return;
        }
        payload.roundId = selectedRound;
      } else if (notificationType === 'lineup_deadline') {
        if (!selectedFixture) {
          alert('Please select a fixture');
          setSending(false);
          return;
        }
        payload.fixtureId = selectedFixture;
      } else if (notificationType === 'custom') {
        if (!customTitle || !customBody) {
          alert('Please enter title and body');
          setSending(false);
          return;
        }
        payload.title = customTitle;
        payload.bodyText = customBody;
        payload.url = customUrl;
        payload.targetType = targetType;
        if (targetType === 'season' && selectedSeason) {
          payload.seasonId = selectedSeason;
        }
      }

      const response = await fetchWithTokenRefresh('/api/admin/send-manual-notification', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      setResult(data);

      if (data.success) {
        alert(`✅ Notification sent to ${data.sentCount} device(s)!`);
      } else {
        alert(`❌ Failed: ${data.error}`);
      }
    } catch (error: any) {
      console.error('Error sending notification:', error);
      alert('Failed to send notification: ' + error.message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6 font-mono">
      {/* Decorative glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-4xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation */}
        <div>
          <Link
            href="/dashboard/committee"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-mono font-bold text-xs uppercase tracking-wider shadow-sm transition-all cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Dashboard
          </Link>
        </div>

        {/* Header Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-slate-800 border border-slate-900 rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/5 flex-shrink-0">
              <Send className="w-6 h-6 text-amber-400 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">SYSTEM CONTROL</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Manual Notifications
              </h1>
              <p className="text-xs text-slate-550 font-mono mt-1">
                Send push notifications to devices for deadline reminders or announcements.
              </p>
            </div>
          </div>
        </div>

        {/* Settings Form / Main Content */}
        <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
          {/* Notification Type Selector */}
          <div className="mb-6">
            <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
              Notification Type
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setNotificationType('round_deadline')}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border font-mono text-xs uppercase tracking-wider font-bold transition-all duration-200 cursor-pointer ${
                  notificationType === 'round_deadline'
                    ? 'bg-slate-800 border-slate-900 text-white shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                <Calendar className="w-4 h-4" /> Round Deadline
              </button>
              <button
                type="button"
                onClick={() => setNotificationType('lineup_deadline')}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border font-mono text-xs uppercase tracking-wider font-bold transition-all duration-200 cursor-pointer ${
                  notificationType === 'lineup_deadline'
                    ? 'bg-slate-800 border-slate-900 text-white shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                <Clock className="w-4 h-4" /> Lineup Deadline
              </button>
              <button
                type="button"
                onClick={() => setNotificationType('custom')}
                className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl border font-mono text-xs uppercase tracking-wider font-bold transition-all duration-200 cursor-pointer ${
                  notificationType === 'custom'
                    ? 'bg-slate-800 border-slate-900 text-white shadow-sm'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                }`}
              >
                <MessageSquare className="w-4 h-4" /> Custom Notification
              </button>
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6">
            {/* Round Deadline Form */}
            {notificationType === 'round_deadline' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                    Season
                  </label>
                  <select
                    value={selectedSeason}
                    onChange={(e) => setSelectedSeason(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all duration-200"
                  >
                    <option value="">Select season...</option>
                    {seasons.map((season) => (
                      <option key={season.id} value={season.id}>
                        {season.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                    Active Round
                  </label>
                  <select
                    value={selectedRound}
                    onChange={(e) => setSelectedRound(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={!selectedSeason}
                  >
                    <option value="">Select round...</option>
                    {rounds.map((round) => (
                      <option key={round.id} value={round.id}>
                        Round #{round.round_number} {round.position ? `- ${round.position}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <Info className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    This will send a deadline reminder to all teams in the season showing time remaining.
                  </p>
                </div>
              </div>
            )}

            {/* Lineup Deadline Form */}
            {notificationType === 'lineup_deadline' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                    Season
                  </label>
                  <select
                    value={selectedSeason}
                    onChange={(e) => setSelectedSeason(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all duration-200"
                  >
                    <option value="">Select season...</option>
                    {seasons.map((season) => (
                      <option key={season.id} value={season.id}>
                        {season.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                    Fixture
                  </label>
                  <select
                    value={selectedFixture}
                    onChange={(e) => setSelectedFixture(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
                    disabled={!selectedSeason}
                  >
                    <option value="">Select fixture...</option>
                    {fixtures.map((fixture) => (
                      <option key={fixture.id} value={fixture.id}>
                        {fixture.team1_name} vs {fixture.team2_name} - {new Date(fixture.match_date).toLocaleDateString()}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <Info className="w-4 h-4 text-amber-500 flex-shrink-0" />
                  <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                    This will send a lineup deadline reminder to both teams in the fixture.
                  </p>
                </div>
              </div>
            )}

            {/* Custom Notification Form */}
            {notificationType === 'custom' && (
              <div className="space-y-4">
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                    Target Audience
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setTargetType('all')}
                      className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border font-mono text-xs uppercase tracking-wider font-bold transition-all duration-200 cursor-pointer ${
                        targetType === 'all'
                          ? 'bg-slate-800 border-slate-900 text-white shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                      }`}
                    >
                      <Globe className="w-4 h-4" /> All Users
                    </button>
                    <button
                      type="button"
                      onClick={() => setTargetType('season')}
                      className={`flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border font-mono text-xs uppercase tracking-wider font-bold transition-all duration-200 cursor-pointer ${
                        targetType === 'season'
                          ? 'bg-slate-800 border-slate-900 text-white shadow-sm'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-800'
                      }`}
                    >
                      <Users className="w-4 h-4" /> Season Teams
                    </button>
                    <button
                      type="button"
                      className="flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-100 text-slate-400 font-mono text-xs uppercase tracking-wider font-bold opacity-50 cursor-not-allowed"
                      disabled
                    >
                      <Users className="w-4 h-4" /> Specific Users
                    </button>
                  </div>
                </div>

                {targetType === 'season' && (
                  <div>
                    <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                      Season
                    </label>
                    <select
                      value={selectedSeason}
                      onChange={(e) => setSelectedSeason(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all duration-200"
                    >
                      <option value="">Select season...</option>
                      {seasons.map((season) => (
                        <option key={season.id} value={season.id}>
                          {season.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={(e) => setCustomTitle(e.target.value)}
                    placeholder="e.g., Season 16 Starting Soon!"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all duration-200"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                    Message
                  </label>
                  <textarea
                    value={customBody}
                    onChange={(e) => setCustomBody(e.target.value)}
                    placeholder="e.g., Season 16 starts on January 1st. Register your team now!"
                    rows={4}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all duration-200"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                    Link URL (optional)
                  </label>
                  <input
                    type="text"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                    placeholder="/dashboard/team"
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all duration-200"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Send Button */}
          <div className="mt-8 pt-6 border-t border-slate-100">
            <button
              onClick={handleSend}
              disabled={sending}
              className="w-full px-6 py-3 bg-slate-800 hover:bg-slate-700 border border-slate-900 rounded-xl text-xs uppercase font-black text-white shadow-sm transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {sending ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                  <span>Sending...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5 text-amber-400" />
                  <span>Send Notification</span>
                </>
              )}
            </button>
          </div>

          {/* Result Display */}
          {result && (
            <div className={`mt-6 p-4 rounded-2xl border font-mono flex items-center gap-3 ${
              result.success 
                ? 'bg-emerald-50/30 border-emerald-200 text-emerald-800' 
                : 'bg-rose-50 border-rose-200 text-rose-800'
            }`}>
              {result.success ? (
                <CheckCircle className="w-5 h-5 text-emerald-500 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0" />
              )}
              <div>
                <p className="text-xs uppercase font-black tracking-wide">
                  {result.success ? 'Notification Sent!' : 'Failed to Send'}
                </p>
                {result.success ? (
                  <p className="text-[10px] text-emerald-600 uppercase font-bold mt-0.5">
                    Sent to {result.sentCount} device(s)
                    {result.failedCount > 0 && ` • ${result.failedCount} failed`}
                  </p>
                ) : (
                  <p className="text-[10px] text-rose-600 uppercase font-bold mt-0.5">{result.error}</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Info Box */}
        <div className="console-card bg-blue-50/45 border border-blue-200/60 rounded-3xl p-6 shadow-sm">
          <h3 className="text-sm font-extrabold text-blue-900 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Info className="w-4 h-4 text-blue-500" /> Usage Tips
          </h3>
          <ul className="text-xs text-blue-800 space-y-2 list-disc list-inside leading-relaxed">
            <li><strong>Round Deadline:</strong> Send reminder 1 hour before auction ends.</li>
            <li><strong>Lineup Deadline:</strong> Send reminder 2-3 hours before match.</li>
            <li><strong>Custom:</strong> Use for announcements, season starts, maintenance, etc.</li>
            <li>Notifications only go to users who have enabled notifications.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
