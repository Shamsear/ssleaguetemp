'use client';

import { useRef, useState, useMemo, useEffect } from 'react';
import * as htmlToImage from 'html-to-image';
import { SinglePlayerDesign, TableDesign, TeamOfWeekDesign, TeamOfDayDesign } from './PosterDesigns';
import { 
  BarChart2, 
  Calendar, 
  Trophy, 
  Users, 
  Award, 
  FileSpreadsheet, 
  Download, 
  ClipboardList,
  Check,
  Palette,
  Info,
  AlertTriangle,
  Focus
} from 'lucide-react';

interface PlayerStats {
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
  player_photo?: string; // Add player photo field
  photo_url?: string;    // Support both field names
  team_logo?: string;    // Add team logo field
}

interface PlayerAward {
  player_id: string;
  player_name: string;
  award_type: 'player_of_day' | 'player_of_week' | 'team_of_week' | 'team_of_day';
  matchday?: number;
  week?: number;
  date?: string;
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
  // Team of Day specific fields
  home_team?: string;
  home_team_logo?: string;
  home_score?: number;
  away_team?: string;
  away_team_logo?: string;
  away_score?: number;
}

type ThemeKey = 'golden-boot' | 'golden-ball' | 'golden-glove' | 'player-of-day' | 'player-of-week' | 'team-of-week' | 'team-of-day' | 'full-stats';

interface Theme {
  label: string;
  emoji: string;
  bg: string[];
  accent: string;
  accent2: string;
  glow: string;
  tagline: string;
}

const THEMES: Record<ThemeKey, Theme> = {
  'golden-boot': {
    label: 'Golden Boot',
    emoji: '🥾',
    bg: ['#0a0a0a', '#1a1200', '#2d1f00'],
    accent: '#FFD700',
    accent2: '#FFA500',
    glow: 'rgba(255,215,0,0.35)',
    tagline: 'GOLDEN BOOT',
  },
  'golden-ball': {
    label: 'Golden Ball',
    emoji: '⚽',
    bg: ['#050a1a', '#0a1628', '#0d2040'],
    accent: '#3ab8ff',
    accent2: '#ffffff',
    glow: 'rgba(58,184,255,0.35)',
    tagline: 'GOLDEN BALL',
  },
  'golden-glove': {
    label: 'Golden Glove',
    emoji: '🧤',
    bg: ['#0a0a14', '#0d1a2d', '#1a0d2d'],
    accent: '#a78bfa',
    accent2: '#38bdf8',
    glow: 'rgba(167,139,250,0.35)',
    tagline: 'GOLDEN GLOVE',
  },
  'player-of-day': {
    label: 'Player of Day',
    emoji: '⚡',
    bg: ['#0a0a0a', '#0f0f0f', '#141414'],
    accent: '#00e5ff',
    accent2: '#0077ff',
    glow: 'rgba(0,229,255,0.35)',
    tagline: 'PLAYER OF THE DAY',
  },
  'player-of-week': {
    label: 'Player of Week',
    emoji: '🏆',
    bg: ['#0a0a0a', '#0f0f0f', '#141414'],
    accent: '#E8A800',
    accent2: '#FFD700',
    glow: 'rgba(232,168,0,0.35)',
    tagline: 'PLAYER OF THE WEEK',
  },
  'team-of-week': {
    label: 'Team of Week',
    emoji: '⚽',
    bg: ['#0a0a0a', '#0f0f0f', '#141414'],
    accent: '#E8A800',
    accent2: '#FFD700',
    glow: 'rgba(232,168,0,0.35)',
    tagline: 'TEAM OF THE WEEK',
  },
  'team-of-day': {
    label: 'Team of Day',
    emoji: '🏅',
    bg: ['#0a0a0a', '#0f0f0f', '#141414'],
    accent: '#00e5ff',
    accent2: '#0077ff',
    glow: 'rgba(0,229,255,0.35)',
    tagline: 'TEAM OF THE DAY',
  },
  'full-stats': {
    label: 'Full Stats',
    emoji: '📊',
    bg: ['#0a0a0a', '#0f0f0f', '#141414'],
    accent: '#0066FF',
    accent2: '#9580FF',
    glow: 'rgba(0,102,255,0.35)',
    tagline: 'PLAYER STATISTICS',
  },
};

interface PosterStudioProps {
  players: PlayerStats[];
  roundOptions?: number[];
  weekOptions?: number[];
  playerAwards?: PlayerAward[]; // Awards data for Player of Day/Week
  tournamentId?: string;
  seasonId?: string;
}

export default function PosterStudio({ 
  players: initialPlayers, 
  roundOptions = [], 
  weekOptions = [],
  playerAwards = [],
  tournamentId,
  seasonId,
}: PosterStudioProps) {
  const posterRef = useRef<HTMLDivElement>(null);
  const photoContainerRef = useRef<HTMLDivElement>(null);
  const logoContainerRef = useRef<HTMLDivElement>(null);
  
  // Week ranges definition
  const getWeekRange = (week: number): { start: number; end: number } => {
    const weekRanges: Record<number, { start: number; end: number }> = {
      1: { start: 1, end: 7 },
      2: { start: 8, end: 13 },
      3: { start: 14, end: 20 },
      4: { start: 21, end: 26 },
    };
    return weekRanges[week] || { start: 0, end: 0 };
  };
  
  // UI State
  const [showPoster, setShowPoster] = useState(false);
  const [activeTheme, setActiveTheme] = useState<ThemeKey>('golden-boot');
  const [filterType, setFilterType] = useState<'round' | 'week'>('round'); // Toggle between round and week filter
  const [selectedRound, setSelectedRound] = useState<number>(0);
  const [selectedWeek, setSelectedWeek] = useState<number>(0);
  const [topCount, setTopCount] = useState<number>(5); // For Top N selection
  const [statsPage, setStatsPage] = useState<number>(0); // For full stats pagination
  const [playersPerPage] = useState<number>(15); // Players per page for full stats
  const [customPlayerNames, setCustomPlayerNames] = useState<Record<string, string>>({}); // Custom display names for players
  const [posterStyle, setPosterStyle] = useState<'single' | 'table'>('table'); // Style toggle
  
  // Local stats fetching state
  const [players, setPlayers] = useState<PlayerStats[]>(initialPlayers);
  const [isFetchingStats, setIsFetchingStats] = useState(false);

  // Sync players when initialPlayers prop changes or when filters are set to "All"
  useEffect(() => {
    const isRoundFilter = activeTheme === 'player-of-day' || activeTheme === 'team-of-day' || (['golden-boot', 'golden-glove', 'golden-ball', 'full-stats'].includes(activeTheme) && filterType === 'round');
    const isWeekFilter = activeTheme === 'player-of-week' || activeTheme === 'team-of-week' || (['golden-boot', 'golden-glove', 'golden-ball', 'full-stats'].includes(activeTheme) && filterType === 'week');
    
    if (isRoundFilter && selectedRound === 0) {
      setPlayers(initialPlayers);
    } else if (isWeekFilter && selectedWeek === 0) {
      setPlayers(initialPlayers);
    }
  }, [initialPlayers, selectedRound, selectedWeek, activeTheme, filterType]);

  // Fetch filtered stats for specific round/week
  useEffect(() => {
    const fetchStats = async () => {
      const isRoundFilter = activeTheme === 'player-of-day' || activeTheme === 'team-of-day' || (['golden-boot', 'golden-glove', 'golden-ball', 'full-stats'].includes(activeTheme) && filterType === 'round');
      const isWeekFilter = activeTheme === 'player-of-week' || activeTheme === 'team-of-week' || (['golden-boot', 'golden-glove', 'golden-ball', 'full-stats'].includes(activeTheme) && filterType === 'week');
      
      const targetRound = isRoundFilter ? selectedRound : 0;
      const targetWeek = isWeekFilter ? selectedWeek : 0;

      // If no specific round/week is selected, we use the parent's data
      if (targetRound === 0 && targetWeek === 0) return;
      if (!seasonId) return;

      setIsFetchingStats(true);
      try {
        const { fetchWithTokenRefresh } = await import('@/lib/token-refresh');
        const urlParams = new URLSearchParams(window.location.search);
        const viewMode = urlParams.get('view');
        
        let url = `/api/committee/player-stats-by-round?season_id=${seasonId}`;
        if (viewMode === 'full-season') {
          url += `&view=full-season`;
        } else if (tournamentId) {
          url += `&tournament_id=${tournamentId}`;
        }

        if (targetWeek > 0) {
          const weekRange = getWeekRange(targetWeek);
          if (weekRange && weekRange.start > 0) {
            url += `&start_round=${weekRange.start}&end_round=${weekRange.end}`;
          } else {
            const startRound = (targetWeek - 1) * 7 + 1;
            const endRound = targetWeek * 7;
            url += `&start_round=${startRound}&end_round=${endRound}`;
          }
        } else if (targetRound > 0) {
          url += `&round_number=${targetRound}`;
        }

        const response = await fetchWithTokenRefresh(url);
        if (response.ok) {
          const data = await response.json();
          setPlayers(data.players || []);
        }
      } catch (error) {
        console.error('Error fetching poster stats:', error);
      } finally {
        setIsFetchingStats(false);
      }
    };

    fetchStats();
  }, [selectedRound, selectedWeek, filterType, activeTheme, tournamentId, seasonId]);

  // Custom image upload state
  const [customPlayerPhoto, setCustomPlayerPhoto] = useState<string | null>(null); // Custom uploaded player photo URL
  const [customTeamLogo, setCustomTeamLogo] = useState<string | null>(null); // Custom uploaded team logo URL
  const [customHomeTeamLogo, setCustomHomeTeamLogo] = useState<string | null>(null); // Custom uploaded home team logo URL for Team of Day
  const [customAwayTeamLogo, setCustomAwayTeamLogo] = useState<string | null>(null); // Custom uploaded away team logo URL for Team of Day
  const [isRemovingBackground, setIsRemovingBackground] = useState(false); // Background removal in progress
  const [backgroundRemovalError, setBackgroundRemovalError] = useState<string | null>(null); // Error message
  
  // Team of Week player selection state
  const [selectedTeamOfWeekPlayer, setSelectedTeamOfWeekPlayer] = useState<string | null>(null); // Selected player ID for Team of Week
  
  // Photo positioning state
  const [photoPosition, setPhotoPosition] = useState({ x: 50, y: 50 }); // percentage
  const [photoScale, setPhotoScale] = useState(100); // percentage
  const [photoCrop, setPhotoCrop] = useState({ width: 100, height: 100, top: 0, left: 0, right: 0, bottom: 0 }); // percentage of visible area + side crops
  const [showPhotoControls, setShowPhotoControls] = useState(false); // Toggle for photo controls
  
  // Team logo positioning state
  const [logoPosition, setLogoPosition] = useState({ x: 50, y: 50 }); // percentage
  const [logoScale, setLogoScale] = useState(100); // percentage
  const [logoCrop, setLogoCrop] = useState({ width: 100, height: 100, top: 0, left: 0, right: 0, bottom: 0 }); // percentage of visible area + side crops
  const [showLogoControls, setShowLogoControls] = useState(false); // Toggle for logo controls
  
  // Interactive mode state
  const [interactiveMode, setInteractiveMode] = useState<'none' | 'photo' | 'logo'>('none');
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [resizeHandle, setResizeHandle] = useState<'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'e' | 'w' | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [initialCrop, setInitialCrop] = useState({ width: 100, height: 100, top: 0, left: 0, right: 0, bottom: 0 });
  const [initialScale, setInitialScale] = useState(100);
  
  // Container bounds for accurate overlay positioning
  const [photoContainerBounds, setPhotoContainerBounds] = useState<DOMRect | null>(null);
  const [logoContainerBounds, setLogoContainerBounds] = useState<DOMRect | null>(null);
  
  // Action States
  const [downloading, setDownloading] = useState(false);
  const [downloadDone, setDownloadDone] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareDone, setShareDone] = useState(false);

  const theme = THEMES[activeTheme];

  // Keyboard navigation for interactive mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (interactiveMode === 'none') return;
      
      // Only handle arrow keys
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
      
      // Prevent default scrolling behavior
      e.preventDefault();
      
      // Determine step size (larger step with shift key)
      const step = e.shiftKey ? 5 : 1;
      
      if (interactiveMode === 'photo') {
        setPhotoPosition(prev => {
          let newX = prev.x;
          let newY = prev.y;
          
          if (e.key === 'ArrowLeft') newX = Math.max(-1000, prev.x - step);
          if (e.key === 'ArrowRight') newX = Math.min(1000, prev.x + step);
          if (e.key === 'ArrowUp') newY = Math.max(-1000, prev.y - step);
          if (e.key === 'ArrowDown') newY = Math.min(1000, prev.y + step);
          
          return { x: newX, y: newY };
        });
      } else if (interactiveMode === 'logo') {
        setLogoPosition(prev => {
          let newX = prev.x;
          let newY = prev.y;
          
          if (e.key === 'ArrowLeft') newX = Math.max(-1000, prev.x - step);
          if (e.key === 'ArrowRight') newX = Math.min(1000, prev.x + step);
          if (e.key === 'ArrowUp') newY = Math.max(-1000, prev.y - step);
          if (e.key === 'ArrowDown') newY = Math.min(1000, prev.y + step);
          
          return { x: newX, y: newY };
        });
      }
    };
    
    // Add event listener when interactive mode is active
    if (interactiveMode !== 'none') {
      window.addEventListener('keydown', handleKeyDown);
    }
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [interactiveMode]);

  // Update container bounds when interactive mode changes or layout updates
  useEffect(() => {
    const updateBounds = () => {
      if (posterRef.current) {
        const posterRect = posterRef.current.getBoundingClientRect();
        
        if (interactiveMode === 'photo') {
          const photoContainer = posterRef.current.querySelector('[data-photo-container="true"]');
          if (photoContainer) {
            const containerRect = photoContainer.getBoundingClientRect();
            // Calculate position relative to poster
            const relativeRect = new DOMRect(
              containerRect.left - posterRect.left,
              containerRect.top - posterRect.top,
              containerRect.width,
              containerRect.height
            );
            setPhotoContainerBounds(relativeRect);
          }
        } else if (interactiveMode === 'logo') {
          const logoContainer = posterRef.current.querySelector('[data-logo-container="true"]');
          if (logoContainer) {
            const containerRect = logoContainer.getBoundingClientRect();
            // Calculate position relative to poster
            const relativeRect = new DOMRect(
              containerRect.left - posterRect.left,
              containerRect.top - posterRect.top,
              containerRect.width,
              containerRect.height
            );
            setLogoContainerBounds(relativeRect);
          }
        }
      }
    };

    if (interactiveMode !== 'none') {
      // Update immediately
      setTimeout(updateBounds, 50); // Small delay to ensure DOM is ready
      
      // Update on resize or scroll
      window.addEventListener('resize', updateBounds);
      window.addEventListener('scroll', updateBounds);
      
      // Update periodically to catch any layout changes
      const interval = setInterval(updateBounds, 100);
      
      return () => {
        window.removeEventListener('resize', updateBounds);
        window.removeEventListener('scroll', updateBounds);
        clearInterval(interval);
      };
    }
  }, [interactiveMode, photoCrop, logoCrop, photoPosition, logoPosition, photoScale, logoScale]);

  // Get available matchdays for Player of Day based on awards
  const availableMatchdays = useMemo(() => {
    if (activeTheme === 'player-of-day' && playerAwards.length > 0) {
      const matchdays = playerAwards
        .filter(a => a.award_type === 'player_of_day' && a.matchday)
        .map(a => a.matchday!)
        .filter((v, i, arr) => arr.indexOf(v) === i) // unique values
        .sort((a, b) => a - b);
      return matchdays;
    }
    if (activeTheme === 'team-of-day' && playerAwards.length > 0) {
      const matchdays = playerAwards
        .filter(a => a.award_type === 'team_of_day' && a.matchday)
        .map(a => a.matchday!)
        .filter((v, i, arr) => arr.indexOf(v) === i) // unique values
        .sort((a, b) => a - b);
      return matchdays;
    }
    return [];
  }, [activeTheme, playerAwards]);

  // Get available weeks for Player of Week based on awards
  const availableWeeksFromAwards = useMemo(() => {
    if (activeTheme === 'player-of-week' && playerAwards.length > 0) {
      const weeks = playerAwards
        .filter(a => a.award_type === 'player_of_week' && a.week)
        .map(a => a.week!)
        .filter((v, i, arr) => arr.indexOf(v) === i) // unique values
        .sort((a, b) => a - b);
      return weeks;
    }
    if (activeTheme === 'team-of-week' && playerAwards.length > 0) {
      const weeks = playerAwards
        .filter(a => a.award_type === 'team_of_week' && a.week)
        .map(a => a.week!)
        .filter((v, i, arr) => arr.indexOf(v) === i) // unique values
        .sort((a, b) => a - b);
      return weeks;
    }
    return [];
  }, [activeTheme, playerAwards]);

  // Get award winner for Player of Day/Week
  const getAwardWinner = (): PlayerStats | null => {
    if (activeTheme === 'player-of-day') {
      // Find player who received player_of_day award for selected matchday
      const award = playerAwards.find(a => 
        a.award_type === 'player_of_day' && 
        (selectedRound === 0 || a.matchday === selectedRound)
      );
      if (award) {
        return players.find(p => p.player_id === award.player_id) || null;
      }
      // Fallback to top player if no award found
      return players.length > 0 ? players[0] : null;
    } else if (activeTheme === 'player-of-week') {
      // Find player who received player_of_week award for selected week
      const award = playerAwards.find(a => 
        a.award_type === 'player_of_week' && 
        (selectedWeek === 0 || a.week === selectedWeek)
      );
      if (award) {
        return players.find(p => p.player_id === award.player_id) || null;
      }
      // Fallback to top player if no award found
      return players.length > 0 ? players[0] : null;
    }
    return null;
  };

  // Get Team of Week award
  const getTeamOfWeekAward = (): PlayerAward | null => {
    if (activeTheme === 'team-of-week') {
      const award = playerAwards.find(a => 
        a.award_type === 'team_of_week' && 
        (selectedWeek === 0 || a.week === selectedWeek)
      );
      return award || null;
    }
    return null;
  };

  // Get Team of Day award
  const getTeamOfDayAward = (): PlayerAward | null => {
    if (activeTheme === 'team-of-day') {
      const award = playerAwards.find(a => 
        a.award_type === 'team_of_day' && 
        (selectedRound === 0 || a.matchday === selectedRound)
      );
      return award || null;
    }
    return null;
  };

  // Get filtered and sorted players based on theme
  const getFilteredPlayers = () => {
    let filtered = [...players];
    let startRankRef = 1; // Track starting rank for pagination
    
    if (activeTheme === 'golden-boot') {
      filtered = filtered
        .filter(p => p.goals_scored > 0)
        .sort((a, b) => b.goals_scored - a.goals_scored)
        .slice(0, topCount);
    } else if (activeTheme === 'golden-glove') {
      filtered = filtered
        .filter(p => p.matches_played > 0)
        .sort((a, b) => b.clean_sheets - a.clean_sheets)
        .slice(0, topCount);
    } else if (activeTheme === 'golden-ball') {
      filtered = filtered
        .filter(p => p.matches_played >= 3)
        .sort((a, b) => b.points - a.points)
        .slice(0, topCount);
    } else if (activeTheme === 'full-stats') {
      // Full stats - paginated by points
      const sortedByPoints = filtered.sort((a, b) => b.points - a.points);
      const startIdx = statsPage * playersPerPage;
      const endIdx = startIdx + playersPerPage;
      filtered = sortedByPoints.slice(startIdx, endIdx);
      // Store the start rank for pagination display (1-indexed)
      startRankRef = startIdx + 1;
    } else if (activeTheme === 'player-of-day' || activeTheme === 'player-of-week') {
      const winner = getAwardWinner();
      filtered = winner ? [winner] : [];
    } else if (activeTheme === 'team-of-week') {
      // Team of Week - returns empty array, actual data comes from award
      filtered = [];
    } else if (activeTheme === 'team-of-day') {
      // Team of Day - returns empty array, actual data comes from award
      filtered = [];
    } else {
      filtered = filtered.sort((a, b) => b.points - a.points).slice(0, topCount);
    }
    
    return { players: filtered, startRank: startRankRef };
  };

  const { players: filteredPlayers, startRank } = getFilteredPlayers();
  
  // Apply custom player names if any
  const playersWithCustomNames = filteredPlayers.map(player => ({
    ...player,
    player_name: customPlayerNames[player.player_id] || player.player_name
  }));

  const teamOfDayAward = getTeamOfDayAward();
  const teamOfWeekAward = getTeamOfWeekAward();
  
  // Calculate total pages for full stats
  const totalPages = Math.ceil(players.length / playersPerPage);
  const hasNextPage = statsPage < totalPages - 1;
  const hasPrevPage = statsPage > 0;

  const handleDownload = async () => {
    if (!posterRef.current || downloading) return;
    setDownloading(true);
    
    try {
      const dataUrl = await htmlToImage.toPng(posterRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: theme.bg[0],
      });

      const blob = await (await fetch(dataUrl)).blob();
      const blobUrl = URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${activeTheme}-poster.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      setTimeout(() => URL.revokeObjectURL(blobUrl), 100);

      setDownloadDone(true);
      setTimeout(() => setDownloadDone(false), 2500);
    } catch (err) {
      console.error('Download error:', err);
    } finally {
      setDownloading(false);
    }
  };

  const handleShare = async () => {
    if (!posterRef.current || sharing) return;
    setSharing(true);
    
    try {
      const dataUrl = await htmlToImage.toPng(posterRef.current, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: theme.bg[0],
      });

      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'poster.png', { type: 'image/png' });

      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${theme.label} Poster`,
        });
        setShareDone(true);
        setTimeout(() => setShareDone(false), 2500);
      } else {
        await handleDownload();
      }
    } catch (err) {
      console.error('Share error:', err);
    } finally {
      setSharing(false);
    }
  };

  // Logo Component
  const LogoBranding = ({ size = 48 }: { size?: number }) => (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      zIndex: 10,
    }}>
      <div style={{
        width: size,
        height: size,
        borderRadius: size > 50 ? 14 : 12,
        overflow: 'hidden',
        background: '#ffffff',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
        padding: size > 50 ? 6 : 5,
      }}>
        <img 
          src="/logo.png" 
          alt="SS League"
          crossOrigin="anonymous"
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <span style={{
          fontSize: size > 50 ? 22 : 19,
          fontWeight: 700,
          background: 'linear-gradient(90deg, #0066FF, #9580FF)',
          WebkitBackgroundClip: 'text',
          backgroundClip: 'text',
          color: 'transparent',
          WebkitTextFillColor: 'transparent',
          letterSpacing: '-0.02em',
        }}>
          SS League
        </span>
        <span style={{ fontSize: size > 50 ? 11 : 10, color: '#6B7280', fontWeight: 500 }}>
          Auction Platform
        </span>
      </div>
    </div>
  );

  // File upload handlers
  const handlePlayerPhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCustomPlayerPhoto(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleTeamLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCustomTeamLogo(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const clearCustomPlayerPhoto = () => {
    setCustomPlayerPhoto(null);
  };

  const clearCustomTeamLogo = () => {
    setCustomTeamLogo(null);
    if (activeTheme === 'team-of-day' && teamOfDayAward) {
      if (teamOfDayAward.team_name === teamOfDayAward.home_team) {
        setCustomHomeTeamLogo(null);
      } else if (teamOfDayAward.team_name === teamOfDayAward.away_team) {
        setCustomAwayTeamLogo(null);
      }
    }
  };

  // Manual background removal handler
  const handleRemoveBackground = async (imageType: 'player' | 'logo' | 'home-logo' | 'away-logo') => {
    setIsRemovingBackground(true);
    setBackgroundRemovalError(null);

    try {
      let sourceUrl: string | null = null;
      
      // Get the source image URL based on type
      if (imageType === 'player') {
        if (activeTheme === 'team-of-week' && teamOfWeekAward) {
          sourceUrl = customPlayerPhoto || teamOfWeekAward.player_photo || null;
        } else {
          sourceUrl = customPlayerPhoto || (filteredPlayers.length > 0 ? (filteredPlayers[0].player_photo || filteredPlayers[0].photo_url) : null);
        }
      } else if (imageType === 'logo') {
        // For Team of Day, get the main team logo
        if (activeTheme === 'team-of-day' && teamOfDayAward) {
          sourceUrl = customTeamLogo || teamOfDayAward.team_logo || null;
        } else if (activeTheme === 'team-of-week' && teamOfWeekAward) {
          sourceUrl = customTeamLogo || teamOfWeekAward.team_logo || null;
        } else {
          sourceUrl = customTeamLogo || (filteredPlayers.length > 0 ? filteredPlayers[0].team_logo : null);
        }
      } else if (imageType === 'home-logo') {
        // Home team logo for Team of Day
        sourceUrl = customHomeTeamLogo || (teamOfDayAward?.home_team_logo || null);
      } else if (imageType === 'away-logo') {
        // Away team logo for Team of Day
        sourceUrl = customAwayTeamLogo || (teamOfDayAward?.away_team_logo || null);
      }

      if (!sourceUrl) {
        throw new Error('No image available to remove background');
      }

      console.log(`🎨 Starting server-side background removal for ${imageType}...`);

      // Import the background removal utility (now uses server-side API)
      const { removeBackgroundClient } = await import('@/lib/background-removal');
      
      // Remove background using WithoutBG API (server-side, fast)
      const resultDataUrl = await removeBackgroundClient(sourceUrl);

      console.log(`✅ Background removed successfully for ${imageType} (server-side)`);
      
      // Set the result as custom image
      if (imageType === 'player') {
        setCustomPlayerPhoto(resultDataUrl);
      } else if (imageType === 'logo') {
        setCustomTeamLogo(resultDataUrl);
        if (activeTheme === 'team-of-day' && teamOfDayAward) {
          if (teamOfDayAward.team_name === teamOfDayAward.home_team) {
            setCustomHomeTeamLogo(resultDataUrl);
          } else if (teamOfDayAward.team_name === teamOfDayAward.away_team) {
            setCustomAwayTeamLogo(resultDataUrl);
          }
        }
      } else if (imageType === 'home-logo') {
        setCustomHomeTeamLogo(resultDataUrl);
        if (activeTheme === 'team-of-day' && teamOfDayAward && teamOfDayAward.team_name === teamOfDayAward.home_team) {
          setCustomTeamLogo(resultDataUrl);
        }
      } else if (imageType === 'away-logo') {
        setCustomAwayTeamLogo(resultDataUrl);
        if (activeTheme === 'team-of-day' && teamOfDayAward && teamOfDayAward.team_name === teamOfDayAward.away_team) {
          setCustomTeamLogo(resultDataUrl);
        }
      }
    } catch (error: any) {
      console.error('❌ Background removal error:', error);
      setBackgroundRemovalError(error.message || 'Failed to remove background');
    } finally {
      setIsRemovingBackground(false);
    }
  };

    return (
    <>
      {/* 1. TOGGLE BUTTON - Always Visible */}
      <button
        onClick={() => setShowPoster(!showPoster)}
        className={`px-3 py-1.5 transition-all text-xs font-mono uppercase tracking-wider font-extrabold rounded-xl shadow-sm cursor-pointer flex items-center gap-2 ${
          showPoster
            ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
            : 'bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 border border-slate-200/60'
        }`}
      >
        <BarChart2 className="w-4 h-4 text-amber-500" />
        {showPoster ? 'Hide Poster Studio' : 'Open Poster Studio'}
      </button>

      {/* 2. COLLAPSIBLE PANEL */}
      {showPoster && (
        <div className="mt-4 console-card bg-white border border-slate-200/60 rounded-2xl overflow-hidden font-mono shadow-sm relative">
          
          {/* 2A. STUDIO HEADER */}
          <div className="px-5 py-4 border-b border-slate-100 bg-slate-50/40 font-mono">
            <div className="flex justify-between items-start mb-4">
              <div className="flex items-center gap-2.5">
                <Palette className="w-5 h-5 text-amber-505" />
                <div>
                  <h3 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider">
                    Poster Studio
                  </h3>
                  <p className="text-[10px] text-slate-400 font-bold uppercase mt-0.5">
                    Create premium shareable posters for stats & milestones
                  </p>
                </div>
              </div>
            </div>

            {/* Theme Tabs */}
            <div className="flex gap-2 flex-wrap mb-3">
              {(Object.entries(THEMES) as [ThemeKey, Theme][]).map(([key, t]) => {
                const isActive = activeTheme === key;
                let iconElement = <Trophy className="w-3.5 h-3.5 mr-1.5" />;
                if (key === 'golden-boot') iconElement = <Trophy className="w-3.5 h-3.5 mr-1.5" style={{ color: t.accent }} />;
                if (key === 'golden-ball') iconElement = <Award className="w-3.5 h-3.5 mr-1.5" style={{ color: t.accent }} />;
                if (key === 'golden-glove') iconElement = <Award className="w-3.5 h-3.5 mr-1.5" style={{ color: t.accent }} />;
                if (key === 'player-of-day') iconElement = <Calendar className="w-3.5 h-3.5 mr-1.5" style={{ color: t.accent }} />;
                if (key === 'player-of-week') iconElement = <Trophy className="w-3.5 h-3.5 mr-1.5" style={{ color: t.accent }} />;
                if (key === 'team-of-week') iconElement = <Users className="w-3.5 h-3.5 mr-1.5" style={{ color: t.accent }} />;
                if (key === 'team-of-day') iconElement = <Users className="w-3.5 h-3.5 mr-1.5" style={{ color: t.accent }} />;
                if (key === 'full-stats') iconElement = <BarChart2 className="w-3.5 h-3.5 mr-1.5" style={{ color: t.accent }} />;

                return (
                  <button
                    key={key}
                    onClick={() => setActiveTheme(key)}
                    className={`flex items-center px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold transition-all border shadow-sm cursor-pointer ${
                      isActive
                        ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                        : 'bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 border border-slate-200/60'
                    }`}
                  >
                    {iconElement}
                    <span>{t.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Round/Week Filter Toggle and Selection */}
            {(roundOptions.length > 0 || weekOptions.length > 0 || availableMatchdays.length > 0 || availableWeeksFromAwards.length > 0) && 
             activeTheme !== 'full-stats' && (
              <div className="mt-3 space-y-3">
                {/* Filter Type Toggle */}
                {roundOptions.length > 0 && weekOptions.length > 0 && 
                 activeTheme !== 'player-of-day' && activeTheme !== 'player-of-week' && activeTheme !== 'team-of-week' && activeTheme !== 'team-of-day' && (
                  <div className="flex gap-2 mb-2 font-mono">
                    <button
                      onClick={() => {
                        setFilterType('round');
                        setSelectedWeek(0);
                      }}
                      className={`flex-1 px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold transition-all border shadow-sm cursor-pointer ${
                        filterType === 'round'
                          ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                          : 'bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 border border-slate-200/60'
                      }`}
                    >
                      Round Filter
                    </button>
                    <button
                      onClick={() => {
                        setFilterType('week');
                        setSelectedRound(0);
                      }}
                      className={`flex-1 px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold transition-all border shadow-sm cursor-pointer ${
                        filterType === 'week'
                          ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                          : 'bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 border border-slate-200/60'
                      }`}
                    >
                      Week Filter
                    </button>
                  </div>
                )}
                
                {/* Filter Selection Dropdown */}
                <div className="font-mono">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                    {activeTheme === 'player-of-day' 
                      ? 'Filter by Matchday:' 
                      : activeTheme === 'team-of-day'
                        ? 'Filter by Matchday:'
                        : activeTheme === 'player-of-week'
                          ? 'Filter by Week:'
                          : activeTheme === 'team-of-week'
                            ? 'Filter by Week:'
                            : filterType === 'week' 
                              ? 'Filter by Week:' 
                              : 'Filter by Round:'}
                  </label>
                  <select
                    value={
                      activeTheme === 'player-of-day' || activeTheme === 'team-of-day'
                        ? selectedRound 
                        : activeTheme === 'player-of-week' || activeTheme === 'team-of-week'
                          ? selectedWeek
                          : filterType === 'week' 
                            ? selectedWeek 
                            : selectedRound
                    }
                    onChange={(e) => {
                      const value = Number(e.target.value);
                      if (activeTheme === 'player-of-day' || activeTheme === 'team-of-day') {
                        setSelectedRound(value);
                      } else if (activeTheme === 'player-of-week' || activeTheme === 'team-of-week') {
                        setSelectedWeek(value);
                      } else if (filterType === 'week') {
                        setSelectedWeek(value);
                      } else {
                        setSelectedRound(value);
                      }
                    }}
                    className="w-full py-2 px-4 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-850 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono font-extrabold cursor-pointer"
                  >
                    <option value={0}>
                      {activeTheme === 'player-of-day' || activeTheme === 'team-of-day'
                        ? 'LATEST MATCHDAY' 
                        : activeTheme === 'player-of-week' || activeTheme === 'team-of-week'
                          ? 'ALL WEEKS'
                          : filterType === 'week' 
                            ? 'ALL WEEKS' 
                            : 'COMPLETE SEASON'}
                    </option>
                    {(() => {
                      if (activeTheme === 'player-of-day' || activeTheme === 'team-of-day') {
                        return availableMatchdays.map(matchday => (
                          <option key={matchday} value={matchday}>
                            MATCHDAY {matchday}
                          </option>
                        ));
                      }
                      
                      if (activeTheme === 'player-of-week' || activeTheme === 'team-of-week') {
                        return availableWeeksFromAwards.map(week => {
                          const { start, end } = getWeekRange(week);
                          return (
                            <option key={week} value={week}>
                              WEEK {week} (R{start}-R{end})
                            </option>
                          );
                        });
                      }
                      
                      const options = filterType === 'week' ? weekOptions : roundOptions;
                      return options.map(opt => {
                        if (filterType === 'week') {
                          const { start, end } = getWeekRange(opt);
                          return (
                            <option key={opt} value={opt}>
                              WEEK {opt} (R{start}-R{end})
                            </option>
                          );
                        } else {
                          return (
                            <option key={opt} value={opt}>
                              TILL ROUND {opt}
                            </option>
                          );
                        }
                      });
                    })()}
                  </select>
                </div>
              </div>
            )}

            {/* Team of Week Player Selection */}
            {activeTheme === 'team-of-week' && teamOfWeekAward && (
              <div className="mt-3 font-mono">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Select Player from Team:
                </label>
                <select
                  value={selectedTeamOfWeekPlayer || ''}
                  onChange={(e) => {
                    const playerId = e.target.value || null;
                    setSelectedTeamOfWeekPlayer(playerId);
                  }}
                  className="w-full py-2 px-4 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-850 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono font-extrabold cursor-pointer"
                >
                  <option value="">-- SELECT A PLAYER --</option>
                  {players
                    .filter(p => p.team_name === teamOfWeekAward.team_name)
                    .map(player => (
                      <option key={player.player_id} value={player.player_id}>
                        {player.player_name}
                      </option>
                    ))
                  }
                </select>
                {!selectedTeamOfWeekPlayer && (
                  <p className="text-[9px] text-slate-450 font-bold uppercase mt-1 flex items-center gap-1">
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                    Select a player to show their photo on the poster
                  </p>
                )}
                {selectedTeamOfWeekPlayer && (
                  <p className="text-[9px] text-emerald-605 font-bold uppercase mt-1 flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    Selected: {players.find(p => p.player_id === selectedTeamOfWeekPlayer)?.player_name}
                  </p>
                )}
              </div>
            )}

            {/* Poster Style Toggle for Golden Boot/Ball/Glove/Full Stats */}
            {(activeTheme === 'golden-boot' || activeTheme === 'golden-ball' || 
              activeTheme === 'golden-glove' || activeTheme === 'full-stats') && (
              <div className="mt-3 font-mono">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Poster Style:
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setPosterStyle('single')}
                    className={`flex-1 px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold transition-all border shadow-sm cursor-pointer ${
                      posterStyle === 'single'
                        ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                        : 'bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 border border-slate-200/60'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 mr-1.5 inline-block" />
                    Single Player View
                  </button>
                  <button
                    onClick={() => setPosterStyle('table')}
                    className={`flex-1 px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold transition-all border shadow-sm cursor-pointer ${
                      posterStyle === 'table'
                        ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                        : 'bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 border border-slate-200/60'
                    }`}
                  >
                    <BarChart2 className="w-3.5 h-3.5 mr-1.5 inline-block" />
                    Leaderboard Table
                  </button>
                </div>
              </div>
            )}

            {/* Photo Position & Crop Controls */}
            {(posterStyle === 'single' || activeTheme === 'player-of-day' || activeTheme === 'player-of-week' || activeTheme === 'team-of-week') && (
              <div className="mt-3 font-mono">
                <button
                  onClick={() => setShowPhotoControls(!showPhotoControls)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold bg-slate-50 text-slate-700 border border-slate-200/60 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-amber-500" />
                    Photo Position & Crop
                  </span>
                  <svg 
                    className={`w-4 h-4 transition-transform ${showPhotoControls ? 'rotate-180' : ''}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {showPhotoControls && (
                  <div className="mt-3 p-3 rounded-xl bg-white border border-slate-200/60 space-y-4 font-mono">
                    {/* Interactive Mode Toggle */}
                    <div className="pb-3 border-b border-slate-100">
                      <button
                        onClick={() => setInteractiveMode(interactiveMode === 'photo' ? 'none' : 'photo')}
                        className={`w-full px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold transition-all border shadow-sm cursor-pointer flex items-center justify-center gap-1.5 ${
                          interactiveMode === 'photo'
                            ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                        }`}
                      >
                        <Focus className="w-3.5 h-3.5" />
                        {interactiveMode === 'photo' ? 'Interactive Mode Active' : 'Enable Interactive Drag/Resize'}
                      </button>
                      {interactiveMode === 'photo' && (
                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-2 text-center">
                          Click and drag on the photo in the preview, or use arrow keys to reposition it
                        </p>
                      )}
                    </div>

                    {/* Custom Photo Upload */}
                    <div className="pb-3 border-b border-slate-100">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                        Custom Player Photo
                      </label>
                      {customPlayerPhoto ? (
                        <div className="space-y-2">
                          <div className="relative w-full h-32 rounded-xl overflow-hidden border border-slate-200">
                            <img 
                              src={customPlayerPhoto} 
                              alt="Custom player" 
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <button
                            onClick={clearCustomPlayerPhoto}
                            className="w-full px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold hover:bg-rose-105 transition-all cursor-pointer"
                          >
                            Remove Custom Photo
                          </button>
                        </div>
                      ) : (
                        <label className="w-full px-3 py-2 bg-violet-50 text-violet-700 border border-violet-200 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold hover:bg-violet-100 transition-all cursor-pointer flex items-center justify-center gap-2">
                          <Download className="w-4 h-4" />
                          Upload Custom Photo
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePlayerPhotoUpload}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>

                    {/* Manual Background Removal for Photo */}
                    <div className="pb-3 border-b border-slate-100">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                        Remove Background
                      </label>
                      <button
                        onClick={() => handleRemoveBackground('player')}
                        disabled={isRemovingBackground || (!customPlayerPhoto && filteredPlayers.length === 0 && !(activeTheme === 'team-of-week' && teamOfWeekAward))}
                        className="w-full px-3 py-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white border border-orange-600 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold hover:from-amber-600 hover:to-orange-650 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                      >
                        {isRemovingBackground ? (
                          <>
                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                            Removing background...
                          </>
                        ) : (
                          <>
                            Remove Background
                          </>
                        )}
                      </button>
                      {backgroundRemovalError && (
                        <p className="text-[10px] text-rose-600 font-bold uppercase mt-2 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                          {backgroundRemovalError}
                        </p>
                      )}
                      <p className="text-[9px] text-slate-400 font-bold uppercase mt-2 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-slate-400" />
                        Uses API credits - click only when needed
                      </p>
                    </div>
                    
                    {/* Horizontal Position */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-450 uppercase tracking-wider">
                          Horizontal Position
                        </label>
                        <input
                          type="number"
                          min="-1000"
                          max="1000"
                          value={photoPosition.x}
                          onChange={(e) => setPhotoPosition(prev => ({ ...prev, x: Number(e.target.value) }))}
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-350 rounded text-center text-slate-800 bg-white font-mono"
                        />
                      </div>
                      <input
                        type="range"
                        min="-1000"
                        max="1000"
                        value={photoPosition.x}
                        onChange={(e) => setPhotoPosition(prev => ({ ...prev, x: Number(e.target.value) }))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer border border-slate-205"
                        style={{
                          accentColor: theme.accent,
                        }}
                      />
                    </div>

                    {/* Vertical Position */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">
                          Vertical Position
                        </label>
                        <input
                          type="number"
                          min="-1000"
                          max="1000"
                          value={photoPosition.y}
                          onChange={(e) => setPhotoPosition(prev => ({ ...prev, y: Number(e.target.value) }))}
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-355 rounded text-center text-slate-800 bg-white font-mono"
                        />
                      </div>
                      <input
                        type="range"
                        min="-1000"
                        max="1000"
                        value={photoPosition.y}
                        onChange={(e) => setPhotoPosition(prev => ({ ...prev, y: Number(e.target.value) }))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer border border-slate-205"
                        style={{
                          accentColor: theme.accent,
                        }}
                      />
                    </div>

                    {/* Photo Scale/Zoom */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">
                          Photo Scale
                        </label>
                        <input
                          type="number"
                          min="50"
                          max="200"
                          value={photoScale}
                          onChange={(e) => setPhotoScale(Number(e.target.value))}
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-355 rounded text-center text-slate-800 bg-white font-mono"
                        />
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="200"
                        value={photoScale}
                        onChange={(e) => setPhotoScale(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer border border-slate-205"
                        style={{
                          accentColor: theme.accent,
                        }}
                      />
                    </div>

                    {/* Crop Width */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">
                          Crop Width
                        </label>
                        <input
                          type="number"
                          min="20"
                          max="100"
                          value={photoCrop.width}
                          onChange={(e) => setPhotoCrop(prev => ({ ...prev, width: Number(e.target.value) }))}
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-355 rounded text-center text-slate-800 bg-white font-mono"
                        />
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="100"
                        value={photoCrop.width}
                        onChange={(e) => setPhotoCrop(prev => ({ ...prev, width: Number(e.target.value) }))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer border border-slate-205"
                        style={{
                          accentColor: theme.accent,
                        }}
                      />
                    </div>

                    {/* Crop Height */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">
                          Crop Height
                        </label>
                        <input
                          type="number"
                          min="20"
                          max="100"
                          value={photoCrop.height}
                          onChange={(e) => setPhotoCrop(prev => ({ ...prev, height: Number(e.target.value) }))}
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-355 rounded text-center text-slate-800 bg-white font-mono"
                        />
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="100"
                        value={photoCrop.height}
                        onChange={(e) => setPhotoCrop(prev => ({ ...prev, height: Number(e.target.value) }))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer border border-slate-205"
                        style={{
                          accentColor: theme.accent,
                        }}
                      />
                    </div>

                    {/* Crop from Top */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">
                          Crop from Top
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={photoCrop.top}
                          onChange={(e) => setPhotoCrop(prev => ({ ...prev, top: Number(e.target.value) }))}
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-355 rounded text-center text-slate-800 bg-white font-mono"
                        />
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="50"
                        value={photoCrop.top}
                        onChange={(e) => setPhotoCrop(prev => ({ ...prev, top: Number(e.target.value) }))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer border border-slate-205"
                        style={{
                          accentColor: theme.accent,
                        }}
                      />
                    </div>

                    {/* Crop from Bottom */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">
                          Crop from Bottom
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={photoCrop.bottom}
                          onChange={(e) => setPhotoCrop(prev => ({ ...prev, bottom: Number(e.target.value) }))}
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-355 rounded text-center text-slate-800 bg-white font-mono"
                        />
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="50"
                        value={photoCrop.bottom}
                        onChange={(e) => setPhotoCrop(prev => ({ ...prev, bottom: Number(e.target.value) }))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer border border-slate-205"
                        style={{
                          accentColor: theme.accent,
                        }}
                      />
                    </div>

                    {/* Crop from Left */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">
                          Crop from Left
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={photoCrop.left}
                          onChange={(e) => setPhotoCrop(prev => ({ ...prev, left: Number(e.target.value) }))}
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-355 rounded text-center text-slate-800 bg-white font-mono"
                        />
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="50"
                        value={photoCrop.left}
                        onChange={(e) => setPhotoCrop(prev => ({ ...prev, left: Number(e.target.value) }))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer border border-slate-205"
                        style={{
                          accentColor: theme.accent,
                        }}
                      />
                    </div>

                    {/* Crop from Right */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">
                          Crop from Right
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={photoCrop.right}
                          onChange={(e) => setPhotoCrop(prev => ({ ...prev, right: Number(e.target.value) }))}
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-355 rounded text-center text-slate-800 bg-white font-mono"
                        />
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="50"
                        value={photoCrop.right}
                        onChange={(e) => setPhotoCrop(prev => ({ ...prev, right: Number(e.target.value) }))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer border border-slate-205"
                        style={{
                          accentColor: theme.accent,
                        }}
                      />
                    </div>

                    {/* Reset Button */}
                    <button
                      onClick={() => {
                        setPhotoPosition({ x: 50, y: 50 });
                        setPhotoScale(100);
                        setPhotoCrop({ width: 100, height: 100, top: 0, left: 0, right: 0, bottom: 0 });
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold bg-slate-800 text-amber-400 border border-slate-900 shadow-md hover:bg-slate-900 transition-all cursor-pointer"
                    >
                      Reset Photo Settings
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Team Logo Position & Crop Controls */}
            {(posterStyle === 'single' || activeTheme === 'player-of-day' || activeTheme === 'player-of-week' || activeTheme === 'team-of-week' || activeTheme === 'team-of-day') && (
              <div className="mt-3 font-mono">
                <button
                  onClick={() => setShowLogoControls(!showLogoControls)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold bg-slate-50 text-slate-700 border border-slate-200/60 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  <span className="flex items-center gap-1.5">
                    <Trophy className="w-4 h-4 text-amber-500" />
                    Team Logo Position & Crop
                  </span>
                  <svg 
                    className={`w-4 h-4 transition-transform ${showLogoControls ? 'rotate-180' : ''}`} 
                    fill="none" 
                    viewBox="0 0 24 24" 
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                
                {showLogoControls && (
                  <div className="mt-3 p-3 rounded-xl bg-white border border-slate-200/60 space-y-4 font-mono">
                    {/* Interactive Mode Toggle */}
                    <div className="pb-3 border-b border-slate-100">
                      <button
                        onClick={() => setInteractiveMode(interactiveMode === 'logo' ? 'none' : 'logo')}
                        className={`w-full px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold transition-all border shadow-sm cursor-pointer flex items-center justify-center gap-1.5 ${
                          interactiveMode === 'logo'
                            ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                            : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border border-blue-200'
                        }`}
                      >
                        <Focus className="w-3.5 h-3.5" />
                        {interactiveMode === 'logo' ? 'Interactive Mode Active' : 'Enable Interactive Drag/Resize'}
                      </button>
                      {interactiveMode === 'logo' && (
                        <p className="text-[9px] text-slate-400 font-bold uppercase mt-2 text-center">
                          Click and drag on the logo in the preview, or use arrow keys to reposition it
                        </p>
                      )}
                    </div>

                    {/* Custom Logo Upload */}
                    <div className="pb-3 border-b border-slate-100">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                        Custom Team Logo
                      </label>
                      {customTeamLogo ? (
                        <div className="space-y-2">
                          <div className="relative w-full h-32 rounded-xl overflow-hidden border border-slate-200 bg-gray-50 flex items-center justify-center">
                            <img 
                              src={customTeamLogo} 
                              alt="Custom logo" 
                              className="max-w-full max-h-full object-contain"
                            />
                          </div>
                          <button
                            onClick={clearCustomTeamLogo}
                            className="w-full px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold hover:bg-rose-100 transition-all cursor-pointer"
                          >
                            Remove Custom Logo
                          </button>
                        </div>
                      ) : (
                        <label className="w-full px-3 py-2 bg-violet-50 text-violet-700 border border-violet-200 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold hover:bg-violet-100 transition-all cursor-pointer flex items-center justify-center gap-2">
                          <Download className="w-4 h-4" />
                          Upload Custom Logo
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleTeamLogoUpload}
                            className="hidden"
                          />
                        </label>
                      )}
                    </div>

                    {/* Manual Background Removal for Logo */}
                    <div className="pb-3 border-b border-slate-100">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                        Remove Background
                      </label>
                      <button
                        onClick={() => handleRemoveBackground('logo')}
                        disabled={isRemovingBackground || (!customTeamLogo && filteredPlayers.length === 0 && !(activeTheme === 'team-of-day' && teamOfDayAward) && !(activeTheme === 'team-of-week' && teamOfWeekAward))}
                        className="w-full px-3 py-2 bg-gradient-to-r from-amber-50 to-orange-50 text-white border border-orange-600 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold hover:from-amber-600 hover:to-orange-650 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                      >
                        {isRemovingBackground ? (
                          <>
                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                            Removing background...
                          </>
                        ) : (
                          <>
                            Remove Background
                          </>
                        )}
                      </button>
                      {backgroundRemovalError && (
                        <p className="text-[10px] text-rose-600 font-bold uppercase mt-2 flex items-center gap-1.5">
                          <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                          {backgroundRemovalError}
                        </p>
                      )}
                      <p className="text-[9px] text-slate-400 font-bold uppercase mt-2 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-slate-400" />
                        Uses API credits - click only when needed
                      </p>
                    </div>
                    
                    {/* Horizontal Position */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">
                          Horizontal Position
                        </label>
                        <input
                          type="number"
                          min="-1000"
                          max="1000"
                          value={logoPosition.x}
                          onChange={(e) => setLogoPosition(prev => ({ ...prev, x: Number(e.target.value) }))}
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-350 rounded text-center text-slate-800 bg-white font-mono"
                        />
                      </div>
                      <input
                        type="range"
                        min="-1000"
                        max="1000"
                        value={logoPosition.x}
                        onChange={(e) => setLogoPosition(prev => ({ ...prev, x: Number(e.target.value) }))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer border border-slate-205"
                        style={{
                          accentColor: theme.accent,
                        }}
                      />
                    </div>

                    {/* Vertical Position */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">
                          Vertical Position
                        </label>
                        <input
                          type="number"
                          min="-1000"
                          max="1000"
                          value={logoPosition.y}
                          onChange={(e) => setLogoPosition(prev => ({ ...prev, y: Number(e.target.value) }))}
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-350 rounded text-center text-slate-800 bg-white font-mono"
                        />
                      </div>
                      <input
                        type="range"
                        min="-1000"
                        max="1000"
                        value={logoPosition.y}
                        onChange={(e) => setLogoPosition(prev => ({ ...prev, y: Number(e.target.value) }))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer border border-slate-205"
                        style={{
                          accentColor: theme.accent,
                        }}
                      />
                    </div>

                    {/* Logo Scale/Zoom */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">
                          Logo Scale
                        </label>
                        <input
                          type="number"
                          min="50"
                          max="200"
                          value={logoScale}
                          onChange={(e) => setLogoScale(Number(e.target.value))}
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-350 rounded text-center text-slate-800 bg-white font-mono"
                        />
                      </div>
                      <input
                        type="range"
                        min="50"
                        max="200"
                        value={logoScale}
                        onChange={(e) => setLogoScale(Number(e.target.value))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer border border-slate-205"
                        style={{
                          accentColor: theme.accent,
                        }}
                      />
                    </div>

                    {/* Crop Width */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">
                          Crop Width
                        </label>
                        <input
                          type="number"
                          min="20"
                          max="100"
                          value={logoCrop.width}
                          onChange={(e) => setLogoCrop(prev => ({ ...prev, width: Number(e.target.value) }))}
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-350 rounded text-center text-slate-800 bg-white font-mono"
                        />
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="100"
                        value={logoCrop.width}
                        onChange={(e) => setLogoCrop(prev => ({ ...prev, width: Number(e.target.value) }))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer border border-slate-205"
                        style={{
                          accentColor: theme.accent,
                        }}
                      />
                    </div>

                    {/* Crop Height */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">
                          Crop Height
                        </label>
                        <input
                          type="number"
                          min="20"
                          max="100"
                          value={logoCrop.height}
                          onChange={(e) => setLogoCrop(prev => ({ ...prev, height: Number(e.target.value) }))}
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-350 rounded text-center text-slate-800 bg-white font-mono"
                        />
                      </div>
                      <input
                        type="range"
                        min="20"
                        max="100"
                        value={logoCrop.height}
                        onChange={(e) => setLogoCrop(prev => ({ ...prev, height: Number(e.target.value) }))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer border border-slate-205"
                        style={{
                          accentColor: theme.accent,
                        }}
                      />
                    </div>

                    {/* Crop from Top */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">
                          Crop from Top
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={logoCrop.top}
                          onChange={(e) => setLogoCrop(prev => ({ ...prev, top: Number(e.target.value) }))}
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-355 rounded text-center text-slate-800 bg-white font-mono"
                        />
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="50"
                        value={logoCrop.top}
                        onChange={(e) => setLogoCrop(prev => ({ ...prev, top: Number(e.target.value) }))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer border border-slate-205"
                        style={{
                          accentColor: theme.accent,
                        }}
                      />
                    </div>

                    {/* Crop from Bottom */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">
                          Crop from Bottom
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={logoCrop.bottom}
                          onChange={(e) => setLogoCrop(prev => ({ ...prev, bottom: Number(e.target.value) }))}
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-355 rounded text-center text-slate-800 bg-white font-mono"
                        />
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="50"
                        value={logoCrop.bottom}
                        onChange={(e) => setLogoCrop(prev => ({ ...prev, bottom: Number(e.target.value) }))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer border border-slate-205"
                        style={{
                          accentColor: theme.accent,
                        }}
                      />
                    </div>

                    {/* Crop from Left */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">
                          Crop from Left
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={logoCrop.left}
                          onChange={(e) => setLogoCrop(prev => ({ ...prev, left: Number(e.target.value) }))}
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-355 rounded text-center text-slate-800 bg-white font-mono"
                        />
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="50"
                        value={logoCrop.left}
                        onChange={(e) => setLogoCrop(prev => ({ ...prev, left: Number(e.target.value) }))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer border border-slate-205"
                        style={{
                          accentColor: theme.accent,
                        }}
                      />
                    </div>

                    {/* Crop from Right */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold text-slate-455 uppercase tracking-wider">
                          Crop from Right
                        </label>
                        <input
                          type="number"
                          min="0"
                          max="50"
                          value={logoCrop.right}
                          onChange={(e) => setLogoCrop(prev => ({ ...prev, right: Number(e.target.value) }))}
                          className="w-16 px-1.5 py-0.5 text-xs border border-slate-355 rounded text-center text-slate-800 bg-white font-mono"
                        />
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="50"
                        value={logoCrop.right}
                        onChange={(e) => setLogoCrop(prev => ({ ...prev, right: Number(e.target.value) }))}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer border border-slate-205"
                        style={{
                          accentColor: theme.accent,
                        }}
                      />
                    </div>

                    {/* Reset Button */}
                    <button
                      onClick={() => {
                        setLogoPosition({ x: 50, y: 50 });
                        setLogoScale(100);
                        setLogoCrop({ width: 100, height: 100, top: 0, left: 0, right: 0, bottom: 0 });
                      }}
                      className="w-full px-3 py-2 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold bg-slate-800 text-amber-400 border border-slate-900 shadow-md hover:bg-slate-900 transition-all cursor-pointer"
                    >
                      Reset Logo Settings
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Team of Day - Additional Logo Controls */}
            {activeTheme === 'team-of-day' && teamOfDayAward && (
              <div className="mt-3 font-mono">
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 space-y-3">
                  <h4 className="text-xs font-bold text-blue-900 mb-3 flex items-center gap-1.5"><Trophy className="w-4 h-4 text-blue-800" /> Match Logos (Home & Away)</h4>
                  
                  {/* Home Team Logo */}
                  <div className="pb-3 border-b border-blue-200">
                    <label className="text-xs font-semibold text-gray-700 block mb-2 font-mono">
                      Home Team: {teamOfDayAward.home_team}
                    </label>
                    <button
                      onClick={() => handleRemoveBackground('home-logo')}
                      disabled={isRemovingBackground}
                      className="w-full px-3 py-2 bg-gradient-to-r from-amber-50 to-orange-50 text-white border border-orange-600 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold hover:from-amber-600 hover:to-orange-650 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      {isRemovingBackground ? (
                        <>
                          <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                          Removing background...
                        </>
                      ) : (
                        <>
                          Remove Background (Home)
                        </>
                      )}
                    </button>
                    {customHomeTeamLogo && (
                      <div className="mt-2">
                        <div className="relative w-full h-20 rounded-xl overflow-hidden border border-gray-200 bg-white flex items-center justify-center">
                          <img 
                            src={customHomeTeamLogo} 
                            alt="Custom home logo" 
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                        <button
                          onClick={() => {
                            setCustomHomeTeamLogo(null);
                            if (teamOfDayAward && teamOfDayAward.team_name === teamOfDayAward.home_team) {
                              setCustomTeamLogo(null);
                            }
                          }}
                          className="w-full mt-2 px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold hover:bg-rose-100 transition-all cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Away Team Logo */}
                  <div>
                    <label className="text-xs font-semibold text-gray-700 block mb-2 font-mono">
                      Away Team: {teamOfDayAward.away_team}
                    </label>
                    <button
                      onClick={() => handleRemoveBackground('away-logo')}
                      disabled={isRemovingBackground}
                      className="w-full px-3 py-2 bg-gradient-to-r from-amber-50 to-orange-50 text-white border border-orange-600 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold hover:from-amber-600 hover:to-orange-650 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                    >
                      {isRemovingBackground ? (
                        <>
                          <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                          Removing background...
                        </>
                      ) : (
                        <>
                          Remove Background (Away)
                        </>
                      )}
                    </button>
                    {customAwayTeamLogo && (
                      <div className="mt-2">
                        <div className="relative w-full h-20 rounded-xl overflow-hidden border border-gray-200 bg-white flex items-center justify-center">
                          <img 
                            src={customAwayTeamLogo} 
                            alt="Custom away logo" 
                            className="max-w-full max-h-full object-contain"
                          />
                        </div>
                        <button
                          onClick={() => {
                            setCustomAwayTeamLogo(null);
                            if (teamOfDayAward && teamOfDayAward.team_name === teamOfDayAward.away_team) {
                              setCustomTeamLogo(null);
                            }
                          }}
                          className="w-full mt-2 px-3 py-2 bg-rose-50 text-rose-700 border border-rose-200 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold hover:bg-rose-100 transition-all cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    )}
                  </div>

                  <p className="text-[10px] text-slate-450 font-bold uppercase mt-2 text-center flex items-center justify-center gap-1">
                    <Info className="w-3.5 h-3.5 text-slate-400" />
                    Remove backgrounds for match logos independently
                  </p>
                </div>
              </div>
            )}

            {/* Top N Selector for Golden Boot/Ball/Glove */}
            {(activeTheme === 'golden-boot' || activeTheme === 'golden-ball' || activeTheme === 'golden-glove') && (
              <div className="mt-3 font-mono">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Show Top:
                </label>
                <div className="flex gap-2 flex-wrap font-mono">
                  {[5, 10, 15, 20].map(count => (
                    <button
                      key={count}
                      onClick={() => setTopCount(count)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold transition-all border shadow-sm cursor-pointer ${
                        topCount === count
                          ? 'bg-slate-800 text-amber-400 border border-slate-900 shadow-md'
                          : 'bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 border border-slate-200/60'
                      }`}
                    >
                      Top {count}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Player Name Editor for Golden Boot/Ball/Glove - Single Player View */}
            {(activeTheme === 'golden-boot' || activeTheme === 'golden-ball' || activeTheme === 'golden-glove') && 
             posterStyle === 'single' && playersWithCustomNames.length > 0 && (
              <div className="mt-3 font-mono">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Display Name (Optional):
                </label>
                <input
                  type="text"
                  placeholder={filteredPlayers[0].player_name}
                  value={customPlayerNames[playersWithCustomNames[0].player_id] || ''}
                  onChange={(e) => setCustomPlayerNames(prev => ({
                    ...prev,
                    [playersWithCustomNames[0].player_id]: e.target.value
                  }))}
                  className="w-full py-2 px-4 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-850 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                />
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">
                  Leave empty to use original name: "{filteredPlayers[0].player_name}"
                </p>
              </div>
            )}

            {/* Player Name Editor for Player of Day/Week */}
            {(activeTheme === 'player-of-day' || activeTheme === 'player-of-week') && 
             playersWithCustomNames.length > 0 && (
              <div className="mt-3 font-mono">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Display Name (Optional):
                </label>
                <input
                  type="text"
                  placeholder={filteredPlayers[0].player_name}
                  value={customPlayerNames[playersWithCustomNames[0].player_id] || ''}
                  onChange={(e) => setCustomPlayerNames(prev => ({
                    ...prev,
                    [playersWithCustomNames[0].player_id]: e.target.value
                  }))}
                  className="w-full py-2 px-4 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-850 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                />
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">
                  Leave empty to use original name: "{filteredPlayers[0].player_name}"
                </p>
              </div>
            )}

            {/* Team Name Editor for Team of Week */}
            {activeTheme === 'team-of-week' && getTeamOfWeekAward() && (
              <div className="mt-3 font-mono">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Display Team Name (Optional):
                </label>
                <input
                  type="text"
                  placeholder={getTeamOfWeekAward()?.team_name || 'Team Name'}
                  value={customPlayerNames[`team-${getTeamOfWeekAward()?.player_id}`] || ''}
                  onChange={(e) => setCustomPlayerNames(prev => ({
                    ...prev,
                    [`team-${getTeamOfWeekAward()?.player_id}`]: e.target.value
                  }))}
                  className="w-full py-2 px-4 bg-slate-50 border border-slate-200/60 rounded-xl text-xs text-slate-850 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 transition-all font-mono"
                />
                <p className="text-[9px] text-slate-400 font-bold uppercase mt-1">
                  Leave empty to use original team name: "{getTeamOfWeekAward()?.team_name}"
                </p>
              </div>
            )}

            {/* Page Navigation for Full Stats */}
            {activeTheme === 'full-stats' && totalPages > 1 && (
              <div className="mt-3 flex items-center justify-between font-mono">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Showing {statsPage * playersPerPage + 1}-{Math.min((statsPage + 1) * playersPerPage, players.length)} of {players.length} players
                </label>
                <div className="flex gap-2 font-mono">
                  <button
                    onClick={() => setStatsPage(p => Math.max(0, p - 1))}
                    disabled={!hasPrevPage}
                    className="px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold transition-all border shadow-sm cursor-pointer bg-white text-slate-500 hover:text-slate-850 hover:bg-slate-50 border-slate-200/60 disabled:opacity-50"
                  >
                    ← Previous
                  </button>
                  <button
                    onClick={() => setStatsPage(p => Math.min(totalPages - 1, p + 1))}
                    disabled={!hasNextPage}
                    className="px-3 py-1.5 rounded-xl text-xs font-mono uppercase tracking-wider font-extrabold transition-all border shadow-sm cursor-pointer bg-white text-slate-500 hover:text-slate-850 hover:bg-slate-50 border-slate-200/60 disabled:opacity-50"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 2B. LIVE PREVIEW */}
          <div className="bg-slate-900/5 backdrop-blur-sm p-6 flex justify-center relative border border-slate-200/40 rounded-2xl shadow-inner">
            {isFetchingStats && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-white/50 backdrop-blur-sm rounded-xl">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-500"></div>
              </div>
            )}
            <div 
              className="rounded-xl overflow-hidden border border-slate-200 shadow-2xl relative bg-black" 
              style={{ 
                width: 600,
                height: 750,
                cursor: interactiveMode !== 'none' 
                  ? (isResizing ? 'nwse-resize' : (isDragging ? 'grabbing' : 'grab'))
                  : 'default'
              }}
              tabIndex={interactiveMode !== 'none' ? 0 : -1}
              onMouseDown={(e) => {
                if (interactiveMode !== 'none' && !isResizing) {
                  setIsDragging(true);
                  setDragStart({ x: e.clientX, y: e.clientY });
                }
              }}
              onMouseMove={(e) => {
                if (interactiveMode === 'none') return;
                
                if (isResizing && resizeHandle) {
                  const deltaX = (e.clientX - dragStart.x) / 4;
                  const deltaY = (e.clientY - dragStart.y) / 4;
                  
                  if (interactiveMode === 'photo') {
                    setPhotoCrop(prev => {
                      let newWidth = prev.width;
                      let newHeight = prev.height;
                      let newTop = prev.top || 0;
                      let newBottom = prev.bottom || 0;
                      let newLeft = prev.left || 0;
                      let newRight = prev.right || 0;
                      
                      if (resizeHandle === 'se') {
                        newWidth = Math.max(20, Math.min(100, initialCrop.width + deltaX));
                        newHeight = Math.max(20, Math.min(100, initialCrop.height + deltaY));
                      } else if (resizeHandle === 'sw') {
                        newWidth = Math.max(20, Math.min(100, initialCrop.width - deltaX));
                        newHeight = Math.max(20, Math.min(100, initialCrop.height + deltaY));
                      } else if (resizeHandle === 'ne') {
                        newWidth = Math.max(20, Math.min(100, initialCrop.width + deltaX));
                        newHeight = Math.max(20, Math.min(100, initialCrop.height - deltaY));
                      } else if (resizeHandle === 'nw') {
                        newWidth = Math.max(20, Math.min(100, initialCrop.width - deltaX));
                        newHeight = Math.max(20, Math.min(100, initialCrop.height - deltaY));
                      }
                      else if (resizeHandle === 'n') {
                        newTop = Math.max(0, Math.min(50, (initialCrop.top || 0) + deltaY));
                      } else if (resizeHandle === 's') {
                        newBottom = Math.max(0, Math.min(50, (initialCrop.bottom || 0) - deltaY));
                      } else if (resizeHandle === 'w') {
                        newLeft = Math.max(0, Math.min(50, (initialCrop.left || 0) + deltaX));
                      } else if (resizeHandle === 'e') {
                        newRight = Math.max(0, Math.min(50, (initialCrop.right || 0) - deltaX));
                      }
                      
                      return { width: newWidth, height: newHeight, top: newTop, bottom: newBottom, left: newLeft, right: newRight };
                    });
                  } else if (interactiveMode === 'logo') {
                    setLogoCrop(prev => {
                      let newWidth = prev.width;
                      let newHeight = prev.height;
                      let newTop = prev.top || 0;
                      let newBottom = prev.bottom || 0;
                      let newLeft = prev.left || 0;
                      let newRight = prev.right || 0;
                      
                      if (resizeHandle === 'se') {
                        newWidth = Math.max(20, Math.min(100, initialCrop.width + deltaX));
                        newHeight = Math.max(20, Math.min(100, initialCrop.height + deltaY));
                      } else if (resizeHandle === 'sw') {
                        newWidth = Math.max(20, Math.min(100, initialCrop.width - deltaX));
                        newHeight = Math.max(20, Math.min(100, initialCrop.height + deltaY));
                      } else if (resizeHandle === 'ne') {
                        newWidth = Math.max(20, Math.min(100, initialCrop.width + deltaX));
                        newHeight = Math.max(20, Math.min(100, initialCrop.height - deltaY));
                      } else if (resizeHandle === 'nw') {
                        newWidth = Math.max(20, Math.min(100, initialCrop.width - deltaX));
                        newHeight = Math.max(20, Math.min(100, initialCrop.height - deltaY));
                      }
                      else if (resizeHandle === 'n') {
                        newTop = Math.max(0, Math.min(50, (initialCrop.top || 0) + deltaY));
                      } else if (resizeHandle === 's') {
                        newBottom = Math.max(0, Math.min(50, (initialCrop.bottom || 0) - deltaY));
                      } else if (resizeHandle === 'w') {
                        newLeft = Math.max(0, Math.min(50, (initialCrop.left || 0) + deltaX));
                      } else if (resizeHandle === 'e') {
                        newRight = Math.max(0, Math.min(50, (initialCrop.right || 0) - deltaX));
                      }
                      
                      return { width: newWidth, height: newHeight, top: newTop, bottom: newBottom, left: newLeft, right: newRight };
                    });
                  }
                } else if (isDragging) {
                  const deltaX = (e.clientX - dragStart.x) / 6;
                  const deltaY = (e.clientY - dragStart.y) / 6;
                  
                  if (interactiveMode === 'photo') {
                    setPhotoPosition(prev => ({
                      x: Math.max(-1000, Math.min(1000, prev.x + deltaX)),
                      y: Math.max(-1000, Math.min(1000, prev.y + deltaY))
                    }));
                  } else if (interactiveMode === 'logo') {
                    setLogoPosition(prev => ({
                      x: Math.max(-1000, Math.min(1000, prev.x + deltaX)),
                      y: Math.max(-1000, Math.min(1000, prev.y + deltaY))
                    }));
                  }
                  
                  setDragStart({ x: e.clientX, y: e.clientY });
                }
              }}
              onMouseUp={() => {
                setIsDragging(false);
                setIsResizing(false);
                setResizeHandle(null);
              }}
              onMouseLeave={() => {
                setIsDragging(false);
                setIsResizing(false);
                setResizeHandle(null);
              }}
              onWheel={(e) => {
                if (interactiveMode !== 'none' && e.shiftKey) {
                  e.preventDefault();
                  const delta = e.deltaY > 0 ? -5 : 5;
                  
                  if (interactiveMode === 'photo') {
                    setPhotoScale(prev => Math.max(50, Math.min(200, prev + delta)));
                  } else if (interactiveMode === 'logo') {
                    setLogoScale(prev => Math.max(50, Math.min(200, prev + delta)));
                  }
                }
              }}
            >
              {/* Interactive Mode Indicator */}
              {interactiveMode !== 'none' && (
                <div className="absolute top-2 left-2 z-50 bg-blue-600 text-white px-3 py-1 rounded-full text-xs font-bold shadow-lg flex items-center gap-2">
                  <Focus className="w-3.5 h-3.5" />
                  {interactiveMode === 'photo' ? 'Photo Interactive' : 'Logo Interactive'}
                  <span className="text-[10px] opacity-80">| Arrow Keys: Move | Shift+Arrow: Fast Move | Shift+Scroll: Scale</span>
                </div>
              )}
              
              {/* Interactive Mode Overlay */}
              {interactiveMode !== 'none' && (
                <div 
                  className="absolute inset-0 z-40"
                  style={{ 
                    transform: 'scale(0.75)', 
                    transformOrigin: 'top left', 
                    width: '133.33%', 
                    height: '133.33%',
                    pointerEvents: 'none'
                  }}
                >
                  <div className="relative w-full h-full">
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: 'rgba(0, 0, 0, 0.5)',
                      pointerEvents: 'none',
                    }} />
                    
                    {(activeTheme === 'player-of-day' || activeTheme === 'player-of-week' || 
                      (posterStyle === 'single' && (activeTheme === 'golden-boot' || activeTheme === 'golden-ball' || activeTheme === 'golden-glove'))) && (
                      <>
                        {interactiveMode === 'photo' && photoContainerBounds && (
                          <div style={{
                            position: 'absolute',
                            left: `${photoContainerBounds.left}px`,
                            top: `${photoContainerBounds.top}px`,
                            width: `${photoContainerBounds.width}px`,
                            height: `${photoContainerBounds.height}px`,
                            pointerEvents: 'none',
                          }}>
                            <div 
                              onWheel={(e) => {
                                if (interactiveMode === 'photo' && e.shiftKey) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const delta = e.deltaY > 0 ? -5 : 5;
                                  setPhotoScale(prev => Math.max(50, Math.min(200, prev + delta)));
                                }
                              }}
                              style={{
                              position: 'absolute',
                              top: `calc(${photoCrop.top || 0}% + ${(photoPosition.y - 50) * 0.67}px)`,
                              left: `calc(${photoCrop.left || 0}% + ${(photoPosition.x - 50) * 0.67}px)`,
                              width: `${100 - (photoCrop.left || 0) - (photoCrop.right || 0)}%`,
                              height: `${100 - (photoCrop.top || 0) - (photoCrop.bottom || 0)}%`,
                              background: 'transparent',
                              border: '3px solid #3b82f6',
                              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
                              cursor: 'move',
                              pointerEvents: 'auto',
                            }}>
                              {[
                                { pos: 'nw', top: -6, left: -6, cursor: 'nw-resize' },
                                { pos: 'ne', top: -6, right: -6, cursor: 'ne-resize' },
                                { pos: 'sw', bottom: -6, left: -6, cursor: 'sw-resize' },
                                { pos: 'se', bottom: -6, right: -6, cursor: 'se-resize' },
                              ].map(({ pos, cursor, ...style }) => (
                                <div
                                  key={pos}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setIsResizing(true);
                                    setResizeHandle(pos as 'nw' | 'ne' | 'sw' | 'se');
                                    setDragStart({ x: e.clientX, y: e.clientY });
                                    setInitialCrop(photoCrop);
                                  }}
                                  style={{
                                    position: 'absolute',
                                    width: 14,
                                    height: 14,
                                    background: '#3b82f6',
                                    border: '3px solid white',
                                    borderRadius: '50%',
                                    cursor,
                                    pointerEvents: 'auto',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                    ...style,
                                  }}
                                />
                              ))}

                              {[
                                { pos: 'n', top: -6, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' },
                                { pos: 's', bottom: -6, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' },
                                { pos: 'w', left: -6, top: '50%', transform: 'translateY(-50%)', cursor: 'w-resize' },
                                { pos: 'e', right: -6, top: '50%', transform: 'translateY(-50%)', cursor: 'e-resize' },
                              ].map(({ pos, cursor, transform, ...style }) => (
                                <div
                                  key={pos}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setIsResizing(true);
                                    setResizeHandle(pos as any);
                                    setDragStart({ x: e.clientX, y: e.clientY });
                                    setInitialCrop(photoCrop);
                                  }}
                                  style={{
                                    position: 'absolute',
                                    width: pos === 'w' || pos === 'e' ? 14 : 40,
                                    height: pos === 'n' || pos === 's' ? 14 : 40,
                                    background: '#3b82f6',
                                    border: '3px solid white',
                                    borderRadius: '7px',
                                    cursor,
                                    pointerEvents: 'auto',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                    transform,
                                    ...style,
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {interactiveMode === 'logo' && logoContainerBounds && (
                          <div style={{
                            position: 'absolute',
                            left: `${logoContainerBounds.left}px`,
                            top: `${logoContainerBounds.top}px`,
                            width: `${logoContainerBounds.width}px`,
                            height: `${logoContainerBounds.height}px`,
                            pointerEvents: 'none',
                          }}>
                            <div
                              onWheel={(e) => {
                                if (interactiveMode === 'logo' && e.shiftKey) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  const delta = e.deltaY > 0 ? -5 : 5;
                                  setLogoScale(prev => Math.max(50, Math.min(200, prev + delta)));
                                }
                              }}
                              style={{
                              position: 'absolute',
                              top: `calc(${logoCrop.top || 0}% + ${(logoPosition.y - 50) * 0.67}px)`,
                              left: `calc(${logoCrop.left || 0}% + ${(logoPosition.x - 50) * 0.67}px)`,
                              width: `${100 - (logoCrop.left || 0) - (logoCrop.right || 0)}%`,
                              height: `${100 - (logoCrop.top || 0) - (logoCrop.bottom || 0)}%`,
                              background: 'transparent',
                              border: '3px solid #f59e0b',
                              boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.5)',
                              cursor: 'move',
                              pointerEvents: 'auto',
                            }}>
                              {[
                                { pos: 'nw', top: -6, left: -6, cursor: 'nw-resize' },
                                { pos: 'ne', top: -6, right: -6, cursor: 'ne-resize' },
                                { pos: 'sw', bottom: -6, left: -6, cursor: 'sw-resize' },
                                { pos: 'se', bottom: -6, right: -6, cursor: 'se-resize' },
                              ].map(({ pos, cursor, ...style }) => (
                                <div
                                  key={pos}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setIsResizing(true);
                                    setResizeHandle(pos as 'nw' | 'ne' | 'sw' | 'se');
                                    setDragStart({ x: e.clientX, y: e.clientY });
                                    setInitialCrop(logoCrop);
                                  }}
                                  style={{
                                    position: 'absolute',
                                    width: 14,
                                    height: 14,
                                    background: '#f59e0b',
                                    border: '3px solid white',
                                    borderRadius: '50%',
                                    cursor,
                                    pointerEvents: 'auto',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                    ...style,
                                  }}
                                />
                              ))}

                              {[
                                { pos: 'n', top: -6, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' },
                                { pos: 's', bottom: -6, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' },
                                { pos: 'w', left: -6, top: '50%', transform: 'translateY(-50%)', cursor: 'w-resize' },
                                { pos: 'e', right: -6, top: '50%', transform: 'translateY(-50%)', cursor: 'e-resize' },
                              ].map(({ pos, cursor, transform, ...style }) => (
                                <div
                                  key={pos}
                                  onMouseDown={(e) => {
                                    e.stopPropagation();
                                    setIsResizing(true);
                                    setResizeHandle(pos as any);
                                    setDragStart({ x: e.clientX, y: e.clientY });
                                    setInitialCrop(logoCrop);
                                  }}
                                  style={{
                                    position: 'absolute',
                                    width: pos === 'w' || pos === 'e' ? 14 : 40,
                                    height: pos === 'n' || pos === 's' ? 14 : 40,
                                    background: '#f59e0b',
                                    border: '3px solid white',
                                    borderRadius: '7px',
                                    cursor,
                                    pointerEvents: 'auto',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                    transform,
                                    ...style,
                                  }}
                                />
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )}
              
              <div style={{ 
                width: '600px',
                height: '750px',
                position: 'relative',
                overflow: 'hidden',
              }}>
                <div style={{ 
                  transform: 'scale(0.75)', 
                  transformOrigin: 'top left',
                  width: '800px',
                  height: '1000px',
                }}>
                  <PosterSnapshot 
                    key={`preview-${activeTheme}-${selectedRound}-${selectedWeek}-${statsPage}-${posterStyle}-${customPlayerPhoto ? 'custom-photo' : ''}-${customTeamLogo ? 'custom-logo' : ''}-${customHomeTeamLogo ? 'custom-home-logo' : ''}-${customAwayTeamLogo ? 'custom-away-logo' : ''}-${selectedTeamOfWeekPlayer || 'no-player'}`}
                    theme={theme}
                    players={activeTheme === 'team-of-week' ? players : playersWithCustomNames}
                    LogoBranding={LogoBranding}
                    isFullStats={activeTheme === 'full-stats'}
                    posterStyle={posterStyle}
                    themeKey={activeTheme}
                    selectedRound={selectedRound}
                    selectedWeek={selectedWeek}
                    photoPosition={photoPosition}
                    photoScale={photoScale}
                    photoCrop={photoCrop}
                    logoPosition={logoPosition}
                    logoScale={logoScale}
                    logoCrop={logoCrop}
                    seasonId={seasonId}
                    startRank={startRank}
                    teamOfWeekAward={getTeamOfWeekAward()}
                    teamOfDayAward={getTeamOfDayAward()}
                    customPlayerPhoto={customPlayerPhoto}
                    customTeamLogo={customTeamLogo}
                    customHomeTeamLogo={customHomeTeamLogo}
                    customAwayTeamLogo={customAwayTeamLogo}
                    customPlayerNames={customPlayerNames}
                    selectedTeamOfWeekPlayer={selectedTeamOfWeekPlayer}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* 2C. ACTION BUTTONS */}
          <div className="px-5 py-4 border-t border-slate-105 bg-slate-50/40 flex flex-wrap gap-2 justify-end items-center font-mono">
            {/* Download Button */}
            <button
              onClick={handleDownload}
              disabled={downloading || downloadDone}
              className={`px-4 py-2.5 rounded-xl font-mono uppercase tracking-wider font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                downloadDone
                  ? 'bg-emerald-600 text-white border border-emerald-700'
                  : 'bg-slate-800 text-amber-400 border border-slate-900 hover:bg-slate-900'
              }`}
              style={{ opacity: downloading ? 0.6 : 1 }}
            >
              {downloading ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white"></div>
                  Saving...
                </>
              ) : downloadDone ? (
                <>
                  <Check className="w-4 h-4" />
                  Downloaded!
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Download Poster
                </>
              )}
            </button>

            {/* Share Button with Theme Gradient */}
            <button
              onClick={handleShare}
              disabled={sharing || shareDone}
              className={`px-4 py-2.5 rounded-xl font-mono uppercase tracking-wider font-extrabold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md ${
                shareDone 
                  ? 'bg-emerald-600 text-white border border-emerald-700' 
                  : 'border border-slate-900 hover:opacity-95'
              }`}
              style={
                !shareDone
                  ? {
                      background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
                      color: '#0a0a0a',
                      opacity: sharing ? 0.6 : 1,
                    }
                  : undefined
              }
            >
              {sharing ? (
                <>
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-current"></div>
                  Sharing...
                </>
              ) : shareDone ? (
                <>
                  <Check className="w-4 h-4" />
                  Shared!
                </>
              ) : (
                <>
                  <FileSpreadsheet className="w-4 h-4" />
                  Share Poster
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 3. OFF-SCREEN CAPTURE TARGET */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }} aria-hidden="true">
        <div ref={posterRef}>
          <PosterSnapshot 
            key={`download-${activeTheme}-${selectedRound}-${selectedWeek}-${statsPage}-${posterStyle}-${customPlayerPhoto ? 'custom-photo' : ''}-${customTeamLogo ? 'custom-logo' : ''}-${customHomeTeamLogo ? 'custom-home-logo' : ''}-${customAwayTeamLogo ? 'custom-away-logo' : ''}-${selectedTeamOfWeekPlayer || 'no-player'}`}
            theme={theme}
            players={activeTheme === 'team-of-week' ? players : playersWithCustomNames}
            LogoBranding={LogoBranding}
            isFullStats={activeTheme === 'full-stats'}
            posterStyle={posterStyle}
            themeKey={activeTheme}
            selectedRound={selectedRound}
            selectedWeek={selectedWeek}
            photoPosition={photoPosition}
            photoScale={photoScale}
            photoCrop={photoCrop}
            logoPosition={logoPosition}
            logoScale={logoScale}
            logoCrop={logoCrop}
            seasonId={seasonId}
            startRank={startRank}
            teamOfWeekAward={getTeamOfWeekAward()}
            teamOfDayAward={getTeamOfDayAward()}
            customPlayerPhoto={customPlayerPhoto}
            customTeamLogo={customTeamLogo}
            customHomeTeamLogo={customHomeTeamLogo}
            customAwayTeamLogo={customAwayTeamLogo}
            customPlayerNames={customPlayerNames}
            selectedTeamOfWeekPlayer={selectedTeamOfWeekPlayer}
          />
        </div>
      </div>
    </>
  );
}

// Poster Snapshot Component - Uses exact designs from reference images
function PosterSnapshot({ 
  theme, 
  players,
  LogoBranding,
  isFullStats = false,
  posterStyle = 'table',
  themeKey,
  selectedRound,
  selectedWeek,
  photoPosition,
  photoScale,
  photoCrop,
  logoPosition,
  logoScale,
  logoCrop,
  seasonId,
  startRank = 1,
  teamOfWeekAward,
  teamOfDayAward,
  customPlayerNames = {},
  customPlayerPhoto = null,
  customTeamLogo = null,
  customHomeTeamLogo = null,
  customAwayTeamLogo = null,
  selectedTeamOfWeekPlayer = null,
}: { 
  theme: Theme;
  players: PlayerStats[];
  LogoBranding: React.ComponentType<{ size?: number }>;
  isFullStats?: boolean;
  posterStyle?: 'single' | 'table';
  themeKey: ThemeKey;
  selectedRound?: number;
  selectedWeek?: number;
  photoPosition: { x: number; y: number };
  photoScale: number;
  photoCrop: { width: number; height: number };
  logoPosition: { x: number; y: number };
  logoScale: number;
  logoCrop: { width: number; height: number };
  seasonId?: string;
  startRank?: number;
  teamOfWeekAward?: PlayerAward | null;
  teamOfDayAward?: PlayerAward | null;
  customPlayerNames?: Record<string, string>;
  customPlayerPhoto?: string | null;
  customTeamLogo?: string | null;
  customHomeTeamLogo?: string | null;
  customAwayTeamLogo?: string | null;
  selectedTeamOfWeekPlayer?: string | null;
}) {
  // Player of Day/Week always use single style
  const isSinglePlayer = themeKey === 'player-of-day' || themeKey === 'player-of-week';
  const isTeamOfWeek = themeKey === 'team-of-week';
  const isTeamOfDay = themeKey === 'team-of-day';
  // For other themes, use the selected poster style
  const useSingleStyle = isSinglePlayer || posterStyle === 'single';
  const displayPlayers = useSingleStyle && !isSinglePlayer ? [players[0]] : players;

  // Override player photos and logos if custom images are provided
  const playersWithCustomImages = displayPlayers.map(player => ({
    ...player,
    player_photo: customPlayerPhoto || player.player_photo,
    photo_url: customPlayerPhoto || player.photo_url,
    team_logo: customTeamLogo || player.team_logo,
  }));

  const weekLabel = selectedWeek ? `WEEK ${selectedWeek}` : selectedRound ? `TILL ROUND ${selectedRound}` : 'SEASON';

  // Handle Team of Day separately
  if (isTeamOfDay && teamOfDayAward) {
    return (
      <TeamOfDayDesign
        award={teamOfDayAward}
        theme={theme}
        seasonId={seasonId}
        LogoBranding={LogoBranding}
        logoPosition={logoPosition}
        logoScale={logoScale}
        logoCrop={logoCrop}
        customTeamLogo={customTeamLogo}
        customHomeTeamLogo={customHomeTeamLogo}
        customAwayTeamLogo={customAwayTeamLogo}
      />
    );
  }

  // Handle Team of Week separately with custom team name and selected player photo
  if (isTeamOfWeek && teamOfWeekAward) {
    const customTeamName = customPlayerNames?.[`team-${teamOfWeekAward.player_id}`];
    
    // Get selected player's photo
    console.log('[PosterSnapshot] Looking for player:', {
      selectedTeamOfWeekPlayer,
      totalPlayers: players.length,
      firstPlayerSample: players[0] ? {
        id: players[0].player_id,
        name: players[0].player_name,
        team: players[0].team_name
      } : null,
      teamName: teamOfWeekAward.team_name
    });
    
    const selectedPlayer = selectedTeamOfWeekPlayer 
      ? players.find(p => {
          console.log('[PosterSnapshot] Comparing:', { playerId: p.player_id, selectedId: selectedTeamOfWeekPlayer, match: p.player_id === selectedTeamOfWeekPlayer });
          return p.player_id === selectedTeamOfWeekPlayer;
        })
      : null;
    
    console.log('[PosterSnapshot] Team of Week Debug:', {
      selectedTeamOfWeekPlayer,
      selectedPlayer,
      playerPhoto: selectedPlayer?.player_photo,
      photoUrl: selectedPlayer?.photo_url,
      customPlayerPhoto,
      teamOfWeekAwardPhoto: teamOfWeekAward.player_photo,
      teamName: teamOfWeekAward.team_name,
      playersCount: players.length,
      playersInTeam: players.filter(p => p.team_name === teamOfWeekAward.team_name).length,
    });
    
    const playerPhotoUrl = customPlayerPhoto || selectedPlayer?.player_photo || selectedPlayer?.photo_url || teamOfWeekAward.player_photo;
    const playerName = selectedPlayer?.player_name || teamOfWeekAward.player_name;
    
    const awardWithCustomData = {
      ...teamOfWeekAward,
      team_name: customTeamName || teamOfWeekAward.team_name,
      team_logo: customTeamLogo || teamOfWeekAward.team_logo,
      player_photo: playerPhotoUrl,
      player_name: playerName,
    };
    
    console.log('[PosterSnapshot] Final award data:', {
      player_photo: awardWithCustomData.player_photo,
      player_name: awardWithCustomData.player_name,
    });
    
    return (
      <TeamOfWeekDesign
        award={awardWithCustomData}
        theme={theme}
        seasonId={seasonId}
        LogoBranding={LogoBranding}
        photoPosition={photoPosition}
        photoScale={photoScale}
        photoCrop={photoCrop}
        logoPosition={logoPosition}
        logoScale={logoScale}
        logoCrop={logoCrop}
      />
    );
  }

  if (useSingleStyle && displayPlayers[0]) {
    return (
      <SinglePlayerDesign
        player={playersWithCustomImages[0]}
        theme={theme}
        themeKey={themeKey}
        week={weekLabel}
        LogoBranding={LogoBranding}
        photoPosition={photoPosition}
        photoScale={photoScale}
        photoCrop={photoCrop}
        logoPosition={logoPosition}
        logoScale={logoScale}
        logoCrop={logoCrop}
        removeDividers={true}
        seasonId={seasonId}
        selectedRound={selectedRound}
      />
    );
  }

  return (
    <TableDesign
      players={playersWithCustomImages}
      theme={theme}
      themeKey={themeKey}
      week={weekLabel}
      LogoBranding={LogoBranding}
      seasonId={seasonId}
      startRank={startRank}
    />
  );
}

// Single Player Poster for Player of Day/Week
function SinglePlayerPoster({ player, theme, themeKey }: { player: PlayerStats; theme: Theme; themeKey: ThemeKey }) {
  return (
    <>
      {/* Title Badge */}
      <div style={{
        textAlign: 'center',
        marginTop: 100,
        marginBottom: 40,
        zIndex: 5,
        position: 'relative',
      }}>
        <div style={{
          display: 'inline-block',
          padding: '10px 28px',
          background: `${theme.accent}15`,
          border: `2px solid ${theme.accent}40`,
          borderRadius: 12,
          marginBottom: 20,
        }}>
          <span style={{
            fontSize: 18,
            fontWeight: 700,
            letterSpacing: 3,
            color: theme.accent,
            textTransform: 'uppercase',
          }}>
            {theme.emoji} {theme.tagline}
          </span>
        </div>
      </div>

      {/* Player Photo - Square with Rounded Corners */}
      <div style={{
        width: 280,
        height: 280,
        margin: '0 auto 32px',
        borderRadius: 24,
        border: `4px solid ${theme.accent}`,
        overflow: 'hidden',
        boxShadow: `0 8px 32px ${theme.glow}`,
        background: 'rgba(255, 255, 255, 0.05)',
        position: 'relative',
        zIndex: 5,
      }}>
        {player.player_photo ? (
          <img 
            src={player.player_photo} 
            alt={player.player_name}
            crossOrigin="anonymous"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 96,
            color: 'rgba(255, 255, 255, 0.3)',
          }}>
            👤
          </div>
        )}
      </div>

      {/* Player Name */}
      <h1 style={{
        fontSize: 52,
        fontWeight: 900,
        color: '#ffffff',
        textAlign: 'center',
        letterSpacing: '-0.02em',
        margin: '0 0 12px 0',
        textShadow: `0 0 40px ${theme.glow}`,
        zIndex: 5,
        position: 'relative',
      }}>
        {player.player_name}
      </h1>

      {/* Team Name */}
      <p style={{
        fontSize: 20,
        fontWeight: 600,
        color: 'rgba(255, 255, 255, 0.7)',
        textAlign: 'center',
        marginBottom: 48,
        zIndex: 5,
        position: 'relative',
      }}>
        {player.team_name}
      </p>

      {/* Stats Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 16,
        maxWidth: 720,
        margin: '0 auto',
        zIndex: 5,
        position: 'relative',
      }}>
        {[
          { label: 'Points', value: player.points, color: theme.accent },
          { label: 'Goals', value: player.goals_scored, color: theme.accent2 },
          { label: 'Matches', value: player.matches_played, color: '#ffffff' },
          { label: 'Win Rate', value: `${player.win_rate}%`, color: theme.accent },
        ].map((stat, idx) => (
          <div key={idx} style={{
            background: 'rgba(255, 255, 255, 0.03)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 16,
            padding: '20px 12px',
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: 36,
              fontWeight: 900,
              color: stat.color,
              textShadow: `0 0 20px ${theme.glow}`,
            }}>
              {stat.value}
            </div>
            <div style={{
              fontSize: 12,
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.5)',
              marginTop: 8,
            }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>

      {/* Additional Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: 16,
        maxWidth: 560,
        margin: '16px auto 0',
        zIndex: 5,
        position: 'relative',
      }}>
        {[
          { label: 'Clean Sheets', value: player.clean_sheets },
          { label: 'MOTM', value: player.motm_awards },
          { label: 'GD', value: player.goal_difference > 0 ? `+${player.goal_difference}` : player.goal_difference },
        ].map((stat, idx) => (
          <div key={idx} style={{
            background: 'rgba(255, 255, 255, 0.03)',
            backdropFilter: 'blur(12px)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: 12,
            padding: '16px 12px',
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: 24,
              fontWeight: 700,
              color: '#ffffff',
            }}>
              {stat.value}
            </div>
            <div style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.5)',
              marginTop: 4,
            }}>
              {stat.label}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// Multi Player Poster for Rankings and Full Stats
function MultiPlayerPoster({ 
  players, 
  theme,
  isFullStats,
  themeKey 
}: { 
  players: PlayerStats[];
  theme: Theme;
  isFullStats: boolean;
  themeKey: ThemeKey;
}) {
  return (
    <>
      {/* Title */}
      <div style={{
        textAlign: 'center',
        marginTop: 80,
        marginBottom: 32,
        zIndex: 5,
        position: 'relative',
      }}>
        <div style={{
          display: 'inline-block',
          padding: '8px 24px',
          background: `${theme.accent}15`,
          border: `2px solid ${theme.accent}40`,
          borderRadius: 12,
          marginBottom: 16,
        }}>
          <span style={{
            fontSize: 16,
            fontWeight: 700,
            letterSpacing: 3,
            color: theme.accent,
            textTransform: 'uppercase',
          }}>
            {theme.emoji} {theme.tagline}
          </span>
        </div>
        <h1 style={{
          fontSize: isFullStats ? 36 : 48,
          fontWeight: 900,
          color: '#ffffff',
          letterSpacing: '-0.02em',
          margin: 0,
          textShadow: `0 0 40px ${theme.glow}`,
        }}>
          {isFullStats ? 'Player Rankings' : 'Top Performers'}
        </h1>
      </div>
      
      {/* Players List */}
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        gap: isFullStats ? 10 : 16,
        zIndex: 5,
        position: 'relative',
      }}>
        {players.map((player, index) => (
          <div key={player.player_id} style={{
            background: 'rgba(255, 255, 255, 0.03)',
            backdropFilter: 'blur(12px)',
            WebkitBackdropFilter: 'blur(12px)',
            border: `1px solid ${index === 0 && !isFullStats ? theme.accent : 'rgba(255, 255, 255, 0.1)'}`,
            borderRadius: 16,
            padding: isFullStats ? '12px 16px' : '20px 24px',
            display: 'flex',
            alignItems: 'center',
            gap: isFullStats ? 12 : 20,
            boxShadow: index === 0 && !isFullStats ? `0 4px 24px ${theme.glow}` : '0 4px 20px rgba(0, 0, 0, 0.3)',
          }}>
            {/* Player Photo - Square with Rounded Corners */}
            <div style={{
              width: isFullStats ? 48 : 80,
              height: isFullStats ? 48 : 80,
              borderRadius: isFullStats ? 8 : 12,
              border: `2px solid ${index < 3 && !isFullStats ? theme.accent : 'rgba(255, 255, 255, 0.2)'}`,
              overflow: 'hidden',
              flexShrink: 0,
              background: 'rgba(255, 255, 255, 0.05)',
            }}>
              {player.player_photo ? (
                <img 
                  src={player.player_photo} 
                  alt={player.player_name}
                  crossOrigin="anonymous"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: isFullStats ? 20 : 32,
                  fontWeight: 900,
                  color: index < 3 && !isFullStats ? theme.accent : 'rgba(255, 255, 255, 0.3)',
                }}>
                  {index + 1}
                </div>
              )}
            </div>

            
            {/* Player Info */}
            <div style={{ flex: 1 }}>
              <div style={{ 
                fontSize: isFullStats ? 18 : 24, 
                fontWeight: 700, 
                color: '#ffffff',
                marginBottom: 4,
              }}>
                {player.player_name}
              </div>
              <div style={{ 
                fontSize: isFullStats ? 12 : 14, 
                fontWeight: 500, 
                color: 'rgba(255, 255, 255, 0.6)',
              }}>
                {player.team_name}
              </div>
            </div>
            
            {/* Stats */}
            <div style={{ display: 'flex', gap: isFullStats ? 12 : 20, alignItems: 'center' }}>
              {/* Main stat based on theme */}
              <div style={{ textAlign: 'center' }}>
                <div style={{ 
                  fontSize: isFullStats ? 24 : 32, 
                  fontWeight: 900, 
                  color: theme.accent,
                  textShadow: `0 0 20px ${theme.glow}`,
                }}>
                  {theme.tagline === 'GOLDEN BOOT' 
                    ? player.goals_scored 
                    : theme.tagline === 'GOLDEN GLOVE'
                    ? player.clean_sheets
                    : player.points}
                </div>
                <div style={{ 
                  fontSize: isFullStats ? 9 : 11, 
                  fontWeight: 600, 
                  color: 'rgba(255, 255, 255, 0.5)',
                  marginTop: 4,
                }}>
                  {theme.tagline === 'GOLDEN BOOT' 
                    ? 'Goals' 
                    : theme.tagline === 'GOLDEN GLOVE'
                    ? 'Clean Sheets'
                    : 'Points'}
                </div>
              </div>
              
              {!isFullStats && (
                <>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ 
                      fontSize: 24, 
                      fontWeight: 700, 
                      color: '#ffffff',
                    }}>
                      {player.matches_played}
                    </div>
                    <div style={{ 
                      fontSize: 11, 
                      fontWeight: 600, 
                      color: 'rgba(255, 255, 255, 0.5)',
                      marginTop: 4,
                    }}>
                      Matches
                    </div>
                  </div>
                  
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ 
                      fontSize: 20, 
                      fontWeight: 700, 
                      color: theme.accent2,
                    }}>
                      {player.win_rate}%
                    </div>
                    <div style={{ 
                      fontSize: 11, 
                      fontWeight: 600, 
                      color: 'rgba(255, 255, 255, 0.5)',
                      marginTop: 4,
                    }}>
                      Win Rate
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

