'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { fetchWithTokenRefresh } from '@/lib/token-refresh';
import { Bell, Send, AlertCircle, CheckCircle, ArrowLeft, Users, Smartphone, Monitor, Tablet, BellOff } from 'lucide-react';
import Link from 'next/link';

interface Device {
  deviceName: string;
  deviceType: string;
  browser: string;
  os: string;
}

interface NotificationUser {
  userId: string;
  deviceCount: number;
  devices: Device[];
  userName?: string;
  teamName?: string;
}

export default function SendNotificationPage() {
  const { user, loading } = useAuth();
  const router = useRouter();

  const [formData, setFormData] = useState({
    title: '',
    body: '',
    url: '',
  });
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string; data?: any } | null>(null);
  const [notificationUsers, setNotificationUsers] = useState<NotificationUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  // Redirect if not authenticated or not committee admin
  if (!loading && (!user || user.role !== 'committee_admin')) {
    router.push('/dashboard');
    return null;
  }

  // Fetch notification users
  useEffect(() => {
    const fetchNotificationUsers = async () => {
      try {
        const response = await fetchWithTokenRefresh('/api/notifications/users');
        const data = await response.json();

        if (data.success) {
          setNotificationUsers(data.users || []);
        }
      } catch (error) {
        console.error('Error fetching notification users:', error);
      } finally {
        setLoadingUsers(false);
      }
    };

    if (user && user.role === 'committee_admin') {
      fetchNotificationUsers();
    }
  }, [user]);

  const toggleUserExpanded = (userId: string) => {
    setExpandedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const getDeviceIcon = (deviceType: string) => {
    const type = deviceType?.toLowerCase() || '';
    if (type.includes('mobile') || type.includes('phone')) {
      return <Smartphone className="w-4 h-4" />;
    } else if (type.includes('tablet')) {
      return <Tablet className="w-4 h-4" />;
    } else {
      return <Monitor className="w-4 h-4" />;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.title.trim() || !formData.body.trim()) {
      setResult({
        success: false,
        message: 'Please fill in both title and message fields.',
      });
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const response = await fetchWithTokenRefresh('/api/admin/send-manual-notification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type: 'custom',
          title: formData.title,
          bodyText: formData.body,
          url: formData.url || '/',
          targetType: 'all',
        }),
      });

      const data = await response.json();

      if (data.success) {
        setResult({
          success: true,
          message: `Notification sent successfully! Reached ${data.successCount || 0} devices.`,
          data: data,
        });
        // Reset form
        setFormData({ title: '', body: '', url: '' });
      } else {
        setResult({
          success: false,
          message: data.error || 'Failed to send notification',
        });
      }
    } catch (error: any) {
      console.error('Error sending notification:', error);
      setResult({
        success: false,
        message: error.message || 'An unexpected error occurred',
      });
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="console-bg min-h-screen flex items-center justify-center font-mono">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500 mx-auto"></div>
          <p className="mt-4 text-sm text-slate-500 uppercase tracking-wider font-bold">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 pt-5 lg:pt-24 pb-12 px-4 sm:px-6">
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
      
      <div className="max-w-3xl mx-auto relative z-10 space-y-6 font-mono">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Link
            href="/dashboard/committee"
            className="p-2 rounded-xl bg-white border border-slate-200 hover:border-amber-400 hover:bg-amber-50 transition-all"
          >
            <ArrowLeft className="w-5 h-5 text-slate-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-wider">
              Send Notification
            </h1>
            <p className="text-xs text-slate-500 uppercase font-semibold mt-1">
              Broadcast message to all team users
            </p>
          </div>
        </div>

        {/* Main Card */}
        <div className="console-card bg-white border border-slate-200/60 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-6 pb-4 border-b border-slate-100">
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-100">
              <Bell className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                Notification Details
              </h2>
              <p className="text-xs text-slate-500 font-semibold uppercase mt-0.5">
                All registered team users will receive this notification
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Title Field */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Notification Title *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g., Important League Announcement"
                maxLength={60}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                disabled={sending}
              />
              <p className="text-xs text-slate-400 font-semibold mt-1">
                {formData.title.length}/60 characters
              </p>
            </div>

            {/* Body Field */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Message *
              </label>
              <textarea
                value={formData.body}
                onChange={(e) => setFormData({ ...formData, body: e.target.value })}
                placeholder="e.g., The next round starts on Monday. Make sure to submit your bids before the deadline!"
                rows={5}
                maxLength={200}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all resize-none"
                disabled={sending}
              />
              <p className="text-xs text-slate-400 font-semibold mt-1">
                {formData.body.length}/200 characters
              </p>
            </div>

            {/* URL Field (Optional) */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">
                Link URL (Optional)
              </label>
              <input
                type="text"
                value={formData.url}
                onChange={(e) => setFormData({ ...formData, url: e.target.value })}
                placeholder="/dashboard/team"
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:border-transparent transition-all"
                disabled={sending}
              />
              <p className="text-xs text-slate-400 font-semibold mt-1">
                Users will be redirected here when they tap the notification
              </p>
            </div>

            {/* Result Message */}
            {result && (
              <div
                className={`rounded-xl p-4 flex items-start gap-3 ${
                  result.success
                    ? 'bg-green-50 border border-green-200'
                    : 'bg-red-50 border border-red-200'
                }`}
              >
                {result.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div className="flex-1">
                  <p
                    className={`text-xs font-bold uppercase tracking-wider ${
                      result.success ? 'text-green-800' : 'text-red-800'
                    }`}
                  >
                    {result.success ? 'Success!' : 'Error'}
                  </p>
                  <p
                    className={`text-xs font-semibold mt-1 ${
                      result.success ? 'text-green-700' : 'text-red-700'
                    }`}
                  >
                    {result.message}
                  </p>
                  {result.data && (
                    <div className="mt-2 text-xs font-mono text-green-600">
                      <p>✓ Success: {result.data.successCount || 0} devices</p>
                      {result.data.failureCount > 0 && (
                        <p>✗ Failed: {result.data.failureCount} devices</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Submit Button */}
            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={sending || !formData.title.trim() || !formData.body.trim()}
                className="flex-1 bg-amber-500 hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-black uppercase tracking-wider text-sm py-3 px-6 rounded-xl transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                {sending ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    Sending...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Send to All Teams
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Info Card */}
        <div className="console-card bg-blue-50 border border-blue-200 rounded-2xl p-5">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-100 border border-blue-200 flex-shrink-0">
              <AlertCircle className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="text-xs font-black text-blue-900 uppercase tracking-wider mb-2">
                Important Information
              </h3>
              <ul className="space-y-1.5 text-xs text-blue-800 font-semibold">
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>This notification will be sent to <strong>all team users</strong> who have registered devices</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Users must have granted notification permissions on their devices</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Keep messages clear, concise, and action-oriented</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-500 mt-0.5">•</span>
                  <span>Use the URL field to direct users to relevant pages</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
