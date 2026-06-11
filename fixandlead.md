Exact Models: Leaderboard & Fixture Snapshots
Here is the exact, copy-paste ready React component code for both the Leaderboard (Standings) and Fixture image snapshots. These are the components that get rendered off-screen and captured by html-to-image.

They use 100% inline styles so they will work immediately on any website without needing Tailwind CSS or external stylesheets.

1. The Leaderboard (Standings) Model
This model creates a dark, premium league table with position badges (Gold/Silver/Bronze), team logos, and win/draw/loss highlighting.

tsx

import React from 'react';
// Data shapes expected
interface StandingRow {
  id: string;
  position: number | null;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDiff: number;
  points: number;
  groupName: string | null;
  teamId?: string; // Used to highlight the current user's team
  seasonTeam: {
    team: {
      name: string;
      logoUrl: string | null;
    }
  }
}
interface LeaderboardSnapshotProps {
  standings: StandingRow[];
  tournamentName: string;
  seasonName: string;
  myTeamId?: string | null; // Optional: ID of the user's team to highlight
}
export function LeaderboardSnapshot({
  standings,
  tournamentName,
  seasonName,
  myTeamId,
}: LeaderboardSnapshotProps) {
  // Group by group name (or 'Overall' if no groups)
  const byGroup = standings.reduce<Record<string, StandingRow[]>>((acc, s) => {
    const g = s.groupName || 'Overall';
    (acc[g] ??= []).push(s);
    return acc;
  }, {});
  // Generate the gradient styles for the top 3 positions
  const posStyle = (pos: number) => {
    if (pos === 1) return { background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#0a0a0a', boxShadow: '0 2px 8px rgba(255,215,0,0.4)' };
    if (pos === 2) return { background: 'linear-gradient(135deg, #E0E0E0, #9E9E9E)', color: '#0a0a0a', boxShadow: '0 2px 8px rgba(192,192,192,0.3)' };
    if (pos === 3) return { background: 'linear-gradient(135deg, #CD7F32, #8B4513)', color: '#0a0a0a', boxShadow: '0 2px 8px rgba(205,127,50,0.3)' };
    return { background: 'rgba(255,255,255,0.06)', color: '#A0988A' };
  };
  return (
    <div
      style={{
        background: 'radial-gradient(circle at top left, #181818, #070707)',
        padding: '48px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        width: '1200px', // Fixed width for consistent export resolution
        boxSizing: 'border-box',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Header Section */}
      <div style={{ marginBottom: 36, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '24px' }}>
        <div>
          <div style={{ color: '#E8A800', fontSize: 13, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 }}>
            {seasonName}
          </div>
          <div style={{ color: '#FFFFFF', fontSize: 38, fontWeight: 900, letterSpacing: '-0.5px', marginBottom: 4 }}>
            {tournamentName}
          </div>
          <div style={{ color: '#A0988A', fontSize: 14, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Tournament Standings
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          {/* Official Badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(232,168,0,0.1)', border: '1px solid rgba(232,168,0,0.2)', padding: '6px 14px', borderRadius: '30px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#E8A800' }}></div>
            <span style={{ color: '#E8A800', fontSize: 11, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase' }}>OFFICIAL STANDINGS</span>
          </div>
        </div>
      </div>
      {/* Tables Section (Handles multiple groups if needed) */}
      {Object.entries(byGroup).map(([groupName, rows]) => (
        <div key={groupName} style={{ marginBottom: 36, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.08)', boxShadow: '0 8px 32px rgba(0,0,0,0.4)', background: '#111111' }}>
          {/* Group Name Header (Only shown if there are multiple groups) */}
          {Object.keys(byGroup).length > 1 && (
            <div style={{ background: 'linear-gradient(90deg, rgba(232,168,0,0.12), transparent)', borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '4px', height: '16px', borderRadius: '2px', backgroundColor: '#E8A800' }}></div>
              <span style={{ color: '#F5F0E8', fontWeight: 900, fontSize: 15, letterSpacing: 1.5, textTransform: 'uppercase' }}>{groupName}</span>
            </div>
          )}
          
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#141414', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                {['#', 'Team', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'].map((h, i) => (
                  <th key={h} style={{
                    padding: i === 0 ? '16px 10px 16px 20px' : i === 1 ? '16px 10px' : '16px 14px',
                    textAlign: i <= 1 ? 'left' : 'center',
                    color: i === 9 ? '#E8A800' : '#A0988A',
                    fontSize: 12,
                    fontWeight: 800,
                    letterSpacing: 1.5,
                    textTransform: 'uppercase',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => {
                const pos = row.position ?? idx + 1;
                const ps = posStyle(pos);
                const isMe = myTeamId && row.teamId === myTeamId;
                
                return (
                  <tr
                    key={row.id}
                    style={{
                      borderBottom: '1px solid rgba(255,255,255,0.04)',
                      background: isMe ? 'rgba(232,168,0,0.06)' : 'transparent',
                    }}
                  >
                    {/* Position Badge */}
                    <td style={{ padding: '16px 10px 16px 20px', width: '40px' }}>
                      <div style={{ width: 28, height: 28, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 900, overflow: 'hidden', ...ps }}>
                        {pos}
                      </div>
                    </td>
                    
                    {/* Team Info (Logo + Name) */}
                    <td style={{ padding: '16px 10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '4px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'rgba(255,255,255,0.05)' }}>
                          {row.seasonTeam.team.logoUrl ? (
                            <img
                              src={row.seasonTeam.team.logoUrl}
                              alt={row.seasonTeam.team.name}
                              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                              crossOrigin="anonymous" // CRITICAL FOR EXTERNAL IMAGES
                              loading="eager"
                            />
                          ) : (
                            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#A0988A' }}>
                              {row.seasonTeam.team.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <span style={{ fontWeight: 800, color: isMe ? '#E8A800' : '#F5F0E8', fontSize: 15 }}>
                          {row.seasonTeam.team.name}
                          {isMe && <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 900, background: 'rgba(232,168,0,0.15)', color: '#E8A800', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>YOU</span>}
                        </span>
                      </div>
                    </td>
                    
                    {/* Stats */}
                    <td style={{ padding: '16px 14px', textAlign: 'center', color: '#D4CCBB', fontSize: 15, fontWeight: 600 }}>{row.played}</td>
                    <td style={{ padding: '16px 14px', textAlign: 'center', color: '#4ade80', fontWeight: 700, fontSize: 15 }}>{row.won}</td>
                    <td style={{ padding: '16px 14px', textAlign: 'center', color: '#D4CCBB', fontSize: 15 }}>{row.drawn}</td>
                    <td style={{ padding: '16px 14px', textAlign: 'center', color: '#f87171', fontWeight: 700, fontSize: 15 }}>{row.lost}</td>
                    <td style={{ padding: '16px 14px', textAlign: 'center', color: '#D4CCBB', fontSize: 15 }}>{row.goalsFor}</td>
                    <td style={{ padding: '16px 14px', textAlign: 'center', color: '#D4CCBB', fontSize: 15 }}>{row.goalsAgainst}</td>
                    <td style={{ padding: '16px 14px', textAlign: 'center', fontWeight: 700, fontSize: 15, color: row.goalDiff > 0 ? '#4ade80' : row.goalDiff < 0 ? '#f87171' : '#7A7367' }}>
                      {row.goalDiff > 0 ? '+' : ''}{row.goalDiff}
                    </td>
                    
                    {/* Points */}
                    <td style={{ padding: '16px 20px', textAlign: 'center', fontWeight: 900, fontSize: 17, color: '#E8A800' }}>
                      {row.points}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ))}
      {/* Footer Watermark */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#5A5347', fontSize: 12, fontWeight: 700, marginTop: 16 }}>
        <div>yourwebsite.com</div>
        <div>Generated on {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
      </div>
    </div>
  );
}
2. The Fixtures Model
This model creates a vertical list of match cards for a specific matchday, highlighting the winning team and color-coding match statuses (e.g., SCHEDULED, COMPLETED, POSTPONED).

tsx

import React from 'react';
// Data shapes expected
interface Match {
  id: string;
  matchDate: Date | string;
  venue?: string;
  status: 'SCHEDULED' | 'LIVE' | 'COMPLETED' | 'POSTPONED' | 'CANCELLED' | 'WALKOVER' | 'VOID';
  homeScore: number | null;
  awayScore: number | null;
  homeTeam: {
    team: {
      name: string;
      logoUrl: string | null;
    }
  };
  awayTeam: {
    team: {
      name: string;
      logoUrl: string | null;
    }
  };
}
interface FixturesSnapshotProps {
  matches: Match[];
  tournamentName: string;
  seasonName: string;
  activeRound: string; // e.g., "Matchday 1"
}
export function FixturesSnapshot({
  matches,
  tournamentName,
  seasonName,
  activeRound,
}: FixturesSnapshotProps) {
  
  // Format dates elegantly
  const formatDate = (date: Date | string) => {
    return new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(new Date(date));
  };
  // Status badge colors
  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      SCHEDULED: '#60a5fa', // Blue
      LIVE: '#34d399',      // Green
      COMPLETED: '#7A7367', // Grey
      POSTPONED: '#facc15', // Yellow
      CANCELLED: '#f87171', // Red
      WALKOVER: '#c084fc',  // Purple
      VOID: '#94a3b8'       // Slate
    };
    return colors[status] || colors.SCHEDULED;
  };
  return (
    <div
      style={{
        background: 'radial-gradient(circle at top left, #121e1a, #070707)',
        padding: '48px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        width: '1200px', // Fixed width for export
        boxSizing: 'border-box',
        border: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 36, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '24px' }}>
        <div>
          <div style={{ color: '#10b981', fontSize: 13, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 }}>
            {seasonName}
          </div>
          <div style={{ color: '#FFFFFF', fontSize: 38, fontWeight: 900, letterSpacing: '-0.5px', marginBottom: 4 }}>
            {tournamentName}
          </div>
          <div style={{ color: '#A0988A', fontSize: 14, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Fixtures - {activeRound}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)', padding: '6px 14px', borderRadius: '30px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }}></div>
            <span style={{ color: '#10b981', fontSize: 11, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase' }}>MATCHDAY FIXTURES</span>
          </div>
        </div>
      </div>
      {/* Match Cards List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {matches.map((match) => {
          // Calculate win state for opacity highlighting
          const hasScore = match.homeScore !== null && match.awayScore !== null && match.status !== 'VOID';
          const homeWin = hasScore && match.homeScore! > match.awayScore!;
          const awayWin = hasScore && match.awayScore! > match.homeScore!;
          return (
            <div key={match.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 32px', borderRadius: '16px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
              
              {/* Left Column: Date & Status */}
              <div style={{ width: '200px' }}>
                <div style={{ color: '#7A7367', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                  {formatDate(match.matchDate)}
                </div>
                {match.venue && (
                  <div style={{ color: '#A0988A', fontSize: '13px', marginBottom: '8px' }}>
                    {match.venue}
                  </div>
                )}
                <div style={{ display: 'inline-block', padding: '4px 12px', borderRadius: '20px', border: `1px solid ${getStatusColor(match.status)}`, color: getStatusColor(match.status), fontSize: '11px', fontWeight: 800, textTransform: 'uppercase' }}>
                  {match.status}
                </div>
              </div>
              {/* Center Area: Team vs Team */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '32px' }}>
                
                {/* Home Team */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '16px', opacity: awayWin ? 0.6 : 1 }}>
                  <span style={{ color: homeWin ? '#34d399' : '#FFFFFF', fontSize: '20px', fontWeight: 800 }}>
                    {match.homeTeam.team.name}
                  </span>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}>
                    {match.homeTeam.team.logoUrl ? (
                      <img src={match.homeTeam.team.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} crossOrigin="anonymous" />
                    ) : (
                      <span style={{ fontSize: '24px' }}>⚽</span>
                    )}
                  </div>
                </div>
                {/* Score Area */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '120px' }}>
                  {match.status === 'WALKOVER' ? (
                     <div style={{ padding: '4px 12px', borderRadius: '6px', background: 'rgba(192,132,252,0.1)', border: '1px solid rgba(192,132,252,0.2)', color: '#c084fc', fontSize: '14px', fontWeight: 900 }}>W/O</div>
                  ) : match.status === 'VOID' ? (
                     <div style={{ padding: '4px 12px', borderRadius: '6px', background: 'rgba(148,163,184,0.1)', border: '1px solid rgba(148,163,184,0.2)', color: '#94a3b8', fontSize: '14px', fontWeight: 900 }}>VOID</div>
                  ) : hasScore ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span style={{ color: homeWin ? '#34d399' : '#FFFFFF', fontSize: '32px', fontWeight: 900 }}>{match.homeScore}</span>
                      <span style={{ color: '#7A7367', fontSize: '24px', fontWeight: 800 }}>-</span>
                      <span style={{ color: awayWin ? '#34d399' : '#FFFFFF', fontSize: '32px', fontWeight: 900 }}>{match.awayScore}</span>
                    </div>
                  ) : (
                    <span style={{ color: '#7A7367', fontSize: '20px', fontWeight: 800 }}>vs</span>
                  )}
                </div>
                {/* Away Team */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '16px', opacity: homeWin ? 0.6 : 1 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px' }}>
                    {match.awayTeam.team.logoUrl ? (
                      <img src={match.awayTeam.team.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} crossOrigin="anonymous" />
                    ) : (
                      <span style={{ fontSize: '24px' }}>⚽</span>
                    )}
                  </div>
                  <span style={{ color: awayWin ? '#34d399' : '#FFFFFF', fontSize: '20px', fontWeight: 800 }}>
                    {match.awayTeam.team.name}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {/* Footer Watermark */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#41574e', fontSize: 12, fontWeight: 700, marginTop: 24 }}>
        <div>yourwebsite.com</div>
        <div>Generated on {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
      </div>
    </div>
  );
}
How to use these models
Place these components in your new React/Next.js project.
Render them inside a hidden container: <div style={{ position: 'fixed', left: '-9999px' }}><LeaderboardSnapshot ... /></div>
Use the share-table.ts utility (from the previous guide) to target the wrapper element: const dataUrl = await captureTableAsPng(ref.current)