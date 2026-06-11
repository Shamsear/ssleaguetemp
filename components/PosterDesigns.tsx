/**
 * PosterDesigns.tsx — v4
 * Professional Football Poster Components
 * Fonts injected inline as <style> so html-to-image captures them correctly.
 * Posters are fixed at 800×1000px — scale is the caller's responsibility.
 */

import React from 'react';

// ─── Helper Functions ─────────────────────────────────────────────────────────

/**
 * Get image URL without any transformations
 * Returns original ImageKit URL as-is for client-side processing
 * Use manual background removal button with @imgly/background-removal for bg removal
 */
function getImageWithBgRemoval(imageUrl: string | undefined): string {
  if (!imageUrl) {
    console.warn('⚠️ No image URL provided, using placeholder');
    return '/images/player-placeholder.png';
  }
  
  console.log('✅ Returning original image URL (no API transformations):', imageUrl);
  return imageUrl;
}

// Backwards compatibility wrapper for player photos
function getPlayerImageWithBgRemoval(photoUrl: string | undefined): string {
  return getImageWithBgRemoval(photoUrl);
}

/**
 * Standard image error handler with detailed logging
 * No automatic background removal - use manual button instead
 */
function handleImageError(context: string, player: any, imageType: 'player' | 'team') {
  return (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    const target = e.currentTarget;
    const currentSrc = target.src;
    
    console.warn(`⚠️ Image Load Issue [${context}]:`, {
      context,
      imageType,
      player_name: player.player_name,
      team_name: player.team_name,
      url: currentSrc,
      originalPlayerPhoto: player.player_photo,
      originalPhotoUrl: player.photo_url,
      originalTeamLogo: player.team_logo,
      error: e.type,
      naturalWidth: target.naturalWidth,
      naturalHeight: target.naturalHeight,
      complete: target.complete,
      timestamp: new Date().toISOString()
    });
    
    // For failed team logos, hide them
    if (imageType === 'team') {
      console.log(`👻 Hiding failed team logo for ${player.team_name}`);
      target.style.display = 'none';
    }
    
    // For player photos, show a message suggesting manual background removal
    if (imageType === 'player') {
      console.log(`💡 Tip: Use the "🪄 Remove Background" button in Photo Controls for background removal`);
    }
  };
}

/**
 * Standard image load success handler
 */
function handleImageLoad(context: string, player: any, imageType: 'player' | 'team') {
  return () => {
    console.log(`✅ Image Loaded [${context}]:`, {
      context,
      imageType,
      player_name: player.player_name,
      team_name: player.team_name
    });
  };
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PlayerStats {
  player_id: string;
  player_name: string;
  team_name: string;
  matches_played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_scored: number;
  goals_conceded: number;
  goal_difference: number;
  clean_sheets: number;
  motm_awards: number;
  win_rate: number;
  points: number;
  player_photo?: string;
  photo_url?: string; // Support both field names
  team_logo?: string;
}

export interface Theme {
  label: string;
  emoji: string;
  bg: string[];
  accent: string;
  accent2: string;
  glow: string;
  tagline: string;
}

export interface SinglePlayerDesignProps {
  player: PlayerStats;
  theme: Theme;
  themeKey: string;
  week?: string;
  LogoBranding: React.ComponentType<{ size?: number }>;
  photoPosition?: { x: number; y: number };
  photoScale?: number;
  photoCrop?: { width: number; height: number; top?: number; left?: number; right?: number; bottom?: number };
  logoPosition?: { x: number; y: number };
  logoScale?: number;
  logoCrop?: { width: number; height: number; top?: number; left?: number; right?: number; bottom?: number };
  removeDividers?: boolean; // Option to remove gold divider lines
  seasonId?: string; // Season ID to display vertically
  selectedRound?: number; // Round/matchday number
  photoContainerRef?: React.RefObject<HTMLDivElement>;
  logoContainerRef?: React.RefObject<HTMLDivElement>;
}

export interface TableDesignProps {
  players: PlayerStats[];
  theme: Theme;
  themeKey: string;
  week?: string;
  LogoBranding: React.ComponentType<{ size?: number }>;
  startRank?: number; // Starting rank for pagination
  endRank?: number; // Ending rank for pagination
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GOLD        = '#d4a830';
const GOLD_BRIGHT = '#f0d060';
const GOLD_DIM    = 'rgba(212,168,48,0.35)';
const BG          = '#09090b';

/** Fonts as a <style> tag — works with html-to-image (no cross-origin fetch) */
const FontStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=Oswald:wght@400;500;600;700&family=Anton&family=Teko:wght@600;700&display=swap');
    .poster-root * { box-sizing: border-box; }
  `}</style>
);

/** Repeating dot-grid background texture */
function DotGrid() {
  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0.15, pointerEvents: 'none', zIndex: 1 }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern id="dotgrid" x="0" y="0" width="24" height="24" patternUnits="userSpaceOnUse">
          <circle cx="2" cy="2" r="1.2" fill="#b8912a" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#dotgrid)" />
    </svg>
  );
}

/** Diagonal-line texture */
function DiagLines() {
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
      backgroundImage: 'repeating-linear-gradient(-52deg, transparent, transparent 28px, rgba(180,140,30,0.03) 28px, rgba(180,140,30,0.03) 29px)',
    }} />
  );
}

/** Glowing orb */
function GlowOrb({ top, right, bottom, left, size, alpha }: { top?: number; right?: number; bottom?: number; left?: number; size: number; alpha: number }) {
  return (
    <div style={{
      position: 'absolute', zIndex: 0, pointerEvents: 'none',
      top: top !== undefined ? top : undefined,
      right: right !== undefined ? right : undefined,
      bottom: bottom !== undefined ? bottom : undefined,
      left: left !== undefined ? left : undefined,
      width: size, height: size, borderRadius: '50%',
      background: `radial-gradient(circle, rgba(212,168,48,${alpha}) 0%, transparent 65%)`,
    }} />
  );
}

const AWARD_ACTIVE: Record<string, [boolean, boolean, boolean]> = {
  'golden-boot':   [true,  false, false],
  'golden-ball':   [false, true,  false],
  'golden-glove':  [false, false, true],
  'player-of-day': [false, false, false],
  'player-of-week':[false, false, false],
  'team-of-day':   [false, false, false],
  'team-of-week':  [false, false, false],
  'full-stats':    [false, false, false],
};

const RANK_META = [
  { color: '#ffd700', shadow: '0 0 10px rgba(255,215,0,0.55)',   size: 22, stripe: '#ffd700' },
  { color: '#c0c0c0', shadow: '0 0 8px rgba(192,192,192,0.45)',  size: 20, stripe: '#c0c0c0' },
  { color: '#cd7f32', shadow: '0 0 8px rgba(205,127,50,0.45)',   size: 20, stripe: '#cd7f32' },
];

// ─── Gold stripe ──────────────────────────────────────────────────────────────

const GoldStripe = () => (
  <div style={{
    position: 'absolute', top: 0, left: 0, right: 0, height: 3, zIndex: 30,
    background: `linear-gradient(90deg, transparent, #b8912a 20%, ${GOLD_BRIGHT} 50%, #b8912a 80%, transparent)`,
  }} />
);

// ─── Vertical watermark ───────────────────────────────────────────────────────

const VWatermark = () => (
  <div style={{
    position: 'absolute', right: 7, top: 0, bottom: 0, zIndex: 2, pointerEvents: 'none',
    display: 'flex', flexDirection: 'column', justifyContent: 'space-around',
    writingMode: 'vertical-rl',
    fontFamily: '"DM Sans", sans-serif', fontSize: 7, fontWeight: 600,
    letterSpacing: 3, color: 'rgba(212,168,48,0.07)',
  }}>
    {Array(18).fill('SSPSLSI6').map((t, i) => <span key={i}>{t}</span>)}
  </div>
);

// ─── Award chips ─────────────────────────────────────────────────────────────

function AwardChips({ themeKey }: { themeKey: string }) {
  const [aB, aBl, aG] = AWARD_ACTIVE[themeKey] ?? [false, false, false];
  const chips = [{ icon: '👟', on: aB }, { icon: '⚽', on: aBl }, { icon: '🧤', on: aG }];
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
      {chips.map((a, i) => (
        <div key={i} style={{
          width: 34, height: 34, borderRadius: 8, fontSize: 17,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${a.on ? GOLD_DIM : 'rgba(212,168,48,0.1)'}`,
          background: a.on ? 'rgba(212,168,48,0.14)' : 'rgba(212,168,48,0.03)',
          opacity: a.on ? 1 : 0.28,
        }}>{a.icon}</div>
      ))}
    </div>
  );
}

// ─── Shared label style ───────────────────────────────────────────────────────

const lbl: React.CSSProperties = {
  fontFamily: '"DM Sans", sans-serif',
  fontSize: 9, fontWeight: 600, letterSpacing: 4,
  textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)',
  marginBottom: 6,
  textAlign: 'right',
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: `linear-gradient(90deg, ${GOLD_DIM}, rgba(212,168,48,0.04))`,
  margin: '8px 0',
};

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER OF THE WEEK DESIGN
// ═══════════════════════════════════════════════════════════════════════════════

function PlayerOfWeekDesign({ 
  player, 
  theme, 
  seasonId,
  selectedRound,
  photoPosition = { x: 50, y: 50 },
  photoScale = 100,
  photoCrop = { width: 100, height: 100 },
  logoPosition = { x: 50, y: 50 },
  logoScale = 100,
  logoCrop = { width: 100, height: 100 }
}: { 
  player: PlayerStats;
  theme: Theme;
  seasonId: string;
  selectedRound: number;
  photoPosition?: { x: number; y: number };
  photoScale?: number;
  photoCrop?: { width: number; height: number };
  logoPosition?: { x: number; y: number };
  logoScale?: number;
  logoCrop?: { width: number; height: number };
}) {
  // Debug logging
  console.log('[PlayerOfWeekDesign] Player data:', {
    player_id: player.player_id,
    player_name: player.player_name,
    team_name: player.team_name,
    player_photo: player.player_photo,
    photo_url: player.photo_url,
    team_logo: player.team_logo,
    allKeys: Object.keys(player)
  });
  
  // Use background-removed photo like other designs
  const playerPhotoUrl = getPlayerImageWithBgRemoval(player.player_photo || player.photo_url);
  const teamLogoUrl = getImageWithBgRemoval(player.team_logo);
  
  console.log('[PlayerOfWeekDesign] Processed URLs:', {
    playerPhotoUrl,
    teamLogoUrl
  });

  return (
    <div className="poster-root" style={{ width: 800, height: 1000, background: '#1a1a2e', position: 'relative', overflow: 'hidden', fontFamily: '"DM Sans", sans-serif' }}>
      <FontStyles />
      
      {/* Large "PLAYER OF THE WEEK" text - Top left corner, behind content */}
      <div style={{
        position: 'absolute',
        top: -40,
        left: -30,
        zIndex: 100,
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        <div style={{
          fontFamily: '"Anton", sans-serif',
          fontSize: 140,
          fontWeight: 400,
          fontStyle: 'italic',
          color: 'transparent',
          WebkitTextStroke: '1px rgba(212,168,48,0.15)',
          textStroke: '1px rgba(212,168,48,0.15)',
          letterSpacing: 8,
          lineHeight: 1.0,
          textTransform: 'uppercase',
        }}>
          PLAYER<br/>OF THE<br/>WEEK
        </div>
      </div>
      
      {/* Vertical Season ID - Right Side */}
      <div style={{
        position: 'absolute',
        right: 0,
        top: 30,
        bottom: 50,
        width: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-around',
        gap: 10.5,
        padding: '20px 0',
        zIndex: 100,
        fontFamily: '"DM Sans", sans-serif',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 1,
        textTransform: 'uppercase',
        overflow: 'hidden',
      }}>
        {Array.from({ length: 13 }).map((_, i) => (
          <span key={`right-${i}`} style={{
            color: i % 2 === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(212,168,48,0.4)',
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
          }}>
            {seasonId}
          </span>
        ))}
      </div>

      {/* Horizontal Season ID - Bottom */}
      <div style={{
        position: 'absolute',
        bottom: 15,
        left: 0,
        right: 0,
        height: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        gap: 20,
        padding: '0 20px',
        zIndex: 100,
        fontFamily: '"DM Sans", sans-serif',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.4)',
      }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={`bottom-${i}`} style={{
            color: i % 2 === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(212,168,48,0.4)',
          }}>
            {seasonId}
          </span>
        ))}
      </div>

      {/* Main Content Area */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        zIndex: 10,
      }}>
        {/* Large "PLAYER OF THE WEEK" text - Top left corner, behind panels */}
        <div style={{
          position: 'absolute',
          top: -40,
          left: -30,
          zIndex: 20,
          pointerEvents: 'none',
          userSelect: 'none',
        }}>
          <div style={{
            fontFamily: '"Anton", sans-serif',
            fontSize: 140,
            fontWeight: 400,
            fontStyle: 'italic',
            color: 'transparent',
            WebkitTextStroke: '1px rgba(212,168,48,0.15)',
            textStroke: '1px rgba(212,168,48,0.15)',
            letterSpacing: 8,
            lineHeight: 1.0,
            textTransform: 'uppercase',
          }}>
            PLAYER<br/>OF THE<br/>WEEK
          </div>
        </div>
        
        {/* Left Panel - Dark Background with Stats */}
        <div style={{
          width: '45%',
          background: 'linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 50%, #16162a 100%)',
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          padding: '40px 35px 50px 40px',
        }}>
          {/* Background Text Elements - Inside left panel */}
          <div style={{
            position: 'absolute',
            top: '45%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(2deg)',
            fontFamily: '"Anton", sans-serif',
            fontSize: 200,
            fontWeight: 400,
            color: 'transparent',
            WebkitTextStroke: '1px rgba(212,168,48,0.05)',
            textStroke: '1px rgba(212,168,48,0.05)',
            zIndex: 1,
            pointerEvents: 'none',
            userSelect: 'none',
            lineHeight: 1,
          }}>
            STAR
          </div>
          
          {/* Large Background Text "PLAYER" */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-90deg)',
            fontFamily: '"Anton", sans-serif',
            fontSize: 280,
            fontWeight: 400,
            color: 'rgba(255,255,255,0.03)',
            zIndex: 1,
            pointerEvents: 'none',
            userSelect: 'none',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}>
            PLAYER
          </div>

          {/* Title Section */}
          <div style={{
            position: 'relative',
            zIndex: 10,
            marginBottom: 20,
          }}>
            <div style={{
              fontFamily: '"Anton", sans-serif',
              fontSize: 38,
              color: GOLD,
              letterSpacing: 3,
              lineHeight: 1.1,
              fontWeight: 400,
              fontStyle: 'italic',
              textShadow: `0 0 20px rgba(212,168,48,0.4)`,
            }}>
              PLAYER<br/>OF THE<br/>WEEK
            </div>
            
            {/* Team Logo and Name */}
            <div style={{
              marginTop: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 10,
            }}>
              {teamLogoUrl && (
                <div 
                  data-logo-container="true"
                  style={{
                  width: `${80 * (logoCrop.width / 100)}px`,
                  height: `${80 * (logoCrop.height / 100)}px`,
                  overflow: 'hidden',
                  position: 'relative',
                  filter: 'drop-shadow(0 2px 8px rgba(0,0,0,0.5))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <img
                    src={teamLogoUrl}
                    alt={player.team_name}
                    crossOrigin="anonymous"
                    style={{
                      width: `${(100 / logoCrop.width) * 100}%`,
                      height: `${(100 / logoCrop.height) * 100}%`,
                      objectFit: 'contain',
                      objectPosition: `${logoPosition.x}% ${logoPosition.y}%`,
                      transform: `scale(${logoScale / 100})`,
                      transformOrigin: `${logoPosition.x}% ${logoPosition.y}%`,
                      clipPath: `inset(${logoCrop.top || 0}% ${logoCrop.right || 0}% ${logoCrop.bottom || 0}% ${logoCrop.left || 0}%)`,
                    }}
                    onError={handleImageError('Player of Week - Team Logo', player, 'team')}
                    onLoad={handleImageLoad('Player of Week - Team Logo', player, 'team')}
                  />
                </div>
              )}
              <div style={{
                fontFamily: '"DM Sans", sans-serif',
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.7)',
              }}>
                {player.team_name}
              </div>
            </div>
          </div>

          {/* Player Name */}
          <div style={{
            position: 'relative',
            zIndex: 10,
            marginBottom: 50,
          }}>
            <div style={{
              fontFamily: '"Anton", sans-serif',
              fontSize: 56,
              color: '#ffffff',
              letterSpacing: 3,
              lineHeight: 0.95,
              fontWeight: 400,
              textTransform: 'uppercase',
              textShadow: '0 2px 15px rgba(0,0,0,0.6)',
            }}>
              {player.player_name}
            </div>
          </div>

          {/* Stats Section */}
          <div style={{
            position: 'relative',
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 25,
            flex: 1,
          }}>
            {[
              { label: 'MATCHES', value: String(player.matches_played).padStart(2, '0') },
              { label: 'WINS', value: String(player.wins).padStart(2, '0') },
              { label: 'LOSS', value: String(player.losses).padStart(2, '0') },
              { label: 'DRAW', value: String(player.draws).padStart(2, '0') },
              { label: 'GOALS', value: String(player.goals_scored).padStart(2, '0') },
            ].map((stat, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}>
                <div style={{
                  fontFamily: '"DM Sans", sans-serif',
                  fontSize: 16,
                  fontWeight: 600,
                  letterSpacing: 3,
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.6)',
                }}>
                  {stat.label}
                </div>
                <div style={{
                  fontFamily: '"Anton", sans-serif',
                  fontSize: 56,
                  color: GOLD,
                  lineHeight: 1,
                  fontWeight: 400,
                  textShadow: `0 0 20px rgba(212,168,48,0.3)`,
                }}>
                  {stat.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Panel - Player Photo */}
        <div style={{
          width: '55%',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Background Text Elements - Inside right panel */}
          <div style={{
            position: 'absolute',
            top: 100,
            right: -40,
            fontFamily: '"Anton", sans-serif',
            fontSize: 200,
            fontWeight: 400,
            color: 'transparent',
            WebkitTextStroke: '1px rgba(212,168,48,0.06)',
            textStroke: '1px rgba(212,168,48,0.06)',
            zIndex: 1,
            pointerEvents: 'none',
            userSelect: 'none',
            lineHeight: 1,
            transform: 'rotate(10deg)',
          }}>
            WEEK
          </div>
          
          <div style={{
            position: 'absolute',
            top: 400,
            left: -30,
            fontFamily: '"Teko", sans-serif',
            fontSize: 160,
            fontWeight: 600,
            color: 'rgba(212,168,48,0.04)',
            zIndex: 1,
            pointerEvents: 'none',
            userSelect: 'none',
            lineHeight: 1,
            letterSpacing: 8,
            transform: 'rotate(-8deg)',
          }}>
            GOALS
          </div>
          
          {/* Large Background Text "WEEK" - Behind player */}
          <div style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            fontFamily: '"Anton", sans-serif',
            fontSize: 320,
            fontWeight: 400,
            color: 'transparent',
            WebkitTextStroke: '2px rgba(212,168,48,0.15)',
            textStroke: '2px rgba(212,168,48,0.15)',
            zIndex: 1,
            pointerEvents: 'none',
            userSelect: 'none',
            lineHeight: 1,
            whiteSpace: 'nowrap',
          }}>
            WEEK
          </div>

          {/* Player Photo - Direct positioning, above text and borders */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            width: '100%',
            height: '100%',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
            zIndex: 5,
          }}>
            <div 
              data-photo-container="true"
              style={{
              position: 'relative',
              width: `${photoCrop.width}%`,
              height: `${photoCrop.height}%`,
              overflow: 'hidden',
            }}>
              <img
                src={playerPhotoUrl}
                alt={player.player_name}
                crossOrigin="anonymous"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: `${(100 / photoCrop.width) * 100}%`,
                  height: `${(100 / photoCrop.height) * 100}%`,
                  objectFit: 'cover',
                  objectPosition: `${photoPosition.x}% ${photoPosition.y}%`,
                  transform: `translate(calc(-50% + ${(photoPosition.x - 50) * 0.5}px), calc(-50% + ${(photoPosition.y - 50) * 0.5}px)) scale(${photoScale / 100})`,
                  transformOrigin: 'center center',
                  filter: 'drop-shadow(0 10px 40px rgba(0,0,0,0.7))',
                  clipPath: `inset(${photoCrop.top || 0}% ${photoCrop.right || 0}% ${photoCrop.bottom || 0}% ${photoCrop.left || 0}%)`,
                }}
                onError={handleImageError('Player of Week - Main Photo', player, 'player')}
                onLoad={handleImageLoad('Player of Week - Main Photo', player, 'player')}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Player Photo Overlay - Positioned at root level to appear above borders */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: '45%',
        right: 0,
        bottom: 0,
        zIndex: 60,
        pointerEvents: 'none',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'flex-start',
      }}>
        <div style={{
          position: 'relative',
          width: `${photoCrop.width * 1.2222}%`,
          height: `${photoCrop.height}%`,
          overflow: 'hidden',
        }}>
          <img
            src={playerPhotoUrl}
            alt={player.player_name}
            crossOrigin="anonymous"
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: `${(100 / photoCrop.width) * 100}%`,
              height: `${(100 / photoCrop.height) * 100}%`,
              objectFit: 'cover',
              objectPosition: `${photoPosition.x}% ${photoPosition.y}%`,
              transform: `translate(calc(-50% + ${(photoPosition.x - 50) * 0.5}px), calc(-50% + ${(photoPosition.y - 50) * 0.5}px)) scale(${photoScale / 100})`,
              transformOrigin: 'center center',
              filter: 'drop-shadow(0 10px 40px rgba(0,0,0,0.7))',
              clipPath: `inset(${photoCrop.top || 0}% ${photoCrop.right || 0}% ${photoCrop.bottom || 0}% ${photoCrop.left || 0}%)`,
            }}
            onError={handleImageError('Player of Week - Overlay Photo', player, 'player')}
            onLoad={handleImageLoad('Player of Week - Overlay Photo', player, 'player')}
          />
        </div>
      </div>

      {/* Bottom Gold Gradient Overlay - Bottom Right Corner - Outside content area */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 500,
        height: 400,
        zIndex: 65,
        pointerEvents: 'none',
        background: 'radial-gradient(circle at 100% 100%, rgba(212, 168, 48, 0.4) 0%, rgba(184, 145, 42, 0.2) 25%, transparent 60%)',
      }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEAM OF THE WEEK DESIGN (Same as Player of Week - Single Player with Team Stats)
// ═══════════════════════════════════════════════════════════════════════════════

interface TeamOfWeekAward {
  week?: number;
  player_id?: string;
  player_name?: string;
  team_name?: string;
  player_photo?: string;
  team_logo?: string;
  performance_stats?: {
    wins: number;
    draws: number;
    losses: number;
    points: number;
    goals_for: number;
    clean_sheets: number;
    goals_against: number;
    rounds_played: number[];
    matches_played: number;
    goal_difference: number;
  };
}

export function TeamOfWeekDesign({ 
  award, 
  theme, 
  seasonId,
  LogoBranding,
  photoPosition = { x: 50, y: 50 },
  photoScale = 100,
  photoCrop = { width: 100, height: 100 },
  logoPosition = { x: 50, y: 50 },
  logoScale = 100,
  logoCrop = { width: 100, height: 100 }
}: { 
  award: TeamOfWeekAward;
  theme: Theme;
  seasonId?: string;
  LogoBranding: React.ComponentType<{ size?: number }>;
  photoPosition?: { x: number; y: number };
  photoScale?: number;
  photoCrop?: { width: number; height: number };
  logoPosition?: { x: number; y: number };
  logoScale?: number;
  logoCrop?: { width: number; height: number };
}) {
  const GOLD = '#d4a830';
  const stats = award.performance_stats;
  
  // Use player photo from award
  const playerPhotoUrl = getPlayerImageWithBgRemoval(award.player_photo);
  const teamLogoUrl = getImageWithBgRemoval(award.team_logo);

  return (
    <div className="poster-root" style={{ width: 800, height: 1000, background: '#1a1a2e', position: 'relative', overflow: 'hidden', fontFamily: '"DM Sans", sans-serif' }}>
      <FontStyles />
      
      {/* Large "TEAM OF THE WEEK" text - Top left corner - Above everything */}
      <div style={{
        position: 'absolute',
        top: -40,
        left: -30,
        zIndex: 100,
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        <div style={{
          fontFamily: '"Anton", sans-serif',
          fontSize: 140,
          fontWeight: 400,
          fontStyle: 'italic',
          color: 'transparent',
          WebkitTextStroke: '1px rgba(212,168,48,0.15)',
          letterSpacing: 8,
          lineHeight: 1.0,
          textTransform: 'uppercase',
        }}>
          TEAM<br/>OF THE<br/>WEEK
        </div>
      </div>
      
      {/* Vertical Season ID - Right Side */}
      {seasonId && (
        <div style={{
          position: 'absolute',
          right: 0,
          top: 30,
          bottom: 50,
          width: 50,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'space-around',
          gap: 10.5,
          padding: '20px 0',
          zIndex: 50,
          fontFamily: '"DM Sans", sans-serif',
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: 1,
          textTransform: 'uppercase',
          overflow: 'hidden',
        }}>
          {Array.from({ length: 13 }).map((_, i) => (
            <span key={`right-${i}`} style={{
              color: i % 2 === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(212,168,48,0.4)',
              writingMode: 'vertical-rl',
              transform: 'rotate(180deg)',
            }}>
              {seasonId}
            </span>
          ))}
        </div>
      )}

      {/* Horizontal Season ID - Bottom */}
      {seasonId && (
        <div style={{
          position: 'absolute',
          bottom: 15,
          left: 0,
          right: 0,
          height: 50,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          gap: 20,
          padding: '0 20px',
          zIndex: 50,
          fontFamily: '"DM Sans", sans-serif',
          fontSize: 13,
          fontWeight: 600,
          letterSpacing: 1,
          textTransform: 'uppercase',
        }}>
          {Array.from({ length: 9 }).map((_, i) => (
            <span key={`bottom-${i}`} style={{
              color: i % 2 === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(212,168,48,0.4)',
            }}>
              {seasonId}
            </span>
          ))}
        </div>
      )}

      {/* Main Content Area - 45% Left + 55% Right */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: 'flex',
        zIndex: 10,
      }}>
        {/* Left Panel - Dark Background with Stats */}
        <div style={{
          width: '45%',
          background: 'linear-gradient(135deg, #0f0f1e 0%, #1a1a2e 50%, #16162a 100%)',
          position: 'relative',
          padding: '40px 35px 50px 40px',
          display: 'flex',
          flexDirection: 'column',
          zIndex: 20,
        }}>
          {/* Background Text - "TEAM" - Moved down */}
          <div style={{
            position: 'absolute',
            top: 650,
            left: -60,
            zIndex: 1,
            pointerEvents: 'none',
            userSelect: 'none',
          }}>
            <div style={{
              fontFamily: '"Anton", sans-serif',
              fontSize: 200,
              fontWeight: 400,
              fontStyle: 'italic',
              color: 'transparent',
              WebkitTextStroke: '1px rgba(212,168,48,0.06)',
              letterSpacing: 4,
              lineHeight: 0.85,
              textTransform: 'uppercase',
              transform: 'rotate(-90deg)',
            }}>
              TEAM
            </div>
          </div>

          {/* Title */}
          <div style={{
            position: 'relative',
            zIndex: 10,
            marginBottom: 20,
          }}>
            <div style={{
              fontFamily: '"Anton", sans-serif',
              fontSize: 38,
              color: GOLD,
              letterSpacing: 3,
              lineHeight: 1.1,
              fontWeight: 400,
              fontStyle: 'italic',
              textShadow: `0 0 20px rgba(212,168,48,0.4)`,
            }}>
              TEAM<br/>OF THE<br/>WEEK
            </div>
            
            {/* Team Logo and Name */}
            <div style={{
              marginTop: 20,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: 15,
            }}>
              {teamLogoUrl && (
                <div style={{
                  width: 120,
                  height: 120,
                  overflow: 'hidden',
                  position: 'relative',
                  filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))',
                }}>
                  <img
                    src={teamLogoUrl}
                    alt={award.team_name}
                    crossOrigin="anonymous"
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'contain',
                      objectPosition: `${logoPosition.x}% ${logoPosition.y}%`,
                      transform: `scale(${logoScale / 100})`,
                      transformOrigin: `${logoPosition.x}% ${logoPosition.y}%`,
                      ...(logoCrop.width < 100 || logoCrop.height < 100 ? {
                        clipPath: `inset(${(100 - logoCrop.height) / 2}% ${(100 - logoCrop.width) / 2}% ${(100 - logoCrop.height) / 2}% ${(100 - logoCrop.width) / 2}%)`
                      } : {})
                    }}
                    onError={handleImageError('Team of Week - Team Logo', award, 'team')}
                    onLoad={handleImageLoad('Team of Week - Team Logo', award, 'team')}
                  />
                </div>
              )}
              <div style={{
                fontFamily: '"Anton", sans-serif',
                fontSize: 28,
                fontWeight: 400,
                letterSpacing: 2,
                textTransform: 'uppercase',
                color: '#ffffff',
                textShadow: '0 3px 12px rgba(0,0,0,0.6), 0 0 20px rgba(212,168,48,0.2)',
                lineHeight: 1.2,
              }}>
                {award.team_name}
              </div>
            </div>
          </div>

          {/* Player Name */}
          <div style={{
            position: 'relative',
            zIndex: 10,
            marginBottom: 50,
          }}>
            <div style={{
              fontFamily: '"Anton", sans-serif',
              fontSize: 56,
              color: '#ffffff',
              letterSpacing: 3,
              lineHeight: 0.95,
              fontWeight: 400,
              textTransform: 'uppercase',
              textShadow: '0 2px 15px rgba(0,0,0,0.6)',
            }}>
              {award.player_name}
            </div>
          </div>

          {/* Stats Section */}
          {stats && (
            <div style={{
              position: 'relative',
              zIndex: 10,
              display: 'flex',
              flexDirection: 'column',
              gap: 25,
              flex: 1,
            }}>
              {[
                { label: 'MATCHES', value: String(stats.matches_played).padStart(2, '0') },
                { label: 'WINS', value: String(stats.wins).padStart(2, '0') },
                { label: 'LOSS', value: String(stats.losses).padStart(2, '0') },
                { label: 'DRAW', value: String(stats.draws).padStart(2, '0') },
                { label: 'GOALS', value: String(stats.goals_for).padStart(2, '0') },
              ].map((stat, i) => (
                <div key={i} style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}>
                  <div style={{
                    fontFamily: '"DM Sans", sans-serif',
                    fontSize: 16,
                    fontWeight: 600,
                    letterSpacing: 3,
                    textTransform: 'uppercase',
                    color: 'rgba(255,255,255,0.6)',
                  }}>
                    {stat.label}
                  </div>
                  <div style={{
                    fontFamily: '"Anton", sans-serif',
                    fontSize: 56,
                    color: GOLD,
                    lineHeight: 1,
                    fontWeight: 400,
                    textShadow: `0 0 20px rgba(212,168,48,0.3)`,
                  }}>
                    {stat.value}
                  </div>
                </div>
              ))}
            </div>
          )}

        </div>

        {/* Right Panel - Player Photo */}
        <div style={{
          width: '55%',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Background Text - "WEEK" */}
          <div style={{
            position: 'absolute',
            top: 100,
            right: -40,
            fontFamily: '"Anton", sans-serif',
            fontSize: 200,
            fontWeight: 400,
            color: 'transparent',
            WebkitTextStroke: '1px rgba(212,168,48,0.06)',
            zIndex: 1,
            pointerEvents: 'none',
            userSelect: 'none',
            lineHeight: 1,
            letterSpacing: 8,
          }}>
            WEEK
          </div>
          
          <div style={{
            position: 'absolute',
            bottom: 150,
            right: -20,
            fontFamily: '"Anton", sans-serif',
            fontSize: 160,
            fontWeight: 400,
            color: 'transparent',
            WebkitTextStroke: '1px rgba(212,168,48,0.05)',
            zIndex: 1,
            pointerEvents: 'none',
            userSelect: 'none',
            lineHeight: 1,
            letterSpacing: 8,
          }}>
            GOALS
          </div>

          {/* Player Photo - With positioning controls, full height from top */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            overflow: 'visible',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            zIndex: 60,
          }}>
            <div 
              data-photo-container="true"
              style={{
              position: 'relative',
              width: '100%',
              height: '100%',
              overflow: 'visible',
            }}>
              <img
                src={playerPhotoUrl}
                alt={award.player_name}
                crossOrigin="anonymous"
                style={{
                  position: 'absolute',
                  top: `${photoPosition.y - 50}%`,
                  left: `${photoPosition.x - 50}%`,
                  width: 'auto',
                  height: `${photoScale}%`,
                  objectFit: 'contain',
                  objectPosition: 'top center',
                  transform: `scale(${photoScale / 100})`,
                  transformOrigin: 'top center',
                  filter: 'drop-shadow(0 10px 40px rgba(0,0,0,0.7))',
                }}
                onError={handleImageError('Team of Week - Player Photo', award, 'player')}
                onLoad={handleImageLoad('Team of Week - Player Photo', award, 'player')}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Gold Gradient Overlay */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        right: 0,
        width: 500,
        height: 400,
        zIndex: 65,
        pointerEvents: 'none',
        background: 'radial-gradient(circle at 100% 100%, rgba(212, 168, 48, 0.4) 0%, rgba(184, 145, 42, 0.2) 25%, transparent 60%)',
      }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER OF THE DAY DESIGN
// ═══════════════════════════════════════════════════════════════════════════════

function PlayerOfDayDesign({ 
  player, 
  theme, 
  seasonId,
  selectedRound,
  photoPosition = { x: 50, y: 50 },
  photoScale = 100,
  photoCrop = { width: 100, height: 100 },
  logoPosition = { x: 50, y: 50 },
  logoScale = 100,
  logoCrop = { width: 100, height: 100 }
}: { 
  player: PlayerStats;
  theme: Theme;
  seasonId: string;
  selectedRound: number;
  photoPosition?: { x: number; y: number };
  photoScale?: number;
  photoCrop?: { width: number; height: number };
  logoPosition?: { x: number; y: number };
  logoScale?: number;
  logoCrop?: { width: number; height: number };
}) {
  // Debug logging
  console.log('[PlayerOfDayDesign] Player data:', {
    player_id: player.player_id,
    player_name: player.player_name,
    team_name: player.team_name,
    player_photo: player.player_photo,
    photo_url: player.photo_url,
    team_logo: player.team_logo,
    allKeys: Object.keys(player)
  });
  
  const playerPhotoUrl = getPlayerImageWithBgRemoval(player.player_photo || player.photo_url);
  const teamLogoUrl = getImageWithBgRemoval(player.team_logo);
  
  console.log('[PlayerOfDayDesign] Processed URLs:', {
    playerPhotoUrl,
    teamLogoUrl
  });

  return (
    <div className="poster-root" style={{ width: 800, height: 1000, background: '#0a0a0a', position: 'relative', overflow: 'hidden', fontFamily: '"DM Sans", sans-serif' }}>
      <FontStyles />
      
      {/* Large Background Text Elements */}
      <div style={{
        position: 'absolute',
        top: 100,
        left: -50,
        fontFamily: '"Anton", sans-serif',
        fontSize: 180,
        fontWeight: 400,
        color: 'transparent',
        WebkitTextStroke: '1px rgba(212,168,48,0.08)',
        textStroke: '1px rgba(212,168,48,0.08)',
        zIndex: 1,
        pointerEvents: 'none',
        userSelect: 'none',
        lineHeight: 1,
        transform: 'rotate(-5deg)',
      }}>
        PLAYER
      </div>
      
      <div style={{
        position: 'absolute',
        top: 250,
        right: -80,
        fontFamily: '"Anton", sans-serif',
        fontSize: 160,
        fontWeight: 400,
        color: 'transparent',
        WebkitTextStroke: '1px rgba(212,168,48,0.06)',
        textStroke: '1px rgba(212,168,48,0.06)',
        zIndex: 1,
        pointerEvents: 'none',
        userSelect: 'none',
        lineHeight: 1,
        transform: 'rotate(8deg)',
      }}>
        OF THE
      </div>
      
      <div style={{
        position: 'absolute',
        bottom: 200,
        left: -30,
        fontFamily: '"Anton", sans-serif',
        fontSize: 200,
        fontWeight: 400,
        color: 'transparent',
        WebkitTextStroke: '1px rgba(212,168,48,0.09)',
        textStroke: '1px rgba(212,168,48,0.09)',
        zIndex: 1,
        pointerEvents: 'none',
        userSelect: 'none',
        lineHeight: 1,
        transform: 'rotate(-3deg)',
      }}>
        DAY
      </div>
      
      <div style={{
        position: 'absolute',
        top: 450,
        left: '50%',
        transform: 'translateX(-50%) rotate(2deg)',
        fontFamily: '"Teko", sans-serif',
        fontSize: 140,
        fontWeight: 600,
        color: 'rgba(212,168,48,0.04)',
        zIndex: 1,
        pointerEvents: 'none',
        userSelect: 'none',
        lineHeight: 1,
        letterSpacing: 8,
      }}>
        MATCHDAY
      </div>
      
      {/* Subtle Noise Texture */}
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: 0.03,
        zIndex: 1,
        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 400 400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")',
      }} />

      {/* Horizontal Season ID - Top */}
      <div style={{
        position: 'absolute',
        top: 15,
        left: 0,
        right: 0,
        height: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        gap: 20,
        padding: '0 20px',
        zIndex: 5,
        fontFamily: '"DM Sans", sans-serif',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.4)',
      }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={`top-${i}`} style={{
            color: i % 2 === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(212,168,48,0.4)',
          }}>
            {seasonId}
          </span>
        ))}
      </div>

      {/* Vertical Season ID - Left Side */}
      <div style={{
        position: 'absolute',
        left: 0,
        top: 30,
        bottom: 50,
        width: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-around',
        gap: 10.5,
        padding: '20px 0',
        zIndex: 5,
        fontFamily: '"DM Sans", sans-serif',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 1,
        textTransform: 'uppercase',
        overflow: 'hidden',
      }}>
        {Array.from({ length: 13 }).map((_, i) => (
          <span key={`left-${i}`} style={{
            color: i % 2 === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(212,168,48,0.4)',
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
          }}>
            {seasonId}
          </span>
        ))}
      </div>

      {/* Vertical Season ID - Right Side */}
      <div style={{
        position: 'absolute',
        right: 0,
        top: 30,
        bottom: 50,
        width: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-around',
        gap: 10.5,
        padding: '20px 0',
        zIndex: 5,
        fontFamily: '"DM Sans", sans-serif',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 1,
        textTransform: 'uppercase',
        overflow: 'hidden',
      }}>
        {Array.from({ length: 13 }).map((_, i) => (
          <span key={`right-${i}`} style={{
            color: i % 2 === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(212,168,48,0.4)',
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
          }}>
            {seasonId}
          </span>
        ))}
      </div>

      {/* Horizontal Season ID - Bottom */}
      <div style={{
        position: 'absolute',
        bottom: 15,
        left: 0,
        right: 0,
        height: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        gap: 20,
        padding: '0 20px',
        zIndex: 5,
        fontFamily: '"DM Sans", sans-serif',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.4)',
      }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={`bottom-${i}`} style={{
            color: i % 2 === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(212,168,48,0.4)',
          }}>
            {seasonId}
          </span>
        ))}
      </div>

      {/* Main Content Container */}
      <div style={{
        position: 'absolute',
        top: 40,
        left: 50,
        right: 50,
        bottom: 40,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        {/* Title Section */}
        <div style={{
          textAlign: 'center',
          marginTop: 30,
          marginBottom: 20,
        }}>
          {/* PLAYER OF THE DAY - Three part layout */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            marginBottom: 12,
          }}>
            <div style={{
              fontFamily: '"Anton", sans-serif',
              fontSize: 62,
              color: GOLD,
              letterSpacing: 2,
              lineHeight: 1,
              textShadow: `0 0 30px rgba(212,168,48,0.4), 0 4px 20px rgba(0,0,0,0.6)`,
              background: `linear-gradient(180deg, ${GOLD_BRIGHT} 0%, ${GOLD} 50%, #b8912a 100%)`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontWeight: 400,
            }}>
              PLAYER
            </div>
            <div style={{
              fontFamily: '"Anton", sans-serif',
              fontSize: 24,
              color: GOLD,
              letterSpacing: 1,
              lineHeight: 1.1,
              textShadow: `0 0 20px rgba(212,168,48,0.3)`,
              background: `linear-gradient(180deg, ${GOLD_BRIGHT} 0%, ${GOLD} 50%, #b8912a 100%)`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: 62,
              fontWeight: 400,
            }}>
              <span>OF</span>
              <span>THE</span>
            </div>
            <div style={{
              fontFamily: '"Anton", sans-serif',
              fontSize: 62,
              color: GOLD,
              letterSpacing: 2,
              lineHeight: 1,
              textShadow: `0 0 30px rgba(212,168,48,0.4), 0 4px 20px rgba(0,0,0,0.6)`,
              background: `linear-gradient(180deg, ${GOLD_BRIGHT} 0%, ${GOLD} 50%, #b8912a 100%)`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontWeight: 400,
            }}>
              DAY
            </div>
          </div>
          {/* MATCHDAY - 26 */}
          <div style={{
            fontFamily: '"Teko", sans-serif',
            fontSize: 38,
            fontWeight: 600,
            letterSpacing: 6,
            textTransform: 'uppercase',
            color: '#ffffff',
            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
          }}>
            MATCHDAY - {selectedRound || 'LATEST'}
          </div>
        </div>

        {/* Player Photo - Seamless Integration */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: 750,
          marginTop: -180,
          marginBottom: -110,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden', // Clip to container bounds
        }}>
          {/* Gold glow behind photo */}
          <div style={{
            position: 'absolute',
            inset: -40,
            background: `radial-gradient(ellipse at center, rgba(212,168,48,0.15) 0%, transparent 70%)`,
            zIndex: 1,
            pointerEvents: 'none',
          }} />
          
          {playerPhotoUrl ? (
            <div 
              data-photo-container="true"
              style={{
              position: 'relative',
              width: `${photoCrop.width}%`,
              height: `${photoCrop.height}%`,
              overflow: 'hidden',
              zIndex: 2,
            }}>
              <img
                src={playerPhotoUrl}
                alt={player.player_name}
                crossOrigin="anonymous"
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  width: `${(100 / photoCrop.width) * 100}%`,
                  height: `${(100 / photoCrop.height) * 100}%`,
                  objectFit: 'contain',
                  objectPosition: `${photoPosition.x}% ${photoPosition.y}%`,
                  transform: `translate(calc(-50% + ${(photoPosition.x - 50) * 0.5}px), calc(-50% + ${(photoPosition.y - 50) * 0.5}px)) scale(${photoScale / 100})`,
                  transformOrigin: 'center center',
                  filter: 'drop-shadow(0 15px 50px rgba(0,0,0,0.8))',
                  WebkitMaskImage: `
                    linear-gradient(to right, transparent ${photoCrop.left || 0}%, black ${photoCrop.left || 0}%, black ${100 - (photoCrop.right || 0)}%, transparent ${100 - (photoCrop.right || 0)}%),
                    linear-gradient(to bottom, transparent ${photoCrop.top || 0}%, black ${photoCrop.top || 0}%, black ${Math.max(40, 100 - (photoCrop.bottom || 0) - 60)}%, rgba(0,0,0,0.8) ${Math.max(70, 100 - (photoCrop.bottom || 0) - 30)}%, transparent ${100 - (photoCrop.bottom || 0)}%)
                  `,
                  maskImage: `
                    linear-gradient(to right, transparent ${photoCrop.left || 0}%, black ${photoCrop.left || 0}%, black ${100 - (photoCrop.right || 0)}%, transparent ${100 - (photoCrop.right || 0)}%),
                    linear-gradient(to bottom, transparent ${photoCrop.top || 0}%, black ${photoCrop.top || 0}%, black ${Math.max(40, 100 - (photoCrop.bottom || 0) - 60)}%, rgba(0,0,0,0.8) ${Math.max(70, 100 - (photoCrop.bottom || 0) - 30)}%, transparent ${100 - (photoCrop.bottom || 0)}%)
                  `,
                  WebkitMaskComposite: 'source-in',
                  maskComposite: 'intersect',
                }}
                onError={handleImageError('Player of Day - Main Photo', player, 'player')}
                onLoad={handleImageLoad('Player of Day - Main Photo', player, 'player')}
              />
            </div>
          ) : (
            <div style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 180,
              color: 'rgba(212,168,48,0.2)',
              zIndex: 2,
            }}>
              👤
            </div>
          )}
        </div>

        {/* Player Name */}
        <div style={{
          textAlign: 'center',
          marginTop: 30,
          marginBottom: 12,
        }}>
          <div style={{
            fontFamily: '"Anton", sans-serif',
            fontSize: 72,
            color: GOLD,
            letterSpacing: 6,
            lineHeight: 0.9,
            fontWeight: 400,
            textShadow: `0 0 35px rgba(212,168,48,0.5), 0 5px 25px rgba(0,0,0,0.8)`,
            textTransform: 'uppercase',
          }}>
            {player.player_name}
          </div>
        </div>

        {/* Team Name with Logo */}
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 8,
          marginBottom: 10,
        }}>
          <div style={{
            fontFamily: '"Teko", sans-serif',
            fontSize: 26,
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.85)',
            textShadow: '0 2px 12px rgba(0,0,0,0.6)',
          }}>
            {player.team_name}
          </div>
          {teamLogoUrl && (
            <div 
              data-logo-container="true"
              style={{
              width: `${70 * (logoCrop.width / 100)}px`,
              height: `${70 * (logoCrop.height / 100)}px`,
              overflow: 'hidden',
              position: 'relative',
              filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <img
                src={teamLogoUrl}
                alt={player.team_name}
                crossOrigin="anonymous"
                style={{
                  width: `${(100 / logoCrop.width) * 100}%`,
                  height: `${(100 / logoCrop.height) * 100}%`,
                  objectFit: 'contain',
                  objectPosition: `${logoPosition.x}% ${logoPosition.y}%`,
                  transform: `scale(${logoScale / 100})`,
                  transformOrigin: `${logoPosition.x}% ${logoPosition.y}%`,
                  clipPath: `inset(${logoCrop.top || 0}% ${logoCrop.right || 0}% ${logoCrop.bottom || 0}% ${logoCrop.left || 0}%)`,
                }}
                onError={handleImageError('Player of Day - Team Logo', player, 'team')}
                onLoad={handleImageLoad('Player of Day - Team Logo', player, 'team')}
              />
            </div>
          )}
        </div>
      </div>

      {/* Bottom Gold Gradient Overlay */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 200,
        zIndex: 4,
        pointerEvents: 'none',
        background: 'linear-gradient(180deg, transparent 0%, rgba(212,168,48,0.08) 50%, rgba(184,145,42,0.15) 100%)',
      }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEAM OF THE DAY DESIGN
// ═══════════════════════════════════════════════════════════════════════════════

export function TeamOfDayDesign({ 
  award, 
  theme, 
  seasonId,
  LogoBranding,
  logoPosition = { x: 50, y: 50 },
  logoScale = 100,
  logoCrop = { width: 100, height: 100 },
  customTeamLogo = null,
  customHomeTeamLogo = null,
  customAwayTeamLogo = null,
}: { 
  award: any; // PlayerAward with team_of_day fields
  theme: Theme;
  seasonId?: string;
  LogoBranding?: React.ComponentType<{ size?: number }>;
  logoPosition?: { x: number; y: number };
  logoScale?: number;
  logoCrop?: { width: number; height: number };
  customTeamLogo?: string | null;
  customHomeTeamLogo?: string | null;
  customAwayTeamLogo?: string | null;
}) {
  const teamLogoUrl = customTeamLogo || getImageWithBgRemoval(award.team_logo);
  const homeTeamLogoUrl = customHomeTeamLogo || getImageWithBgRemoval(award.home_team_logo);
  const awayTeamLogoUrl = customAwayTeamLogo || getImageWithBgRemoval(award.away_team_logo);
  
  console.log('[TeamOfDayDesign] Award data:', {
    team_name: award.team_name,
    team_logo: award.team_logo,
    matchday: award.matchday,
    home_team: award.home_team,
    home_team_logo: award.home_team_logo,
    home_score: award.home_score,
    away_team: award.away_team,
    away_team_logo: award.away_team_logo,
    away_score: award.away_score,
  });

  console.log('[TeamOfDayDesign] Processed URLs:', {
    teamLogoUrl,
    homeTeamLogoUrl,
    awayTeamLogoUrl,
  });

  return (
    <div className="poster-root" style={{ width: 800, height: 1000, background: '#0a0a0a', position: 'relative', overflow: 'hidden', fontFamily: '"DM Sans", sans-serif' }}>
      <FontStyles />
      
      {/* Large Background Text Elements */}
      <div style={{
        position: 'absolute',
        top: 100,
        left: -50,
        fontFamily: '"Anton", sans-serif',
        fontSize: 180,
        fontWeight: 400,
        color: 'transparent',
        WebkitTextStroke: '1px rgba(0,229,255,0.08)',
        textStroke: '1px rgba(0,229,255,0.08)',
        zIndex: 1,
        pointerEvents: 'none',
        userSelect: 'none',
        lineHeight: 1,
        transform: 'rotate(-5deg)',
      }}>
        TEAM
      </div>
      
      <div style={{
        position: 'absolute',
        top: 250,
        right: -80,
        fontFamily: '"Anton", sans-serif',
        fontSize: 160,
        fontWeight: 400,
        color: 'transparent',
        WebkitTextStroke: '1px rgba(0,229,255,0.06)',
        textStroke: '1px rgba(0,229,255,0.06)',
        zIndex: 1,
        pointerEvents: 'none',
        userSelect: 'none',
        lineHeight: 1,
        transform: 'rotate(8deg)',
      }}>
        OF THE
      </div>
      
      <div style={{
        position: 'absolute',
        bottom: 200,
        left: -30,
        fontFamily: '"Anton", sans-serif',
        fontSize: 200,
        fontWeight: 400,
        color: 'transparent',
        WebkitTextStroke: '1px rgba(0,229,255,0.09)',
        textStroke: '1px rgba(0,229,255,0.09)',
        zIndex: 1,
        pointerEvents: 'none',
        userSelect: 'none',
        lineHeight: 1,
        transform: 'rotate(-3deg)',
      }}>
        DAY
      </div>
      
      {/* Subtle Noise Texture */}
      <div style={{
        position: 'absolute',
        inset: 0,
        opacity: 0.03,
        zIndex: 1,
        backgroundImage: 'url("data:image/svg+xml,%3Csvg viewBox=\'0 0 400 400\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cfilter id=\'noiseFilter\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'0.9\' numOctaves=\'4\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'100%25\' height=\'100%25\' filter=\'url(%23noiseFilter)\'/%3E%3C/svg%3E")',
      }} />

      {/* Horizontal Season ID - Top */}
      <div style={{
        position: 'absolute',
        top: 15,
        left: 0,
        right: 0,
        height: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        gap: 20,
        padding: '0 20px',
        zIndex: 5,
        fontFamily: '"DM Sans", sans-serif',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.4)',
      }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={`top-${i}`} style={{
            color: i % 2 === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(0,229,255,0.4)',
          }}>
            {seasonId}
          </span>
        ))}
      </div>

      {/* Vertical Season ID - Left Side */}
      <div style={{
        position: 'absolute',
        left: 0,
        top: 30,
        bottom: 50,
        width: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-around',
        gap: 10.5,
        padding: '20px 0',
        zIndex: 5,
        fontFamily: '"DM Sans", sans-serif',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 1,
        textTransform: 'uppercase',
        overflow: 'hidden',
      }}>
        {Array.from({ length: 13 }).map((_, i) => (
          <span key={`left-${i}`} style={{
            color: i % 2 === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(0,229,255,0.4)',
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
          }}>
            {seasonId}
          </span>
        ))}
      </div>

      {/* Vertical Season ID - Right Side */}
      <div style={{
        position: 'absolute',
        right: 0,
        top: 30,
        bottom: 50,
        width: 50,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-around',
        gap: 10.5,
        padding: '20px 0',
        zIndex: 5,
        fontFamily: '"DM Sans", sans-serif',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 1,
        textTransform: 'uppercase',
        overflow: 'hidden',
      }}>
        {Array.from({ length: 13 }).map((_, i) => (
          <span key={`right-${i}`} style={{
            color: i % 2 === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(0,229,255,0.4)',
            writingMode: 'vertical-rl',
            transform: 'rotate(180deg)',
          }}>
            {seasonId}
          </span>
        ))}
      </div>

      {/* Horizontal Season ID - Bottom */}
      <div style={{
        position: 'absolute',
        bottom: 15,
        left: 0,
        right: 0,
        height: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        gap: 20,
        padding: '0 20px',
        zIndex: 5,
        fontFamily: '"DM Sans", sans-serif',
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: 1,
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.4)',
      }}>
        {Array.from({ length: 9 }).map((_, i) => (
          <span key={`bottom-${i}`} style={{
            color: i % 2 === 0 ? 'rgba(255,255,255,0.3)' : 'rgba(0,229,255,0.4)',
          }}>
            {seasonId}
          </span>
        ))}
      </div>

      {/* Main Content Container */}
      <div style={{
        position: 'absolute',
        top: 40,
        left: 50,
        right: 50,
        bottom: 40,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
      }}>
        {/* Title Section */}
        <div style={{
          textAlign: 'center',
          marginTop: 30,
          marginBottom: 60,
        }}>
          {/* TEAM OF THE DAY - Three part layout */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            marginBottom: 12,
          }}>
            <div style={{
              fontFamily: '"Anton", sans-serif',
              fontSize: 62,
              color: '#00e5ff',
              letterSpacing: 2,
              lineHeight: 1,
              textShadow: `0 0 30px rgba(0,229,255,0.4), 0 4px 20px rgba(0,0,0,0.6)`,
              background: `linear-gradient(180deg, #6df6ff 0%, #00e5ff 50%, #00b8d4 100%)`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontWeight: 400,
            }}>
              TEAM
            </div>
            <div style={{
              fontFamily: '"Anton", sans-serif',
              fontSize: 24,
              color: '#00e5ff',
              letterSpacing: 1,
              lineHeight: 1.1,
              textShadow: `0 0 20px rgba(0,229,255,0.3)`,
              background: `linear-gradient(180deg, #6df6ff 0%, #00e5ff 50%, #00b8d4 100%)`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              height: 62,
              fontWeight: 400,
            }}>
              <span>OF</span>
              <span>THE</span>
            </div>
            <div style={{
              fontFamily: '"Anton", sans-serif',
              fontSize: 62,
              color: '#00e5ff',
              letterSpacing: 2,
              lineHeight: 1,
              textShadow: `0 0 30px rgba(0,229,255,0.4), 0 4px 20px rgba(0,0,0,0.6)`,
              background: `linear-gradient(180deg, #6df6ff 0%, #00e5ff 50%, #00b8d4 100%)`,
              WebkitBackgroundClip: 'text',
              backgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontWeight: 400,
            }}>
              DAY
            </div>
          </div>
          {/* MATCHDAY */}
          <div style={{
            fontFamily: '"Teko", sans-serif',
            fontSize: 38,
            fontWeight: 600,
            letterSpacing: 6,
            textTransform: 'uppercase',
            color: '#ffffff',
            textShadow: '0 2px 10px rgba(0,0,0,0.5)',
          }}>
            MATCHDAY - {award.matchday || 'LATEST'}
          </div>
        </div>

        {/* Large Team Logo */}
        <div style={{
          position: 'relative',
          width: '100%',
          height: 280,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 30,
        }}>
          {/* Cyan glow behind logo */}
          <div style={{
            position: 'absolute',
            inset: -40,
            background: `radial-gradient(ellipse at center, rgba(0,229,255,0.15) 0%, transparent 70%)`,
            zIndex: 1,
            pointerEvents: 'none',
          }} />
          
          {teamLogoUrl ? (
            <div 
              data-logo-container="true"
              style={{
              position: 'relative',
              width: `${280 * (logoCrop.width / 100)}px`,
              height: `${280 * (logoCrop.height / 100)}px`,
              overflow: 'hidden',
              filter: 'drop-shadow(0 15px 50px rgba(0,0,0,0.8))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 2,
            }}>
              <img
                src={teamLogoUrl}
                alt={award.team_name}
                crossOrigin="anonymous"
                style={{
                  width: `${(100 / logoCrop.width) * 100}%`,
                  height: `${(100 / logoCrop.height) * 100}%`,
                  objectFit: 'contain',
                  objectPosition: `${logoPosition.x}% ${logoPosition.y}%`,
                  transform: `scale(${logoScale / 100})`,
                  transformOrigin: `${logoPosition.x}% ${logoPosition.y}%`,
                  clipPath: `inset(${logoCrop.top || 0}% ${logoCrop.right || 0}% ${logoCrop.bottom || 0}% ${logoCrop.left || 0}%)`,
                }}
                onError={(e) => {
                  console.error('Team of Day - Team Logo failed to load:', teamLogoUrl);
                  e.currentTarget.style.display = 'none';
                }}
                onLoad={() => console.log('Team of Day - Team Logo loaded successfully')}
              />
            </div>
          ) : (
            <div style={{
              fontSize: 200,
              color: 'rgba(0,229,255,0.2)',
              zIndex: 2,
            }}>
              🏆
            </div>
          )}
        </div>

        {/* Team Name */}
        <div style={{
          textAlign: 'center',
          marginBottom: 50,
        }}>
          <div style={{
            fontFamily: '"Anton", sans-serif',
            fontSize: 72,
            color: '#00e5ff',
            letterSpacing: 6,
            lineHeight: 0.9,
            fontWeight: 400,
            textShadow: `0 0 35px rgba(0,229,255,0.5), 0 5px 25px rgba(0,0,0,0.8)`,
            textTransform: 'uppercase',
          }}>
            {award.team_name}
          </div>
        </div>

        {/* Match Score */}
        {award.home_team && award.away_team && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 30,
            width: '100%',
            padding: '20px 40px',
            marginBottom: 40,
          }}>
            {/* Home Team Logo */}
            {homeTeamLogoUrl && (
              <img
                src={homeTeamLogoUrl}
                alt={award.home_team}
                crossOrigin="anonymous"
                style={{
                  width: 90,
                  height: 90,
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))',
                }}
                onError={(e) => {
                  console.error('Team of Day - Home Logo failed to load:', homeTeamLogoUrl);
                  e.currentTarget.style.display = 'none';
                }}
                onLoad={() => console.log('Team of Day - Home Logo loaded successfully')}
              />
            )}

            {/* Score */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 15,
              padding: '0 20px',
            }}>
              <div style={{
                fontFamily: '"Anton", sans-serif',
                fontSize: 80,
                color: '#00e5ff',
                fontWeight: 400,
                lineHeight: 1,
                textShadow: '0 0 30px rgba(0,229,255,0.5)',
              }}>
                {award.home_score ?? 0}
              </div>
              <div style={{
                fontFamily: '"Anton", sans-serif',
                fontSize: 60,
                color: 'rgba(255,255,255,0.4)',
                fontWeight: 400,
                lineHeight: 1,
              }}>
                -
              </div>
              <div style={{
                fontFamily: '"Anton", sans-serif',
                fontSize: 80,
                color: '#00e5ff',
                fontWeight: 400,
                lineHeight: 1,
                textShadow: '0 0 30px rgba(0,229,255,0.5)',
              }}>
                {award.away_score ?? 0}
              </div>
            </div>

            {/* Away Team Logo */}
            {awayTeamLogoUrl && (
              <img
                src={awayTeamLogoUrl}
                alt={award.away_team}
                crossOrigin="anonymous"
                style={{
                  width: 90,
                  height: 90,
                  objectFit: 'contain',
                  filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.6))',
                }}
                onError={(e) => {
                  console.error('Team of Day - Away Logo failed to load:', awayTeamLogoUrl);
                  e.currentTarget.style.display = 'none';
                }}
                onLoad={() => console.log('Team of Day - Away Logo loaded successfully')}
              />
            )}
          </div>
        )}
      </div>

      {/* Bottom Cyan Gradient Overlay */}
      <div style={{
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        height: 200,
        zIndex: 4,
        pointerEvents: 'none',
        background: 'linear-gradient(180deg, transparent 0%, rgba(0,229,255,0.08) 50%, rgba(0,184,212,0.15) 100%)',
      }} />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SINGLE PLAYER DESIGN
// ═══════════════════════════════════════════════════════════════════════════════

export function SinglePlayerDesign({ 
  player, 
  theme, 
  themeKey, 
  week, 
  LogoBranding,
  photoPosition = { x: 50, y: 50 },
  photoScale = 100,
  photoCrop = { width: 100, height: 100 },
  logoPosition = { x: 50, y: 50 },
  logoScale = 100,
  logoCrop = { width: 100, height: 100 },
  removeDividers = false,
  seasonId = '',
  selectedRound = 0
}: SinglePlayerDesignProps) {
  // Special design for Player of the Week
  if (themeKey === 'player-of-week') {
    return <PlayerOfWeekDesign player={player} theme={theme} seasonId={seasonId} selectedRound={selectedRound} photoPosition={photoPosition} photoScale={photoScale} photoCrop={photoCrop} logoPosition={logoPosition} logoScale={logoScale} logoCrop={logoCrop} />;
  }
  
  // Special design for Player of the Day
  if (themeKey === 'player-of-day') {
    return <PlayerOfDayDesign player={player} theme={theme} seasonId={seasonId} selectedRound={selectedRound} photoPosition={photoPosition} photoScale={photoScale} photoCrop={photoCrop} logoPosition={logoPosition} logoScale={logoScale} logoCrop={logoCrop} />;
  }

  const gpm = player.matches_played > 0
    ? (player.goals_scored / player.matches_played).toFixed(2) : '0.00';

  const primaryLabel =
    themeKey === 'golden-boot' ? 'Goals Scored' :
    themeKey === 'golden-glove' ? 'Clean Sheets' : 'Points';

  const primaryValue =
    themeKey === 'golden-boot' ? player.goals_scored :
    themeKey === 'golden-glove' ? player.clean_sheets : player.points;

  const secLabel = themeKey === 'golden-boot' ? 'Goals / Match' : 'Win Rate';
  const secValue = themeKey === 'golden-boot' ? gpm : `${player.win_rate}%`;
  const gd = player.goal_difference >= 0 ? `+${player.goal_difference}` : `${player.goal_difference}`;

  // Support both photo_url and player_photo fields
  const playerPhotoUrl = getPlayerImageWithBgRemoval(player.player_photo || player.photo_url);
  const teamLogoUrl = getImageWithBgRemoval(player.team_logo);
  
  // Debug logging
  console.log('SinglePlayerDesign - Player data:', {
    player_name: player.player_name,
    team_name: player.team_name,
    team_logo: player.team_logo,
    team_logo_transformed: teamLogoUrl,
    photo_url: player.photo_url,
    player_photo: player.player_photo
  });

  return (
    <div className="poster-root" style={{ width: 800, height: 1000, background: BG, position: 'relative', overflow: 'hidden', fontFamily: '"DM Sans", sans-serif' }}>
      <FontStyles />
      <GoldStripe />
      <DiagLines />
      <DotGrid />
      <GlowOrb top={-100} right={-100} size={500} alpha={0.16} />
      <GlowOrb bottom={-120} left={-80} size={420} alpha={0.1} />
      <VWatermark />

      {/* Large Golden Boot/Trophy Image in Background */}
      {themeKey === 'golden-boot' && (
        <div style={{
          position: 'absolute',
          bottom: -20,
          right: -20,
          zIndex: 2,
          opacity: 0.15,
          pointerEvents: 'none',
        }}>
          <img
            src="/golden-boot.png"
            alt="Golden Boot"
            style={{
              height: 400,
              width: 'auto',
              objectFit: 'contain',
              filter: 'drop-shadow(0 0 25px rgba(212, 175, 55, 0.3))',
            }}
          />
        </div>
      )}

      {themeKey === 'golden-glove' && (
        <div style={{
          position: 'absolute',
          bottom: -20,
          right: -20,
          zIndex: 2,
          opacity: 0.15,
          pointerEvents: 'none',
        }}>
          <img
            src="/golden-glove.png"
            alt="Golden Glove"
            style={{
              height: 400,
              width: 'auto',
              objectFit: 'contain',
              filter: 'drop-shadow(0 0 25px rgba(212, 175, 55, 0.3))',
            }}
          />
        </div>
      )}

      {themeKey === 'golden-ball' && (
        <div style={{
          position: 'absolute',
          bottom: -20,
          right: -20,
          zIndex: 2,
          opacity: 0.15,
          pointerEvents: 'none',
        }}>
          <img
            src="/golden-ball.png"
            alt="Golden Ball"
            style={{
              height: 400,
              width: 'auto',
              objectFit: 'contain',
              filter: 'drop-shadow(0 0 25px rgba(212, 175, 55, 0.3))',
            }}
          />
        </div>
      )}

      {/* Vertical Season ID on the right - Alternating gradient and solid white */}
      <div style={{
        position: 'absolute', right: 7, top: 0, bottom: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        writingMode: 'vertical-lr',
        fontFamily: '"DM Sans", sans-serif', 
        fontSize: 14, 
        fontWeight: 600,
        letterSpacing: 3,
        textTransform: 'uppercase',
        overflow: 'hidden',
        opacity: 0.4,
      }}>
        {Array.from({ length: 20 }).map((_, i) => {
          const isGradient = i % 2 === 0;
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                marginBottom: i < 19 ? '25px' : '0',
                ...(isGradient ? {
                  background: 'linear-gradient(180deg, #ffffff 0%, #d4a830 50%, #b8912a 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  textShadow: 'none',
                } : {
                  color: '#ffffff',
                  textShadow: '0 0 8px rgba(255,255,255,0.3)',
                }),
              }}
            >
              {seasonId}
            </span>
          );
        })}
      </div>

      {/* Large Background Text Elements */}
      <div style={{
        position: 'absolute',
        top: -10,
        left: -20,
        fontFamily: '"Anton", sans-serif',
        fontSize: 290,
        fontWeight: 400,
        color: 'transparent',
        WebkitTextStroke: '1px rgba(212,168,48,0.08)',
        textStroke: '1px rgba(212,168,48,0.08)',
        zIndex: 1,
        pointerEvents: 'none',
        userSelect: 'none',
        lineHeight: 1,
        letterSpacing: 8,
        whiteSpace: 'nowrap',
        transform: 'rotate(-3deg)',
      }}>
        {theme.tagline}
      </div>
      
      <div style={{
        position: 'absolute',
        top: 250,
        left: -20,
        fontFamily: '"Anton", sans-serif',
        fontSize: 250,
        fontWeight: 400,
        color: 'transparent',
        WebkitTextStroke: '1px rgba(212,168,48,0.055)',
        textStroke: '1px rgba(212,168,48,0.055)',
        zIndex: 1,
        pointerEvents: 'none',
        userSelect: 'none',
        lineHeight: 1,
        letterSpacing: 8,
        whiteSpace: 'nowrap',
        transform: 'rotate(2deg)',
      }}>
        RACE
      </div>
      
      <div style={{
        position: 'absolute',
        bottom: 180,
        right: -50,
        fontFamily: '"Teko", sans-serif',
        fontSize: 180,
        fontWeight: 600,
        color: 'transparent',
        WebkitTextStroke: '1px rgba(212,168,48,0.06)',
        textStroke: '1px rgba(212,168,48,0.06)',
        zIndex: 1,
        pointerEvents: 'none',
        userSelect: 'none',
        lineHeight: 1,
        letterSpacing: 6,
        whiteSpace: 'nowrap',
        transform: 'rotate(-5deg)',
      }}>
        LEADER
      </div>
      
      <div style={{
        position: 'absolute',
        bottom: 54,
        left: 0,
        fontFamily: '"DM Sans", sans-serif',
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: 22,
        color: 'rgba(180,140,30,0.05)',
        whiteSpace: 'nowrap',
        zIndex: 1,
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        SEASON · 2024 · 25 · SS LEAGUE
      </div>

      {/* ── HEADER ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        padding: '26px 40px 20px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
        borderBottom: '1px solid rgba(180,140,30,0.14)',
        background: 'linear-gradient(180deg, rgba(9,9,11,0.97) 55%, transparent)',
      }}>
        <div>
          <div style={{ fontFamily: '"Anton", sans-serif', fontSize: 62, color: GOLD, letterSpacing: 2, lineHeight: 1, textTransform: 'uppercase', textShadow: `0 2px 22px rgba(212,168,48,0.45), 0 4px 15px rgba(0,0,0,0.6)` }}>
            {theme.tagline}
          </div>
          <div style={{ 
            fontFamily: '"Oswald", sans-serif',
            fontSize: 18, 
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.7)',
            marginTop: 2,
            textAlign: 'left',
          }}>
            {week ?? 'Season 2024 – 25'}
          </div>
        </div>
        <div style={{
          marginTop: 8, padding: '6px 16px', borderRadius: 20,
          border: `1px solid ${GOLD_DIM}`, background: 'rgba(212,168,48,0.08)',
          fontFamily: '"DM Sans", sans-serif', fontSize: 11, fontWeight: 600,
          letterSpacing: 3, textTransform: 'uppercase', color: GOLD,
          whiteSpace: 'nowrap',
        }}>Race Leader</div>
      </div>

      {/* ── SILHOUETTE ZONE (left) ── */}
      <div style={{ position: 'absolute', left: 0, top: 108, bottom: 0, width: 387, zIndex: 3, overflow: 'hidden', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
        {playerPhotoUrl ? (
          <div 
            data-photo-container="true"
            style={{
            position: 'relative',
            width: `${photoCrop.width}%`,
            height: `${photoCrop.height}%`,
            overflow: 'hidden',
          }}>
            <img
              src={playerPhotoUrl} alt={player.player_name} crossOrigin="anonymous"
              style={{ 
                position: 'absolute',
                top: '50%',
                left: '50%',
                width: `${(100 / photoCrop.width) * 100}%`,
                height: `${(100 / photoCrop.height) * 100}%`,
                objectFit: 'contain', 
                objectPosition: `${photoPosition.x}% ${photoPosition.y}%`,
                transform: `translate(calc(-50% + ${(photoPosition.x - 50) * 0.5}px), calc(-50% + ${(photoPosition.y - 50) * 0.5}px)) scale(${photoScale / 100})`,
                transformOrigin: 'center center',
                clipPath: `inset(${photoCrop.top || 0}% ${photoCrop.right || 0}% ${photoCrop.bottom || 0}% ${photoCrop.left || 0}%)`,
                filter: 'drop-shadow(0 0 30px rgba(0,0,0,0.8))',
              }}
              onError={handleImageError('SinglePlayerDesign - Player Photo', player, 'player')}
              onLoad={handleImageLoad('SinglePlayerDesign - Player Photo', player, 'player')}
            />
          </div>
        ) : (
          <div style={{
            width: 280, height: 700,
            background: 'linear-gradient(180deg, rgba(212,168,48,0.07) 0%, rgba(212,168,48,0.02) 55%, transparent 100%)',
            borderRadius: '140px 140px 0 0', border: '1px solid rgba(212,168,48,0.1)', borderBottom: 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 160, opacity: 0.12,
          }}>⚽</div>
        )}
      </div>

      {/* Vertical divider */}
      <div style={{ position: 'absolute', left: 387, top: 128, bottom: 76, width: 1, zIndex: 6, background: `linear-gradient(180deg, transparent, ${GOLD_DIM} 20%, ${GOLD_DIM} 80%, transparent)` }} />

      {/* ── STATS PANEL (right) ── */}
      <div style={{ position: 'absolute', left: 397, top: 200, right: 22, bottom: 76, zIndex: 10, padding: '18px 18px 0 14px', display: 'flex', flexDirection: 'column' }}>

        {/* Team logo + name - Logo Left, Text Right Aligned */}
        <div style={{ marginBottom: 14, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
          {/* Logo on the left - sized to match text height */}
          {teamLogoUrl && (
            <div 
              data-logo-container="true"
              style={{ 
              width: `${85 * (logoCrop.width / 100)}px`,
              height: `${85 * (logoCrop.height / 100)}px`,
              flexShrink: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}>
              <img 
                src={teamLogoUrl} 
                alt={player.team_name} 
                crossOrigin="anonymous"
                style={{ 
                  width: `${(100 / logoCrop.width) * 100}%`,
                  height: `${(100 / logoCrop.height) * 100}%`,
                  objectFit: 'contain',
                  objectPosition: `${logoPosition.x}% ${logoPosition.y}%`,
                  transform: `scale(${logoScale / 100})`,
                  transformOrigin: `${logoPosition.x}% ${logoPosition.y}%`,
                  clipPath: `inset(${logoCrop.top || 0}% ${logoCrop.right || 0}% ${logoCrop.bottom || 0}% ${logoCrop.left || 0}%)`,
                  opacity: 0.85
                }}
                onError={handleImageError('SinglePlayerDesign - Team Logo', player, 'team')}
                onLoad={handleImageLoad('SinglePlayerDesign - Team Logo', player, 'team')}
              />
            </div>
          )}
          
          {/* Text container */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right', minWidth: 0 }}>
            {/* Player name - determines width */}
            <div style={{
              fontFamily: '"Bebas Neue", sans-serif',
              fontSize: 'clamp(32px, 5vw, 72px)',
              color: '#ffffff',
              letterSpacing: 1,
              lineHeight: 1,
              textShadow: '0 2px 14px rgba(0,0,0,0.85)',
              textAlign: 'right',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              direction: 'rtl',
              order: 2,
            }}>
              <span style={{ direction: 'ltr', unicodeBidi: 'bidi-override' }}>
                {player.player_name}
              </span>
            </div>
            
            {/* Team name - constrained to player name width */}
            <div style={{ 
              ...lbl, 
              fontSize: 10, 
              marginBottom: 2,
              textAlign: 'right',
              color: GOLD,
              maxWidth: '100%',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              order: 1,
            }}>
              {player.team_name}
            </div>
          </div>
        </div>

        {/* Divider after player name */}
        <div style={dividerStyle} />

        {/* Primary stat */}
        <div style={{ marginBottom: 16, textAlign: 'right' }}>
          <div style={lbl}>{primaryLabel}</div>
          <div style={{
            fontFamily: '"Bebas Neue", sans-serif', fontSize: 130, color: GOLD,
            letterSpacing: 2, lineHeight: 0.9,
            textShadow: `0 0 36px rgba(212,168,48,0.42), 0 4px 20px rgba(0,0,0,0.85)`,
          }}>{primaryValue}</div>
        </div>

        {/* Divider after primary stat (goals scored/clean sheets/points) */}
        <div style={dividerStyle} />

        {/* Secondary 2×2 grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px 12px', marginBottom: 18 }}>
          {[
            { label: 'Matches',    value: player.matches_played },
            { label: secLabel,     value: secValue },
            { label: 'Wins',       value: player.wins },
            { label: 'Goal Diff',  value: gd },
          ].map((item, i) => (
            <div key={i} style={{ textAlign: 'right' }}>
              <div style={lbl}>{item.label}</div>
              <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 64, color: GOLD, lineHeight: 1, textShadow: '0 0 14px rgba(212,168,48,0.3)' }}>{item.value}</div>
            </div>
          ))}
        </div>

        {/* Divider after goal diff */}
        <div style={dividerStyle} />

        {/* Tertiary row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px 12px', marginBottom: 10 }}>
          {[
            { label: 'Draws',        value: player.draws },
            { label: 'Losses',       value: player.losses },
            { label: 'Clean Sheets', value: player.clean_sheets },
            { label: 'MOTM Awards',  value: player.motm_awards },
          ].map((item, i) => (
            <div key={i} style={{ textAlign: 'right' }}>
              <div style={lbl}>{item.label}</div>
              <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: 48, color: 'rgba(212,168,48,0.72)', lineHeight: 1 }}>{item.value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── GOLD GRADIENT OVERLAY - Bottom Left Corner ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: 500,
          height: 400,
          zIndex: 5,
          pointerEvents: 'none',
          background: 'radial-gradient(circle at 0% 100%, rgba(212, 168, 48, 0.4) 0%, rgba(184, 145, 42, 0.2) 25%, transparent 60%)',
        }}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// TABLE / LEADERBOARD DESIGN
// ═══════════════════════════════════════════════════════════════════════════════

export function TableDesign({ players, theme, themeKey, week, LogoBranding, seasonId = '', startRank = 1, endRank }: TableDesignProps & { seasonId?: string }) {
  // Adaptive row sizing — fit more players comfortably
  const rowH   = players.length > 12 ? 46 : players.length > 8 ? 50 : 56;
  
  // Define columns based on theme
  let COLS: string;
  let headers: string[];
  
  if (themeKey === 'golden-boot') {
    // Golden Boot: M, W, D, L, GOALS, GC, GD
    COLS = '34px minmax(0,1fr) 36px 36px 36px 36px 50px 46px 46px';
    headers = ['#', 'PLAYER', 'M', 'W', 'D', 'L', 'GOALS', 'GC', 'GD'];
  } else if (themeKey === 'golden-glove') {
    // Golden Glove: M, W, D, L, GS, GC, GD, CS
    COLS = '34px minmax(0,1fr) 36px 36px 36px 36px 46px 46px 46px 46px';
    headers = ['#', 'PLAYER', 'M', 'W', 'D', 'L', 'GS', 'GC', 'GD', 'CS'];
  } else if (themeKey === 'golden-ball') {
    // Golden Ball: M, W, D, L, GS, GC, GD, PTS
    COLS = '34px minmax(0,1fr) 36px 36px 36px 36px 46px 46px 46px 50px';
    headers = ['#', 'PLAYER', 'M', 'W', 'D', 'L', 'GS', 'GC', 'GD', 'PTS'];
  } else {
    // Full Stats: Everything
    COLS = '34px minmax(0,1fr) 36px 36px 36px 36px 46px 46px 50px 46px';
    headers = ['#', 'PLAYER', 'M', 'W', 'L', 'D', 'GF', 'GA', 'PTS', 'GD'];
  }
  
  const actualEndRank = endRank || (startRank + players.length - 1);

  return (
    <div className="poster-root" style={{ width: 800, height: 1000, background: BG, position: 'relative', overflow: 'hidden', fontFamily: '"DM Sans", sans-serif' }}>
      <FontStyles />
      <GoldStripe />
      <DiagLines />
      <DotGrid />
      <GlowOrb top={-80} right={-80} size={420} alpha={0.14} />
      <GlowOrb bottom={-100} left={-60} size={380} alpha={0.09} />
      <VWatermark />

      {/* Large Golden Boot/Trophy Image in Background */}
      {themeKey === 'golden-boot' && (
        <div style={{
          position: 'absolute',
          bottom: -20,
          right: -20,
          zIndex: 2,
          opacity: 0.15,
          pointerEvents: 'none',
        }}>
          <img
            src="/golden-boot.png"
            alt="Golden Boot"
            style={{
              height: 400,
              width: 'auto',
              objectFit: 'contain',
              filter: 'drop-shadow(0 0 25px rgba(212, 175, 55, 0.3))',
            }}
          />
        </div>
      )}

      {themeKey === 'golden-glove' && (
        <div style={{
          position: 'absolute',
          bottom: -20,
          right: -20,
          zIndex: 2,
          opacity: 0.15,
          pointerEvents: 'none',
        }}>
          <img
            src="/golden-glove.png"
            alt="Golden Glove"
            style={{
              height: 400,
              width: 'auto',
              objectFit: 'contain',
              filter: 'drop-shadow(0 0 25px rgba(212, 175, 55, 0.3))',
            }}
          />
        </div>
      )}

      {themeKey === 'golden-ball' && (
        <div style={{
          position: 'absolute',
          bottom: -20,
          right: -20,
          zIndex: 2,
          opacity: 0.15,
          pointerEvents: 'none',
        }}>
          <img
            src="/golden-ball.png"
            alt="Golden Ball"
            style={{
              height: 400,
              width: 'auto',
              objectFit: 'contain',
              filter: 'drop-shadow(0 0 25px rgba(212, 175, 55, 0.3))',
            }}
          />
        </div>
      )}

      {/* Vertical Season ID on the right - Alternating gradient and solid white */}
      <div style={{
        position: 'absolute', right: 7, top: 0, bottom: 0, zIndex: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        writingMode: 'vertical-lr',
        fontFamily: '"DM Sans", sans-serif', 
        fontSize: 14, 
        fontWeight: 600,
        letterSpacing: 3,
        textTransform: 'uppercase',
        overflow: 'hidden',
        opacity: 0.4,
      }}>
        {Array.from({ length: 20 }).map((_, i) => {
          const isGradient = i % 2 === 0;
          return (
            <span
              key={i}
              style={{
                display: 'inline-block',
                marginBottom: i < 19 ? '25px' : '0',
                ...(isGradient ? {
                  background: 'linear-gradient(180deg, #ffffff 0%, #d4a830 50%, #b8912a 100%)',
                  WebkitBackgroundClip: 'text',
                  backgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  textShadow: 'none',
                } : {
                  color: '#ffffff',
                  textShadow: '0 0 8px rgba(255,255,255,0.3)',
                }),
              }}
            >
              {seasonId}
            </span>
          );
        })}
      </div>

      {/* Large Background Text Elements */}
      <div style={{
        position: 'absolute',
        top: 150,
        left: -80,
        fontFamily: '"Anton", sans-serif',
        fontSize: 220,
        fontWeight: 400,
        color: 'transparent',
        WebkitTextStroke: '1px rgba(212,168,48,0.07)',
        textStroke: '1px rgba(212,168,48,0.07)',
        zIndex: 1,
        pointerEvents: 'none',
        userSelect: 'none',
        lineHeight: 1,
        letterSpacing: 10,
        whiteSpace: 'nowrap',
        transform: 'rotate(-8deg)',
      }}>
        {theme.tagline}
      </div>
      
      <div style={{
        position: 'absolute',
        bottom: 36,
        left: -18,
        fontFamily: '"Anton", sans-serif',
        fontSize: 250,
        fontWeight: 400,
        color: 'transparent',
        WebkitTextStroke: '1px rgba(212,168,48,0.07)',
        textStroke: '1px rgba(212,168,48,0.07)',
        zIndex: 1,
        pointerEvents: 'none',
        userSelect: 'none',
        lineHeight: 1,
        letterSpacing: 8,
        whiteSpace: 'nowrap',
        transform: 'rotate(3deg)',
      }}>
        RANKING
      </div>
      
      <div style={{
        position: 'absolute',
        top: 400,
        right: -120,
        fontFamily: '"Teko", sans-serif',
        fontSize: 200,
        fontWeight: 600,
        color: 'transparent',
        WebkitTextStroke: '1px rgba(212,168,48,0.05)',
        textStroke: '1px rgba(212,168,48,0.05)',
        zIndex: 1,
        pointerEvents: 'none',
        userSelect: 'none',
        lineHeight: 1,
        letterSpacing: 8,
        whiteSpace: 'nowrap',
        transform: 'rotate(12deg)',
      }}>
        RACE
      </div>
      
      <div style={{
        position: 'absolute',
        top: 50,
        left: '50%',
        transform: 'translateX(-50%) rotate(-2deg)',
        fontFamily: '"Teko", sans-serif',
        fontSize: 140,
        fontWeight: 600,
        color: 'rgba(212,168,48,0.04)',
        zIndex: 1,
        pointerEvents: 'none',
        userSelect: 'none',
        lineHeight: 1,
        letterSpacing: 12,
        whiteSpace: 'nowrap',
      }}>
        LEADERBOARD
      </div>
      
      <div style={{
        position: 'absolute',
        top: 8,
        right: 0,
        fontFamily: '"DM Sans", sans-serif',
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: 18,
        color: 'rgba(180,140,30,0.05)',
        whiteSpace: 'nowrap',
        zIndex: 1,
        pointerEvents: 'none',
        userSelect: 'none',
      }}>
        SEASON · 2024
      </div>

      {/* ── HEADER ── */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
        padding: '22px 40px 16px',
        borderBottom: '1px solid rgba(180,140,30,0.15)',
        background: 'linear-gradient(180deg, rgba(9,9,11,1) 65%, transparent)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ fontFamily: '"Anton", sans-serif', fontSize: 62, color: GOLD, letterSpacing: 2, lineHeight: 1, textTransform: 'uppercase', textShadow: `0 0 26px rgba(212,168,48,0.4), 0 4px 15px rgba(0,0,0,0.6)` }}>
              {theme.tagline} RACE
            </div>
            <div style={{ 
              fontFamily: '"Oswald", sans-serif',
              fontSize: 18, 
              fontWeight: 600,
              letterSpacing: 4,
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.7)',
              marginTop: 2,
              textAlign: 'left',
            }}>
              Rank {startRank}–{actualEndRank} · {week ?? 'Season 2024–25'}
            </div>
          </div>
        </div>
      </div>

      {/* ── TABLE AREA ── */}
      <div style={{ position: 'absolute', top: 140, left: 0, right: 0, bottom: 62, padding: '0 32px', zIndex: 10, overflow: 'hidden' }}>

        {/* Column headers */}
        <div style={{
          display: 'grid', gridTemplateColumns: COLS, gap: 4,
          padding: '7px 12px', marginBottom: 6,
          borderBottom: '1px solid rgba(212,168,48,0.18)',
        }}>
          {headers.map((h, i) => (
            <div key={h} style={{
              fontFamily: '"DM Sans", sans-serif', fontSize: 9, fontWeight: 700,
              letterSpacing: 3, textTransform: 'uppercase', color: 'rgba(212,168,48,0.52)',
              textAlign: i <= 1 ? 'left' : 'center',
            }}>{h}</div>
          ))}
        </div>

        {/* Rows */}
        {players.filter(p => p && p.player_id).map((player, idx) => {
          const gpm = player.matches_played > 0
            ? (player.goals_scored / player.matches_played).toFixed(2) : '0.00';
          const actualRank = startRank + idx;
          const isTop3 = actualRank <= 3;
          const rm = actualRank <= 3 ? RANK_META[actualRank - 1] : undefined;
          const gd = player.goal_difference >= 0 ? `+${player.goal_difference}` : `${player.goal_difference}`;

          // Define stat cells based on theme
          let statCells: (string | number)[];
          let highlightIndices: number[]; // Indices of cells to highlight in gold
          
          if (themeKey === 'golden-boot') {
            // Golden Boot: M, W, D, L, GOALS, GC, GD
            statCells = [player.matches_played, player.wins, player.draws, player.losses, player.goals_scored, player.goals_conceded, gd];
            highlightIndices = [4]; // GOALS
          } else if (themeKey === 'golden-glove') {
            // Golden Glove: M, W, D, L, GS, GC, GD, CS
            statCells = [player.matches_played, player.wins, player.draws, player.losses, player.goals_scored, player.goals_conceded, gd, player.clean_sheets];
            highlightIndices = [7]; // CS (Clean Sheets)
          } else if (themeKey === 'golden-ball') {
            // Golden Ball: M, W, D, L, GS, GC, GD, PTS
            statCells = [player.matches_played, player.wins, player.draws, player.losses, player.goals_scored, player.goals_conceded, gd, player.points];
            highlightIndices = [7]; // PTS
          } else {
            // Full Stats: M, W, L, D, GF, GA, PTS, GD
            statCells = [player.matches_played, player.wins, player.losses, player.draws, player.goals_scored, player.goals_conceded, player.points, gd];
            highlightIndices = [4, 6]; // GF and PTS
          }

          return (
            <div key={player.player_id} style={{
              display: 'grid', gridTemplateColumns: COLS, gap: 4,
              padding: `0 12px`, height: rowH,
              borderRadius: 5, marginBottom: 3,
              position: 'relative',
              background: isTop3
                ? 'rgba(212,168,48,0.045)'
                : idx % 2 === 1 ? 'rgba(255,255,255,0.018)' : 'transparent',
              borderLeft: isTop3 ? `2px solid ${rm.stripe}` : '2px solid transparent',
            }}>
              {/* Rank */}
              <div style={{ fontFamily: '"Bebas Neue", sans-serif', fontSize: rm ? rm.size : 14, color: rm ? rm.color : 'rgba(255,255,255,0.2)', textShadow: rm ? rm.shadow : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {actualRank}
              </div>
              {/* Name */}
              <div style={{ fontFamily: '"Oswald", sans-serif', fontSize: 14, fontWeight: 500, color: isTop3 ? '#ffffff' : 'rgba(255,255,255,0.65)', textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {player.player_name}
              </div>
              {/* Stat cells */}
              {statCells.map((val, si) => {
                const hi = highlightIndices.includes(si);
                return (
                  <div key={si} style={{
                    fontFamily: '"Oswald", sans-serif', fontSize: 14,
                    fontWeight: hi ? 600 : 400,
                    color: hi ? GOLD : 'rgba(255,255,255,0.52)',
                    textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    textShadow: hi ? '0 0 10px rgba(212,168,48,0.3)' : 'none',
                  }}>{val}</div>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* ── GOLD GRADIENT OVERLAY - Bottom Left Corner ── */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          width: 500,
          height: 400,
          zIndex: 5,
          pointerEvents: 'none',
          background: 'radial-gradient(circle at 0% 100%, rgba(212, 168, 48, 0.4) 0%, rgba(184, 145, 42, 0.2) 25%, transparent 60%)',
        }}
      />
    </div>
  );
}