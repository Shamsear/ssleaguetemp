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
  Clock,
  Smartphone,
  Monitor,
  Tablet,
  Database,
  Eye,
  EyeOff
} from 'lucide-react';

interface NotificationUser {
  userId: string;
  deviceCount: number;
  devices: Array<{
    deviceName: string;
    deviceType: string;
    browser?: string;
    os?: string;
  }>;
  teamName?: string;
  email?: string;
  teamLogo?: string;
}

export default function AdminNotificationsPage() {
  const [activeTab, setActiveTab] = useState<'send' | 'users'>('send');
  const [notificationType, setNotificationType] = useState<'round_deadline' | 'lineup_deadline' | 'custom'>('custom');
  const [seasons, setSeasons] = useState<any[]>([]);
  const [currentSeason, setCurrentSeason] = useState<any>(null);
  const [rounds, setRounds] = useState<any[]>([]);
  const [fixtures, setFixtures] = useState<any[]>([]);
  const [notificationUsers, setNotificationUsers] = useState<NotificationUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  
  const [selectedSeason, setSelectedSeason] = useState('');
  const [selectedRound, setSelectedRound] = useState('');
  const [selectedFixture, setSelectedFixture] = useState('');
  
  const [customTitle, setCustomTitle] = useState('');
  const [customBody, setCustomBody] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [seasonTeams, setSeasonTeams] = useState<any[]>([]);
  const [loadingSeasonTeams, setLoadingSeasonTeams] = useState(false);
  const [teamsWithNotifications, setTeamsWithNotifications] = useState<Set<string>>(new Set());
  
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  // Load seasons and current season
  useEffect(() => {
    loadSeasons();
    loadCurrentSeason();
    loadNotificationUsers(); // Load notification users on mount
  }, []);

  // Load notification users when users tab is active
  useEffect(() => {
    if (activeTab === 'users') {
      loadNotificationUsers();
    }
  }, [activeTab]);

  // Load rounds when current season is loaded
  useEffect(() => {
    if (currentSeason?.id) {
      setSelectedSeason(currentSeason.id);
      loadRounds(currentSeason.id);
      loadFixtures(currentSeason.id);
      loadSeasonTeams(currentSeason.id);
    }
  }, [currentSeason]);

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

  const loadCurrentSeason = async () => {
    try {
      const response = await fetchWithTokenRefresh('/api/seasons/current');
      if (response.ok) {
        const data = await response.json();
        setCurrentSeason(data.season || null);
      }
    } catch (error) {
      console.error('Error loading current season:', error);
    }
  };

  const loadSeasons = async () => {
    try {
      const response = await fetchWithTokenRefresh('/api/seasons');
      if (response.ok) {
        const data = await response.json();
        setSeasons(data.seasons || []);
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

  const loadNotificationUsers = async () => {
    setLoadingUsers(true);
    try {
      const response = await fetchWithTokenRefresh('/api/notifications/users');
      if (response.ok) {
        const data = await response.json();
        console.log('[Notification Users] API Response:', data);
        setNotificationUsers(data.users || []);
        
        // Build a set of user IDs who have notifications enabled
        const userIdsWithNotifications = new Set(
          (data.users || []).map((user: NotificationUser) => user.userId)
        );
        console.log('[Notification Users] User IDs with notifications:', Array.from(userIdsWithNotifications));
        setTeamsWithNotifications(userIdsWithNotifications);
      } else {
        console.error('[Notification Users] API Error:', response.status, response.statusText);
      }
    } catch (error) {
      console.error('[Notification Users] Error loading notification users:', error);
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadSeasonTeams = async (seasonId: string) => {
    setLoadingSeasonTeams(true);
    try {
      const response = await fetchWithTokenRefresh(`/api/teams/registered?season_id=${seasonId}`);
      if (response.ok) {
        const data = await response.json();
        console.log('[Season Teams] API Response:', data);
        console.log('[Season Teams] Sample team user_ids:', data.teams?.slice(0, 3).map((t: any) => ({ name: t.team_name, user_id: t.user_id })));
        setSeasonTeams(data.teams || []);
      }
    } catch (error) {
      console.error('Error loading season teams:', error);
    } finally {
      setLoadingSeasonTeams(false);
    }
  };

  const toggleUserExpanded = (userId: string) => {
    const newExpanded = new Set(expandedUsers);
    if (newExpanded.has(userId)) {
      newExpanded.delete(userId);
    } else {
      newExpanded.add(userId);
    }
    setExpandedUsers(newExpanded);
  };

  const getDeviceIcon = (deviceType: string) => {
    const type = deviceType?.toLowerCase() || '';
    if (type.includes('mobile')) return <Smartphone className="w-4 h-4" />;
    if (type.includes('tablet')) return <Tablet className="w-4 h-4" />;
    return <Monitor className="w-4 h-4" />;
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
        payload.targetType = 'season';
        if (selectedSeason) {
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
              <Bell className="w-6 h-6 text-amber-400 animate-pulse" />
            </div>
            <div>
              <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">SYSTEM CONTROL</span>
              <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-0.5">
                Notification Management
              </h1>
              <p className="text-xs text-slate-550 font-mono mt-1">
                Send push notifications and manage user notification settings
              </p>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-2 shadow-sm">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setActiveTab('send')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-mono text-xs uppercase tracking-wider font-bold transition-all duration-200 ${
                activeTab === 'send'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Send className="w-4 h-4" />
              Send Notifications
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-mono text-xs uppercase tracking-wider font-bold transition-all duration-200 ${
                activeTab === 'users'
                  ? 'bg-slate-800 text-white shadow-sm'
                  : 'bg-slate-50 text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Users className="w-4 h-4" />
              User Management ({notificationUsers.length})
            </button>
          </div>
        </div>

        {/* Send Notifications Tab */}
        {activeTab === 'send' && (
        <>
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
                {currentSeason && (
                  <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                      Using current season: {currentSeason.name}
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                    Active Round
                  </label>
                  <select
                    value={selectedRound}
                    onChange={(e) => setSelectedRound(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all duration-200"
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

                {/* Recipients Preview for Round Deadline */}
                {seasonTeams.length > 0 && (
                  <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0 w-10 h-10 bg-blue-500 rounded-lg flex items-center justify-center">
                        <Bell className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-black text-blue-900 uppercase tracking-wider mb-1">
                          Will Notify
                        </h4>
                        <p className="text-[10px] font-bold text-blue-700 mb-2">
                          {seasonTeams.filter(t => teamsWithNotifications.has(t.user_id)).length} teams with notifications enabled
                        </p>
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto">
                          {seasonTeams
                            .filter(t => teamsWithNotifications.has(t.user_id))
                            .map((team) => {
                              const user = notificationUsers.find(u => u.userId === team.user_id);
                              return (
                                <div
                                  key={team.team_id}
                                  className="inline-flex items-center gap-1.5 px-2 py-1 bg-white border border-blue-200 rounded-lg"
                                >
                                  <span className="text-[9px] font-bold text-blue-900">
                                    {team.team_name || team.name}
                                  </span>
                                  {user && (
                                    <span className="text-[8px] font-black text-blue-500">
                                      ({user.deviceCount})
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Lineup Deadline Form */}
            {notificationType === 'lineup_deadline' && (
              <div className="space-y-4">
                {currentSeason && (
                  <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                    <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                      Using current season: {currentSeason.name}
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-[10px] font-black uppercase text-slate-400 tracking-wider mb-2">
                    Fixture
                  </label>
                  <select
                    value={selectedFixture}
                    onChange={(e) => setSelectedFixture(e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 rounded-xl text-sm font-bold transition-all duration-200"
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

                {/* Recipients Preview for Lineup Deadline */}
                {selectedFixture && fixtures.length > 0 && (() => {
                  const fixture = fixtures.find(f => f.id === selectedFixture);
                  if (!fixture) return null;
                  
                  const team1 = seasonTeams.find(t => t.team_id === fixture.team1_id);
                  const team2 = seasonTeams.find(t => t.team_id === fixture.team2_id);
                  const recipientTeams = [team1, team2].filter(Boolean);
                  const recipientsWithNotifications = recipientTeams.filter(t => t && teamsWithNotifications.has(t.user_id));

                  return (
                    <div className="bg-gradient-to-br from-purple-50 to-pink-50 border border-purple-200 rounded-xl p-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 w-10 h-10 bg-purple-500 rounded-lg flex items-center justify-center">
                          <Bell className="w-5 h-5 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-black text-purple-900 uppercase tracking-wider mb-1">
                            Will Notify
                          </h4>
                          <p className="text-[10px] font-bold text-purple-700 mb-2">
                            {recipientsWithNotifications.length} of 2 teams have notifications enabled
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {recipientTeams.map((team) => {
                              if (!team) return null;
                              const hasNotif = teamsWithNotifications.has(team.user_id);
                              const user = notificationUsers.find(u => u.userId === team.user_id);
                              return (
                                <div
                                  key={team.team_id}
                                  className={`inline-flex items-center gap-1.5 px-2 py-1 border rounded-lg ${
                                    hasNotif 
                                      ? 'bg-white border-purple-200' 
                                      : 'bg-gray-100 border-gray-300 opacity-60'
                                  }`}
                                >
                                  {hasNotif && <Bell className="w-3 h-3 text-purple-600 fill-purple-600" />}
                                  <span className={`text-[9px] font-bold ${hasNotif ? 'text-purple-900' : 'text-gray-600'}`}>
                                    {team.team_name || team.name}
                                  </span>
                                  {hasNotif && user && (
                                    <span className="text-[8px] font-black text-purple-500">
                                      ({user.deviceCount})
                                    </span>
                                  )}
                                  {!hasNotif && (
                                    <span className="text-[8px] font-black text-gray-500">
                                      (no devices)
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}              </div>
            )}

            {/* Custom Notification Form */}
            {notificationType === 'custom' && (
              <div className="space-y-4">
                {currentSeason && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl">
                      <Info className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      <p className="text-[10px] font-bold text-blue-700 uppercase tracking-wider">
                        Will send to {seasonTeams.length} teams in: {currentSeason.name}
                      </p>
                    </div>
                    
                    {loadingSeasonTeams ? (
                      <div className="flex items-center justify-center py-4">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-slate-800"></div>
                      </div>
                    ) : seasonTeams.length > 0 && (
                      <div className="space-y-3">
                        <div className="border border-slate-200 rounded-xl p-3 max-h-40 overflow-y-auto">
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider mb-2">Teams List:</p>
                          <div className="flex flex-wrap gap-1.5">
                            {seasonTeams.map((team) => {
                              const hasNotifications = teamsWithNotifications.has(team.user_id);
                              return (
                                <span
                                  key={team.team_id}
                                  className={`inline-flex items-center gap-1.5 px-2 py-1 border rounded-lg text-[9px] font-bold uppercase ${
                                    hasNotifications 
                                      ? 'bg-emerald-50 border-emerald-300 text-emerald-700' 
                                      : 'bg-slate-50 border-slate-200 text-slate-700'
                                  }`}
                                >
                                  {hasNotifications && (
                                    <Bell className="w-3 h-3 text-emerald-600 fill-emerald-600" />
                                  )}
                                  {team.team_name || team.name}
                                </span>
                              );
                            })}
                          </div>
                        </div>

                        {/* Recipients Summary */}
                        <div className="bg-gradient-to-br from-emerald-50 to-green-50 border border-emerald-200 rounded-xl p-4">
                          <div className="flex items-start gap-3">
                            <div className="flex-shrink-0 w-10 h-10 bg-emerald-500 rounded-lg flex items-center justify-center">
                              <Bell className="w-5 h-5 text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <h4 className="text-xs font-black text-emerald-900 uppercase tracking-wider mb-1">
                                Notification Recipients
                              </h4>
                              <p className="text-[10px] font-bold text-emerald-700 mb-2">
                                {seasonTeams.filter(t => teamsWithNotifications.has(t.user_id)).length} of {seasonTeams.length} teams will receive this notification
                              </p>
                              <div className="flex flex-wrap gap-1.5">
                                {seasonTeams
                                  .filter(t => teamsWithNotifications.has(t.user_id))
                                  .map((team) => {
                                    const user = notificationUsers.find(u => u.userId === team.user_id);
                                    return (
                                      <div
                                        key={team.team_id}
                                        className="inline-flex items-center gap-1.5 px-2 py-1 bg-white border border-emerald-200 rounded-lg"
                                      >
                                        {team.team_logo ? (
                                          <img 
                                            src={team.team_logo} 
                                            alt={team.team_name}
                                            className="w-4 h-4 rounded object-cover"
                                          />
                                        ) : (
                                          <div className="w-4 h-4 bg-emerald-100 rounded flex items-center justify-center text-[8px] font-black text-emerald-600">
                                            {(team.team_name || 'T')[0].toUpperCase()}
                                          </div>
                                        )}
                                        <span className="text-[9px] font-bold text-emerald-900">
                                          {team.team_name || team.name}
                                        </span>
                                        {user && (
                                          <span className="text-[8px] font-black text-emerald-500">
                                            ({user.deviceCount} {user.deviceCount === 1 ? 'device' : 'devices'})
                                          </span>
                                        )}
                                      </div>
                                    );
                                  })}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
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
        </>
        )}

        {/* User Management Tab */}
        {activeTab === 'users' && (
          <>
            {/* Stats Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-blue-50 border border-blue-100 rounded-xl flex items-center justify-center">
                    <Users className="w-5 h-5 text-blue-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-slate-900">{notificationUsers.length}</p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Users</p>
                  </div>
                </div>
              </div>

              <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center">
                    <Smartphone className="w-5 h-5 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-slate-900">
                      {notificationUsers.reduce((sum, user) => sum + user.deviceCount, 0)}
                    </p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Total Devices</p>
                  </div>
                </div>
              </div>

              <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-10 h-10 bg-amber-50 border border-amber-100 rounded-xl flex items-center justify-center">
                    <Database className="w-5 h-5 text-amber-500" />
                  </div>
                  <div>
                    <p className="text-2xl font-extrabold text-slate-900">
                      {notificationUsers.length > 0 ? (notificationUsers.reduce((sum, user) => sum + user.deviceCount, 0) / notificationUsers.length).toFixed(1) : '0'}
                    </p>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Avg Devices/User</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Users List */}
            <div className="console-card bg-white border border-slate-200/60 rounded-3xl p-6 sm:p-8 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Bell className="w-4 h-4 text-amber-500" />
                  Users with Notifications Enabled
                </h2>
                <button
                  onClick={loadNotificationUsers}
                  disabled={loadingUsers}
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all disabled:opacity-50"
                >
                  {loadingUsers ? 'Loading...' : 'Refresh'}
                </button>
              </div>

              {loadingUsers ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-800"></div>
                </div>
              ) : notificationUsers.length === 0 ? (
                <div className="text-center py-12">
                  <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-500 uppercase">No users have enabled notifications yet</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {notificationUsers.map((user) => (
                    <div
                      key={user.userId}
                      className="border border-slate-200 rounded-2xl p-4 hover:border-slate-300 hover:shadow-sm transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 flex-1">
                          {user.teamLogo ? (
                            <div className="w-10 h-10 rounded-xl overflow-hidden bg-white border border-slate-200 flex-shrink-0">
                              <img 
                                src={user.teamLogo} 
                                alt={user.teamName || 'Team'} 
                                className="w-full h-full object-cover"
                              />
                            </div>
                          ) : (
                            <div className="w-10 h-10 bg-gradient-to-br from-slate-800 to-slate-600 rounded-xl flex items-center justify-center text-white font-black text-sm flex-shrink-0">
                              {(user.teamName || user.userId).charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-extrabold text-slate-900 uppercase tracking-wide truncate">
                              {user.teamName || user.userId}
                            </p>
                            <p className="text-[10px] text-slate-500 font-mono truncate">{user.userId}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
                            <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                            <span className="text-xs font-black text-slate-700">{user.deviceCount}</span>
                          </div>
                          <button
                            onClick={() => toggleUserExpanded(user.userId)}
                            className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                          >
                            {expandedUsers.has(user.userId) ? (
                              <EyeOff className="w-4 h-4 text-slate-500" />
                            ) : (
                              <Eye className="w-4 h-4 text-slate-500" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Device Details */}
                      {expandedUsers.has(user.userId) && (
                        <div className="mt-4 pt-4 border-t border-slate-100 space-y-2">
                          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-3">
                            Registered Devices
                          </p>
                          {user.devices.map((device, idx) => (
                            <div
                              key={idx}
                              className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl"
                            >
                              <div className="w-8 h-8 bg-white border border-slate-200 rounded-lg flex items-center justify-center flex-shrink-0">
                                {getDeviceIcon(device.deviceType)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-bold text-slate-800 truncate">
                                  {device.deviceName || 'Unknown Device'}
                                </p>
                                <p className="text-[10px] text-slate-500 font-mono truncate">
                                  {device.deviceType}
                                  {device.browser && ` • ${device.browser}`}
                                  {device.os && ` • ${device.os}`}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
