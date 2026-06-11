import React from 'react';

// Data shapes expected
export interface Match {
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

export interface FixturesSnapshotProps {
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
    if (!date) return 'TBD';
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
    return colors[status.toUpperCase()] || colors.SCHEDULED;
  };

  return (
    <div
      style={{
        background: 'linear-gradient(to bottom right, #ffffff, #fdfbf7)',
        padding: '48px',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        width: '1200px', // Fixed width for export
        boxSizing: 'border-box',
        border: '1px solid rgba(232,168,0,0.2)',
      }}
    >
      {/* Header */}
      <div style={{ marginBottom: 36, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid rgba(232,168,0,0.2)', paddingBottom: '24px' }}>
        <div>
          <div style={{ color: '#E8A800', fontSize: 13, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 }}>
            {seasonName}
          </div>
          <div style={{ color: '#111111', fontSize: 38, fontWeight: 900, letterSpacing: '-0.5px', marginBottom: 4 }}>
            {tournamentName}
          </div>
          <div style={{ color: '#6B7280', fontSize: 14, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
            Fixtures - {activeRound}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(232,168,0,0.1)', border: '1px solid rgba(232,168,0,0.2)', padding: '6px 14px', borderRadius: '30px' }}>
            <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#E8A800' }}></div>
            <span style={{ color: '#E8A800', fontSize: 11, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase' }}>MATCHDAY FIXTURES</span>
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
            <div key={match.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '24px 32px', borderRadius: '16px', background: '#ffffff', border: '1px solid rgba(232,168,0,0.2)', boxShadow: '0 4px 16px rgba(0,0,0,0.03)' }}>
              
              {/* Left Column: Date & Status */}
              <div style={{ width: '200px' }}>
                <div style={{ color: '#6B7280', fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
                  {formatDate(match.matchDate)}
                </div>
                {match.venue && (
                  <div style={{ color: '#9CA3AF', fontSize: '13px', marginBottom: '8px' }}>
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
                  <span style={{ color: homeWin ? '#059669' : '#111111', fontSize: '20px', fontWeight: 800 }}>
                    {match.homeTeam.team.name}
                  </span>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', overflow: 'hidden' }}>
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
                      <span style={{ color: homeWin ? '#059669' : '#111111', fontSize: '32px', fontWeight: 900 }}>{match.homeScore}</span>
                      <span style={{ color: '#D4AF37', fontSize: '24px', fontWeight: 800 }}>-</span>
                      <span style={{ color: awayWin ? '#059669' : '#111111', fontSize: '32px', fontWeight: 900 }}>{match.awayScore}</span>
                    </div>
                  ) : (
                    <span style={{ color: '#D4AF37', fontSize: '20px', fontWeight: 800 }}>vs</span>
                  )}
                </div>

                {/* Away Team */}
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: '16px', opacity: homeWin ? 0.6 : 1 }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(0,0,0,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '4px', overflow: 'hidden' }}>
                    {match.awayTeam.team.logoUrl ? (
                      <img src={match.awayTeam.team.logoUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} crossOrigin="anonymous" />
                    ) : (
                      <span style={{ fontSize: '24px' }}>⚽</span>
                    )}
                  </div>
                  <span style={{ color: awayWin ? '#059669' : '#111111', fontSize: '20px', fontWeight: 800 }}>
                    {match.awayTeam.team.name}
                  </span>
                </div>

              </div>
            </div>
          );
        })}
      </div>

      {/* Footer Watermark */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#9CA3AF', fontSize: 12, fontWeight: 700, marginTop: 24 }}>
        <div>sspsleague.com</div>
        <div>Generated on {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
      </div>
    </div>
  );
}
