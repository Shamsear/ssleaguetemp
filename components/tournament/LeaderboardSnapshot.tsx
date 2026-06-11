import React from 'react';

// Data shapes expected
export interface StandingRow {
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

export interface LeaderboardSnapshotProps {
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
    return { background: 'rgba(0,0,0,0.05)', color: '#6B7280' };
  };

  return (
    <div
      style={{
        background: 'linear-gradient(to bottom right, #ffffff, #fdfbf7)',
        padding: '48px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        width: '1200px', // Fixed width for consistent export resolution
        boxSizing: 'border-box',
        border: '1px solid rgba(232,168,0,0.2)',
      }}
    >
      {/* Header Section */}
      <div style={{ marginBottom: 36, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid rgba(232,168,0,0.2)', paddingBottom: '24px' }}>
        <div>
          <div style={{ color: '#E8A800', fontSize: 13, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 }}>
            {seasonName}
          </div>
          <div style={{ color: '#111111', fontSize: 38, fontWeight: 900, letterSpacing: '-0.5px', marginBottom: 4 }}>
            {tournamentName}
          </div>
          <div style={{ color: '#6B7280', fontSize: 14, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
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
        <div key={groupName} style={{ marginBottom: 36, borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(232,168,0,0.2)', boxShadow: '0 8px 32px rgba(0,0,0,0.05)', background: '#ffffff' }}>
          {/* Group Name Header (Only shown if there are multiple groups) */}
          {Object.keys(byGroup).length > 1 && (
            <div style={{ background: 'linear-gradient(90deg, rgba(232,168,0,0.05), transparent)', borderBottom: '1px solid rgba(232,168,0,0.1)', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{ width: '4px', height: '16px', borderRadius: '2px', backgroundColor: '#E8A800' }}></div>
              <span style={{ color: '#111111', fontWeight: 900, fontSize: 15, letterSpacing: 1.5, textTransform: 'uppercase' }}>{groupName}</span>
            </div>
          )}
          
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: '#fcfaf5', borderBottom: '1px solid rgba(232,168,0,0.2)' }}>
                {['#', 'Team', 'P', 'W', 'D', 'L', 'GF', 'GA', 'GD', 'Pts'].map((h, i) => (
                  <th key={h} style={{
                    padding: i === 0 ? '16px 10px 16px 20px' : i === 1 ? '16px 10px' : '16px 14px',
                    textAlign: i <= 1 ? 'left' : 'center',
                    color: i === 9 ? '#E8A800' : '#4B5563',
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
                      borderBottom: '1px solid rgba(0,0,0,0.05)',
                      background: isMe ? 'rgba(232,168,0,0.1)' : 'transparent',
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
                        <div style={{ width: 32, height: 32, borderRadius: '4px', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'rgba(0,0,0,0.05)' }}>
                          {row.seasonTeam.team.logoUrl ? (
                            <img
                              src={row.seasonTeam.team.logoUrl}
                              alt={row.seasonTeam.team.name}
                              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                              crossOrigin="anonymous" // CRITICAL FOR EXTERNAL IMAGES
                              loading="eager"
                            />
                          ) : (
                            <div style={{ fontSize: '11px', fontWeight: 'bold', color: '#6B7280' }}>
                              {row.seasonTeam.team.name.slice(0, 2).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <span style={{ fontWeight: 800, color: isMe ? '#D4AF37' : '#111111', fontSize: 15 }}>
                          {row.seasonTeam.team.name}
                          {isMe && <span style={{ marginLeft: '8px', fontSize: '10px', fontWeight: 900, background: 'rgba(232,168,0,0.15)', color: '#E8A800', padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase' }}>YOU</span>}
                        </span>
                      </div>
                    </td>
                    
                    {/* Stats */}
                    <td style={{ padding: '16px 14px', textAlign: 'center', color: '#4B5563', fontSize: 15, fontWeight: 600 }}>{row.played}</td>
                    <td style={{ padding: '16px 14px', textAlign: 'center', color: '#059669', fontWeight: 700, fontSize: 15 }}>{row.won}</td>
                    <td style={{ padding: '16px 14px', textAlign: 'center', color: '#4B5563', fontSize: 15 }}>{row.drawn}</td>
                    <td style={{ padding: '16px 14px', textAlign: 'center', color: '#DC2626', fontWeight: 700, fontSize: 15 }}>{row.lost}</td>
                    <td style={{ padding: '16px 14px', textAlign: 'center', color: '#4B5563', fontSize: 15 }}>{row.goalsFor}</td>
                    <td style={{ padding: '16px 14px', textAlign: 'center', color: '#4B5563', fontSize: 15 }}>{row.goalsAgainst}</td>
                    <td style={{ padding: '16px 14px', textAlign: 'center', fontWeight: 700, fontSize: 15, color: row.goalDiff > 0 ? '#059669' : row.goalDiff < 0 ? '#DC2626' : '#6B7280' }}>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#9CA3AF', fontSize: 12, fontWeight: 700, marginTop: 16 }}>
        <div>sspsleague.com</div>
        <div>Generated on {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
      </div>
    </div>
  );
}
