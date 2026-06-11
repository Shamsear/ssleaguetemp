'use client';

/**
 * League Chat Component
 * 
 * Real-time chat interface for fantasy league members
 */

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';

interface Message {
  message_id: string;
  league_id: string;
  team_id: string;
  team_name: string;
  user_id: string;
  message_text: string;
  reactions: Record<string, string[]>;
  is_deleted: boolean;
  created_at: string;
  updated_at: string;
}

interface ReactionSummary {
  emoji: string;
  count: number;
  users: string[];
}

interface LeagueChatProps {
  leagueId: string;
  teamId: string;
  teamName: string;
}

export default function LeagueChat({ leagueId, teamId, teamName }: LeagueChatProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Fetch messages
  const fetchMessages = async () => {
    try {
      const response = await fetch(
        `/api/fantasy/chat/messages?league_id=${leagueId}&limit=50`
      );
      const data = await response.json();
      if (data.success) {
        setMessages(data.messages || []);
      } else {
        setError(data.error || 'Failed to fetch messages');
      }
    } catch (err) {
      setError('Failed to load messages');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    // Poll for new messages every 5 seconds
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [leagueId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || sending) return;

    setSending(true);
    try {
      const response = await fetch('/api/fantasy/chat/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          league_id: leagueId,
          team_id: teamId,
          team_name: teamName,
          message_text: newMessage.trim()
        })
      });
      const data = await response.json();
      if (data.success) {
        setNewMessage('');
        fetchMessages();
      } else {
        setError(data.error || 'Failed to send message');
      }
    } catch (err) {
      setError('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col h-[500px] bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="p-4 border-b border-gray-100 bg-gray-50">
        <h3 className="font-semibold text-gray-800">League Chat</h3>
      </div>

      <div className="flex-1 p-4 overflow-y-auto space-y-4">
        {loading ? (
          <div className="text-center text-gray-500 text-sm mt-4">Loading messages...</div>
        ) : messages.length === 0 ? (
          <div className="text-center text-gray-500 text-sm mt-4">No messages yet. Start the conversation!</div>
        ) : (
          messages.map((msg) => (
            <div
              key={msg.message_id}
              className={`flex flex-col max-w-[80%] ${
                msg.team_id === teamId ? 'ml-auto items-end' : 'mr-auto items-start'
              }`}
            >
              <span className="text-xs text-gray-500 mb-1">{msg.team_name}</span>
              <div
                className={`p-3 rounded-2xl text-sm ${
                  msg.team_id === teamId
                    ? 'bg-blue-600 text-white rounded-br-none'
                    : 'bg-gray-100 text-gray-800 rounded-bl-none'
                }`}
              >
                {msg.message_text}
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && <div className="px-4 py-2 text-xs text-red-600 bg-red-50 border-t border-red-100">{error}</div>}

      <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-100 flex gap-2">
        <input
          type="text"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          placeholder="Type a message..."
          className="flex-1 px-4 py-2 border border-gray-200 rounded-xl text-sm focus:outline-none focus:border-blue-500"
          disabled={sending}
        />
        <button
          type="submit"
          disabled={sending || !newMessage.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}