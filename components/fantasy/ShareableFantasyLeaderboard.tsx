'use client';

import { useRef, useState } from 'react';
import { Trophy, Award } from 'lucide-react';
import { generateContainerPng, downloadPng, shareOrDownloadPng } from '@/lib/utils/export-image';

interface FantasyTeam {
  rank: number;
  team_name: string;
  owner_name?: string;
  total_points: number;
  player_points?: number;
  passive_points?: number;
  supported_team_name?: string;
  player_count?: number;
  last_round_points?: number;
  team_logo?: string;
}

interface ShareableFantasyLeaderboardProps {
  teams: FantasyTeam[];
  leagueName: string;
}

export default function ShareableFantasyLeaderboard({ 
  teams, 
  leagueName
}: ShareableFantasyLeaderboardProps) {
  const leaderboardRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const generateImage = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!leaderboardRef.current) return;

    try {
      setIsGenerating(true);
      const dataUrl = await generateContainerPng(leaderboardRef.current);
      const filename = `${leagueName.replace(/\s+/g, '-')}-fantasy-leaderboard.png`;
      downloadPng(dataUrl, filename);
    } catch (error) {
      console.error('Error generating image:', error);
      alert('Failed to generate image. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  const shareImage = async (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    if (!leaderboardRef.current) return;

    try {
      setIsGenerating(true);
      const dataUrl = await generateContainerPng(leaderboardRef.current);
      const filename = `${leagueName.replace(/\s+/g, '-')}-fantasy-leaderboard.png`;
      await shareOrDownloadPng(dataUrl, filename, `${leagueName} - Fantasy Leaderboard`);
    } catch (error) {
      console.error('Error sharing image:', error);
      alert('Failed to share image. Downloading instead...');
      generateImage();
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="space-y-4 font-mono">
      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); setShowPreview(!showPreview); }}
          className="inline-flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors shadow-md cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
          {showPreview ? 'Hide Preview' : 'Preview Image'}
        </button>

        <button
          type="button"
          onClick={(e) => generateImage(e)}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Generating...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              Download Image
            </>
          )}
        </button>

        <button
          type="button"
          onClick={(e) => shareImage(e)}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs uppercase tracking-wider transition-colors shadow-md disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isGenerating ? (
            <>
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
              Generating...
            </>
          ) : (
            <>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              Share Image
            </>
          )}
        </button>
      </div>

      {/* Offscreen / Preview Snapshot Container for PNG Generation */}
      <div style={{ 
        position: showPreview ? 'relative' : 'fixed', 
        left: showPreview ? '0' : '-9999px', 
        top: '0',
        width: showPreview ? '100%' : '1200px',
        overflow: showPreview ? 'auto' : 'hidden',
        zIndex: showPreview ? 'auto' : '-9999'
      }}>
        <div 
          ref={leaderboardRef}
          style={{
            background: 'linear-gradient(to bottom right, #ffffff, #fdfbf7)',
            padding: '48px',
            fontFamily: 'system-ui, -apple-system, sans-serif',
            width: '1200px',
            boxSizing: 'border-box',
            border: '1px solid rgba(232,168,0,0.2)',
          }}
        >
          {/* Header Section */}
          <div style={{ marginBottom: 36, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '1px solid rgba(232,168,0,0.2)', paddingBottom: '24px' }}>
            <div>
              <div style={{ color: '#E8A800', fontSize: 13, fontWeight: 900, letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 }}>
                FANTASY LEAGUE
              </div>
              <div style={{ color: '#111111', fontSize: 38, fontWeight: 900, letterSpacing: '-0.5px', marginBottom: 4 }}>
                {leagueName}
              </div>
              <div style={{ color: '#6B7280', fontSize: 14, fontWeight: 700, letterSpacing: 1.5, textTransform: 'uppercase' }}>
                Leaderboard Standings
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(232,168,0,0.1)', border: '1px solid rgba(232,168,0,0.2)', padding: '6px 14px', borderRadius: '30px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#E8A800' }}></div>
                <span style={{ color: '#E8A800', fontSize: 11, fontWeight: 900, letterSpacing: 1, textTransform: 'uppercase' }}>OFFICIAL STANDINGS</span>
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div style={{ borderRadius: 16, overflow: 'hidden', border: '1px solid rgba(232,168,0,0.2)', boxShadow: '0 8px 32px rgba(0,0,0,0.05)', background: '#ffffff' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#fcfaf5', borderBottom: '1px solid rgba(232,168,0,0.2)' }}>
                  <th style={{ padding: '16px 10px 16px 20px', textAlign: 'center', color: '#4B5563', fontSize: 12, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', width: '60px' }}>#</th>
                  <th style={{ padding: '16px 20px', textAlign: 'left', color: '#4B5563', fontSize: 12, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' }}>Team / Owner</th>
                  <th style={{ padding: '16px 14px', textAlign: 'center', color: '#2563EB', fontSize: 12, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' }}>Player Pts</th>
                  <th style={{ padding: '16px 14px', textAlign: 'center', color: '#059669', fontSize: 12, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase' }}>Supported Team</th>
                  <th style={{ padding: '16px 20px', textAlign: 'center', color: '#E8A800', fontSize: 12, fontWeight: 900, letterSpacing: 1.5, textTransform: 'uppercase' }}>Total Pts</th>
                </tr>
              </thead>
              <tbody>
                {teams.map((team, index) => {
                  const pos = team.rank || index + 1;
                  const posStyle = 
                    pos === 1 ? { background: 'linear-gradient(135deg, #FFD700, #FFA500)', color: '#0a0a0a', boxShadow: '0 2px 8px rgba(255,215,0,0.4)' } :
                    pos === 2 ? { background: 'linear-gradient(135deg, #E0E0E0, #9E9E9E)', color: '#0a0a0a', boxShadow: '0 2px 8px rgba(192,192,192,0.3)' } :
                    pos === 3 ? { background: 'linear-gradient(135deg, #CD7F32, #8B4513)', color: '#0a0a0a', boxShadow: '0 2px 8px rgba(205,127,50,0.3)' } :
                    { background: 'rgba(0,0,0,0.05)', color: '#6B7280' };

                  return (
                    <tr key={index} style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', background: index % 2 === 0 ? 'transparent' : 'rgba(252,250,245,0.4)' }}>
                      {/* Rank */}
                      <td style={{ padding: '16px 10px 16px 20px', width: '60px' }}>
                        <div style={{ width: 32, height: 32, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 900, margin: '0 auto', ...posStyle }}>
                          {pos}
                        </div>
                      </td>

                      {/* Team & Owner */}
                      <td style={{ padding: '16px 20px' }}>
                        <div style={{ display: 'flex', itemsAlign: 'center', gap: '14px' }}>
                          <div style={{ width: 40, height: 40, borderRadius: '50%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: 'rgba(0,0,0,0.05)', border: '1px solid rgba(0,0,0,0.1)' }}>
                            {team.team_logo ? (
                              <img 
                                src={team.team_logo} 
                                alt={`${team.team_name} logo`}
                                crossOrigin="anonymous"
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  objectFit: 'cover',
                                  objectPosition: `${(team as any).logo_position_x_circle ?? 50}% ${(team as any).logo_position_y_circle ?? 50}%`,
                                  transform: `scale(${(team as any).logo_scale_circle ?? 1})`,
                                  transformOrigin: `${(team as any).logo_position_x_circle ?? 50}% ${(team as any).logo_position_y_circle ?? 50}%`,
                                }}
                              />
                            ) : (
                              <div style={{ fontSize: '14px', fontWeight: '900', color: '#6B7280' }}>
                                {team.team_name.charAt(0).toUpperCase()}
                              </div>
                            )}
                          </div>
                          <div>
                            <span style={{ fontWeight: 900, color: '#111111', fontSize: 16, textTransform: 'uppercase', display: 'block' }}>
                              {team.team_name?.toUpperCase()}
                            </span>
                            {team.owner_name && (
                              <span style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', display: 'block', marginTop: '2px' }}>
                                Owner: {team.owner_name}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Player Points */}
                      <td style={{ padding: '16px 14px', textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', background: 'rgba(37,99,235,0.1)', color: '#2563EB', border: '1px solid rgba(37,99,235,0.2)', padding: '4px 12px', borderRadius: '8px', fontSize: 15, fontWeight: 900 }}>
                          {team.player_points || 0} PTS
                        </span>
                      </td>

                      {/* Supported Team & Passive Points */}
                      <td style={{ padding: '16px 14px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#111111', textTransform: 'uppercase' }}>
                            {team.supported_team_name || 'N/A'}
                          </span>
                          <span style={{ display: 'inline-block', background: 'rgba(5,150,105,0.1)', color: '#059669', border: '1px solid rgba(5,150,105,0.2)', padding: '2px 8px', borderRadius: '6px', fontSize: 12, fontWeight: 800, marginTop: '3px' }}>
                            +{team.passive_points || 0} PTS
                          </span>
                        </div>
                      </td>

                      {/* Total Points */}
                      <td style={{ padding: '16px 20px', textAlign: 'center' }}>
                        <span style={{ fontSize: 20, fontWeight: 900, color: '#E8A800' }}>
                          {team.total_points}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer Watermark */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', color: '#9CA3AF', fontSize: 12, fontWeight: 700, marginTop: 24, paddingTop: 16, borderTop: '1px solid rgba(0,0,0,0.05)' }}>
            <div>sspsleague.com • Fantasy League</div>
            <div>Generated on {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
