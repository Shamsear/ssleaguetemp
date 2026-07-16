'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamRegistration } from '@/contexts/TeamRegistrationContext';
import { useFirebaseAuth } from '@/hooks/useFirebase';
import { useRouter, usePathname } from 'next/navigation';

export default function MobileNav() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const { user } = useAuth();
  const { isRegistered, teamLogo } = useTeamRegistration();
  const { signOut } = useFirebaseAuth();
  const router = useRouter();
  const pathname = usePathname();
  const isHome = pathname === '/';

  const isActiveLink = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    // Highlight Roster Requests active state for all request subpaths
    if (href === '/dashboard/team/requests') {
      return pathname.startsWith('/dashboard/team/requests');
    }
    // For dashboard links, only highlight if it's an exact match
    if (href.includes('/dashboard/')) {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  // Detect PWA standalone display mode
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const isMqlStandalone = window.matchMedia('(display-mode: standalone)').matches 
        || (window.navigator as any).standalone 
        || document.referrer.includes('android-app://');
      setIsStandalone(!!isMqlStandalone);
    }
  }, []);

  const [keyboardOffset, setKeyboardOffset] = useState(0);

  // Monitor visual viewport height shifts (e.g. keyboard open/close, status bar notifications)
  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return;

    const handleViewportChange = () => {
      const vv = window.visualViewport;
      if (!vv) return;
      
      const offset = window.innerHeight - vv.height - vv.offsetTop;
      // Only apply offset if significant (e.g. > 10px) to ignore small scroll jitters
      setKeyboardOffset(offset > 10 ? offset : 0);
    };

    const vv = window.visualViewport;
    vv.addEventListener('resize', handleViewportChange);
    vv.addEventListener('scroll', handleViewportChange);
    
    handleViewportChange();

    return () => {
      vv.removeEventListener('resize', handleViewportChange);
      vv.removeEventListener('scroll', handleViewportChange);
    };
  }, []);

  const [isShrunk, setIsShrunk] = useState(false);

  // Handle scroll direction to shrink/enlarge the navigation bar
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let lastScrollY = window.scrollY;
    let accumulatedDiff = 0;

    const handleScroll = () => {
      // Disable scroll-shrink when full-screen menu overlay is open
      if (isMenuOpen) {
        setIsShrunk(false);
        return;
      }

      const currentScrollY = window.scrollY;
      
      // Snap to expanded state at the very top of the page
      if (currentScrollY < 10) {
        setIsShrunk(false);
        lastScrollY = currentScrollY;
        accumulatedDiff = 0;
        return;
      }

      // Snap to expanded state near page bottom boundary (so it's fully interactive at the bottom)
      if (currentScrollY + window.innerHeight >= document.documentElement.scrollHeight - 10) {
        setIsShrunk(false);
        return;
      }

      const diff = currentScrollY - lastScrollY;
      
      // Track scroll direction with a threshold to avoid jittering on micro-scrolls
      if (diff > 0) {
        // Scrolling down
        if (accumulatedDiff < 0) accumulatedDiff = 0;
        accumulatedDiff += diff;
        if (accumulatedDiff > 15) {
          setIsShrunk(true);
        }
      } else {
        // Scrolling up
        if (accumulatedDiff > 0) accumulatedDiff = 0;
        accumulatedDiff += diff;
        if (accumulatedDiff < -15) {
          setIsShrunk(false);
        }
      }
      
      lastScrollY = currentScrollY;
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [isMenuOpen]);

  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({
    'League Portals': false,
    'Seasons & Stats': true,
    'System Admin': true,
    'Squad Management': true,
    'Match Operations': true,
    'Platform Settings': true,
    'My Club': true,
    'Market & Ranks': true,
  });

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => ({
      ...prev,
      [cat]: !prev[cat]
    }));
  };

  // Get the appropriate dashboard URL based on user role
  const getDashboardUrl = () => {
    if (!user) return '/';

    switch (user.role) {
      case 'super_admin':
        return '/dashboard/superadmin';
      case 'committee_admin':
        return '/dashboard/committee';
      case 'team':
        return '/dashboard/team';
      default:
        return '/dashboard';
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toggleMenu(false);
      router.push('/login');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  const toggleMenu = (open: boolean) => {
    setIsMenuOpen(open);
    if (open) {
      // Save current scroll position before locking
      const scrollY = window.scrollY;
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.width = '100%';
      document.body.style.top = `-${scrollY}px`;
    } else {
      // Restore scroll position when unlocking
      const scrollY = document.body.style.top;
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.width = '';
      document.body.style.top = '';
      window.scrollTo(0, parseInt(scrollY || '0') * -1);
      setExpandedMenu(null);
      setSearchQuery('');
    }
  };

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isMenuOpen) {
        toggleMenu(false);
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
      document.body.style.position = '';
      document.body.style.top = '';
    };
  }, [isMenuOpen]);

  // List of all HUD navigation systems
  const getNavLinks = () => {
    const links: { href: string; label: string; cat: string; roles?: string[]; requireRegistration?: boolean }[] = [];

    // Public links (Visible to all)
    links.push(
      { href: '/', label: 'League Home', cat: 'League Portals' },
      { href: '/season/current', label: 'Current Season', cat: 'League Portals' },
      { href: '/players', label: 'Players Database', cat: 'League Portals' },
      { href: '/footballplayers', label: 'Football Players', cat: 'League Portals' },
      { href: '/teams', label: 'League Teams', cat: 'League Portals' },
      { href: '/fixtures', label: 'Match Fixtures', cat: 'League Portals' },
      { href: '/fixtures?tab=results', label: 'Match Results', cat: 'League Portals' },
      { href: '/seasons', label: 'See All Seasons', cat: 'League Portals' },
      { href: '/awards', label: 'Awards Cabinet', cat: 'League Portals' },
      { href: '/news', label: 'Official News', cat: 'League Portals' },
      { href: '/polls', label: 'Community Polls', cat: 'League Portals' }
    );

    // Super Admin Links
    if (user && user.role === 'super_admin') {
      links.push(
        { href: '/dashboard/superadmin/seasons', label: 'Seasons List', cat: 'Seasons & Stats', roles: ['super_admin'] },
        { href: '/dashboard/superadmin/seasons/create', label: 'Create Season', cat: 'Seasons & Stats', roles: ['super_admin'] },
        { href: '/dashboard/superadmin/historical-seasons', label: 'Historical Data', cat: 'Seasons & Stats', roles: ['super_admin'] },
        { href: '/dashboard/superadmin/season-player-stats', label: 'Season Stats', cat: 'Seasons & Stats', roles: ['super_admin'] },
        { href: '/dashboard/superadmin/users', label: 'User Directory', cat: 'System Admin', roles: ['super_admin'] },
        { href: '/dashboard/superadmin/teams', label: 'Teams Registry', cat: 'System Admin', roles: ['super_admin'] },
        { href: '/dashboard/superadmin/players', label: 'Players Registry', cat: 'System Admin', roles: ['super_admin'] },
        { href: '/dashboard/superadmin/invites', label: 'Access Invites', cat: 'System Admin', roles: ['super_admin'] },
        { href: '/dashboard/superadmin/password-requests', label: 'Credentials Reset', cat: 'System Admin', roles: ['super_admin'] },
        { href: '/dashboard/superadmin/monitoring', label: 'System Logs', cat: 'System Admin', roles: ['super_admin'] }
      );
    }

    // Committee Admin Links
    if (user && user.role === 'committee_admin') {
      links.push(
        { href: '/dashboard/committee/teams', label: 'All Teams', cat: 'Squad Management', roles: ['committee_admin'] },
        { href: '/dashboard/committee/players', label: 'All Players', cat: 'Squad Management', roles: ['committee_admin'] },
        { href: '/dashboard/committee/registration', label: 'Registration Console', cat: 'Squad Management', roles: ['committee_admin'] },
        { href: '/dashboard/committee/team-management', label: 'Team Manager Portal', cat: 'Squad Management', roles: ['committee_admin'] },
        { href: '/dashboard/committee/team-management/team-members', label: 'Team Rosters', cat: 'Squad Management', roles: ['committee_admin'] },
        { href: '/dashboard/committee/team-management/categories', label: 'Roster Categories', cat: 'Squad Management', roles: ['committee_admin'] },
        
        { href: '/dashboard/committee/rounds', label: 'Round Records', cat: 'Match Operations', roles: ['committee_admin'] },
        { href: '/dashboard/committee/bulk-rounds', label: 'Bulk Round Finalizer', cat: 'Match Operations', roles: ['committee_admin'] },
        { href: '/dashboard/committee/tiebreakers', label: 'Tiebreaker Registry', cat: 'Match Operations', roles: ['committee_admin'] },
        { href: '/dashboard/committee/team-management/match-days', label: 'Matchday Config', cat: 'Match Operations', roles: ['committee_admin'] },
        { href: '/dashboard/committee/team-management/team-standings', label: 'League Standings', cat: 'Match Operations', roles: ['committee_admin'] },
        { href: '/dashboard/committee/team-management/player-stats', label: 'Player Standings', cat: 'Match Operations', roles: ['committee_admin'] },
        
        { href: '/dashboard/committee/database', label: 'Database Manager', cat: 'Platform Settings', roles: ['committee_admin'] },
        { href: '/dashboard/committee/auction-settings', label: 'Auction Parameters', cat: 'Platform Settings', roles: ['committee_admin'] },
        { href: '/dashboard/committee/position-groups', label: 'Position Groups', cat: 'Platform Settings', roles: ['committee_admin'] },
        { href: '/dashboard/committee/player-selection', label: 'Market Pool', cat: 'Platform Settings', roles: ['committee_admin'] },
        { href: '/dashboard/committee/awards', label: 'Awards System', cat: 'Platform Settings', roles: ['committee_admin'] }
      );
    }

    // Team Manager Links
    if (user && user.role === 'team' && isRegistered) {
      links.push(
        { href: '/dashboard/team/profile', label: 'Club Profile', cat: 'My Club', roles: ['team'], requireRegistration: true },
        { href: '/dashboard/team/players', label: 'Squad Registry', cat: 'My Club', roles: ['team'], requireRegistration: true },
        { href: '/dashboard/team/budget-planner', label: 'Finances & Budget', cat: 'My Club', roles: ['team'], requireRegistration: true },
        { href: '/dashboard/team/requests', label: 'Roster Requests', cat: 'My Club', roles: ['team'], requireRegistration: true },
        
        { href: '/dashboard/team/players-database', label: 'Players Market', cat: 'Market & Ranks', roles: ['team'], requireRegistration: true },
        { href: '/dashboard/team/matches', label: 'Club Matchdays', cat: 'Market & Ranks', roles: ['team'], requireRegistration: true },
        { href: '/dashboard/team/fixtures', label: 'Season Matchups', cat: 'Market & Ranks', roles: ['team'], requireRegistration: true },
        { href: '/dashboard/team/team-leaderboard', label: 'Team Leaderboard', cat: 'Market & Ranks', roles: ['team'], requireRegistration: true },
        { href: '/dashboard/team/player-leaderboard', label: 'Player Leaderboard', cat: 'Market & Ranks', roles: ['team'], requireRegistration: true },
        { href: '/dashboard/team/all-teams', label: 'League Clubs', cat: 'Market & Ranks', roles: ['team'], requireRegistration: true }
      );
    }

    return links;
  };

  return (
    <>
      {/* Mobile Navigation Bar */}
      <nav
        className={`mobile-bottom-nav md:hidden fixed left-4 right-4 z-[1001] rounded-2xl border bg-white/85 backdrop-blur-xl border-[#D4AF37]/25 shadow-lg shadow-black/5 shadow-[#D4AF37]/5 px-2 py-1.5 transition-all duration-300 ease-in-out origin-bottom ${
          isShrunk 
            ? 'scale-90 opacity-60 translate-y-2 hover:scale-100 hover:opacity-100 hover:translate-y-0 active:scale-100 active:opacity-100 active:translate-y-0 focus-within:scale-100 focus-within:opacity-100 focus-within:translate-y-0' 
            : 'scale-100 opacity-100 translate-y-0'
        }`}
        style={{
          bottom: keyboardOffset > 0 
            ? `calc(${keyboardOffset}px + ${isStandalone ? '1.5rem' : '0.5rem'})`
            : (isStandalone 
                ? 'max(1.5rem, env(safe-area-inset-bottom, 24px))' 
                : 'max(0.5rem, env(safe-area-inset-bottom, 0px))')
        }}
      >
        <div className="flex items-center justify-between relative px-2">
          {/* LEFT: Quick Dashboard / Home Link */}
          <Link
            href={getDashboardUrl()}
            className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 group ${
              isActiveLink(getDashboardUrl()) ? 'bg-[#D4AF37]/15 text-[#D4AF37]' : 'hover:bg-[#D4AF37]/8 text-slate-700'
            }`}
            onClick={() => toggleMenu(false)}
            title="Dashboard"
          >
            <svg className={`w-5 h-5 transition-colors ${
              isActiveLink(getDashboardUrl()) ? 'text-[#D4AF37]' : 'text-slate-700 group-hover:text-[#D4AF37]'
            }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
            </svg>
          </Link>

          {/* CENTER: Main Action Trigger Circle */}
          <div className="absolute left-1/2 transform -translate-x-1/2 -top-5 flex items-center z-10">
            <button
              onClick={() => toggleMenu(!isMenuOpen)}
              className={`relative w-12 h-12 rounded-full overflow-hidden flex items-center justify-center transition-all duration-300 shadow-md cursor-pointer ${
                isMenuOpen 
                  ? 'bg-gradient-to-br from-red-500 to-rose-600 scale-110 shadow-rose-500/20 rotate-90' 
                  : 'bg-gradient-to-br from-[#D4AF37] to-[#B8860B] shadow-[#D4AF37]/20 hover:scale-105'
              }`}
              aria-label={isMenuOpen ? "Close menu" : "Open menu"}
            >
              {isMenuOpen ? (
                <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <div className="relative w-7 h-7">
                  <Image
                    src="/logo.png"
                    alt="SS League Logo"
                    fill
                    className="object-contain p-0.5"
                    priority
                  />
                </div>
              )}
            </button>
          </div>

          {/* RIGHT: User Avatar / Login */}
          <div className="flex items-center">
            {!user ? (
              <Link
                href="/login"
                className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 group ${
                  isActiveLink('/login') ? 'bg-[#D4AF37]/15 text-[#D4AF37]' : 'hover:bg-[#D4AF37]/8 text-slate-700'
                }`}
                onClick={() => toggleMenu(false)}
                title="Login"
              >
                <svg className={`w-5 h-5 transition-colors ${
                  isActiveLink('/login') ? 'text-[#D4AF37]' : 'text-slate-700 group-hover:text-[#D4AF37]'
                }`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </Link>
            ) : (
              <Link
                href={getDashboardUrl()}
                className={`flex items-center justify-center w-10 h-10 rounded-xl transition-all duration-200 ${
                  isActiveLink('/profile') || isActiveLink('/dashboard/team/profile') ? 'bg-[#D4AF37]/15 text-[#D4AF37]' : 'hover:bg-[#D4AF37]/8 text-slate-700'
                }`}
                onClick={() => toggleMenu(false)}
                title="Profile"
              >
                {user.role === 'team' && teamLogo ? (
                  <div className={`w-6 h-6 rounded-full overflow-hidden bg-white ring-2 ${
                    isActiveLink('/profile') || isActiveLink('/dashboard/team/profile') ? 'ring-[#D4AF37]' : 'ring-[#D4AF37]/30'
                  }`}>
                    <Image
                      src={teamLogo}
                      alt="Team Logo"
                      width={24}
                      height={24}
                      className="object-cover w-full h-full"
                    />
                  </div>
                ) : (
                  <div className={`w-6 h-6 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center text-white font-bold text-[10px] shadow-sm ${
                    isActiveLink('/profile') || isActiveLink('/dashboard/team/profile') ? 'ring-2 ring-[#D4AF37] ring-offset-1 ring-offset-white' : ''
                  }`}>
                    {user.username.charAt(0).toUpperCase()}
                  </div>
                )}
              </Link>
            )}
          </div>
        </div>
      </nav>

      {/* Full Screen Menu Overlay */}
      {isMenuOpen && (
        <div
          style={{ 
            paddingBottom: isStandalone 
              ? 'calc(8.5rem + env(safe-area-inset-bottom, 24px))' 
              : 'calc(7rem + env(safe-area-inset-bottom, 0px))'
          }}
          className="md:hidden fixed inset-0 z-[1000] overflow-y-auto bg-[#FAF9F6]/98 backdrop-blur-3xl flex flex-col pt-6 px-4 sm:px-6 animate-fade-in font-mono text-slate-700 select-none animate-duration-200 border-l border-t border-[#D4AF37]/25"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              toggleMenu(false);
            }
          }}
        >
          {/* Menu HUD Content Shell */}
          <div className="max-w-2xl mx-auto w-full pt-10 pb-8 relative z-10 space-y-6">
            
            {/* Header console status */}
            <div className="flex items-center justify-between border-b border-[#D4AF37]/30 pb-3 mb-4 select-none font-mono">
              <div>
                <h2 className="text-base font-bold text-slate-900 tracking-tight leading-none">
                  SS <span className="gradient-text">LEAGUE</span>
                </h2>
                <span className="text-[7.5px] text-slate-500 uppercase tracking-widest leading-none mt-1 inline-block">COMMAND CONSOLE</span>
              </div>
              <div className="flex items-center gap-1.5 text-[8px] font-mono text-emerald-700">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse"></span>
                ACTIVE
              </div>
            </div>

            {/* Command Search Bar */}
            <div className="relative border-b border-[#D4AF37]/25 pb-4 mb-4 select-none">
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#B8860B] font-mono text-xs">{'>'}</span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="FILTER SYSTEMS... (e.g. rounds, market, squad)"
                  className="w-full bg-white border border-[#D4AF37]/35 rounded-xl py-2.5 pl-7 pr-8 text-xs font-mono text-slate-800 placeholder-slate-400 focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/30 transition-all"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-[#B8860B] text-[10px] font-mono select-none cursor-pointer"
                  >
                    [X]
                  </button>
                )}
              </div>
            </div>

            {/* Navigation Menu Grid */}
            <nav className="space-y-5">
              
              {/* If search query is active */}
              {searchQuery.trim() !== '' ? (
                <div>
                  <div className="text-[9px] text-[#B8860B] uppercase tracking-wider font-mono mb-3 select-none">
                    {`> query: find --filter="${searchQuery}" --results=${
                      getNavLinks().filter(link => 
                        link.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        link.cat.toLowerCase().includes(searchQuery.toLowerCase())
                      ).length
                    }`}
                  </div>
                  {(() => {
                    const filtered = getNavLinks().filter(link => 
                      link.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
                      link.cat.toLowerCase().includes(searchQuery.toLowerCase())
                    );
                    return filtered.length > 0 ? (
                      <div className="grid grid-cols-2 gap-2">
                        {filtered.map((link) => (
                          <Link
                            key={link.href}
                            href={link.href}
                            onClick={() => toggleMenu(false)}
                            className={`flex items-center gap-2 p-2.5 shadow-sm text-xs rounded-xl group transition-all ${
                              isActiveLink(link.href)
                                ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-[#D4AF37]'
                                : 'bg-white hover:bg-[#FAF9F6] border border-[#D4AF37]/20 hover:border-[#D4AF37]/60 text-slate-700 hover:text-slate-950'
                            }`}
                          >
                            <span className={`transition-colors select-none font-mono font-bold mr-1 ${
                              isActiveLink(link.href) ? 'text-[#D4AF37]' : 'text-slate-400 group-hover:text-[#B8860B]'
                            }`}>&gt;</span>
                            <div>
                              <span className={`transition-colors font-medium block truncate ${
                                isActiveLink(link.href) ? 'text-[#D4AF37] font-bold' : 'text-slate-700 group-hover:text-slate-950'
                              }`}>{link.label}</span>
                              <span className={`text-[7px] uppercase tracking-widest block font-mono leading-none mt-0.5 ${
                                isActiveLink(link.href) ? 'text-[#D4AF37]/80' : 'text-slate-400'
                              }`}>{link.cat}</span>
                            </div>
                          </Link>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-xs font-mono text-slate-500 border border-dashed border-[#D4AF37]/30 bg-white rounded-2xl select-none">
                        NO SYSTEMS MATCHED THE CURRENT QUERY.
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <>
                  {/* General Terminal Access (Always visible when not searching) */}
                  <div className="bg-white border border-[#D4AF37]/20 shadow-sm shadow-[#D4AF37]/3 rounded-2xl p-4 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between border-b border-[#D4AF37]/20 pb-1.5 mb-1 select-none">
                      <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold">
                        Terminal Access
                      </span>
                      {user && (
                        <span className="text-[8px] text-slate-500 font-mono">
                          USER: {user.username.toUpperCase()}
                        </span>
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <Link
                        href="/"
                        className={`flex items-center justify-center gap-1.5 p-2 border text-xs rounded-xl font-medium transition-all ${
                          isActiveLink('/')
                            ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-[#D4AF37]'
                            : 'bg-[#FAF9F6] hover:bg-white border-[#D4AF37]/20 text-slate-700 hover:text-slate-950'
                        }`}
                        onClick={() => toggleMenu(false)}
                      >
                        <span className={`font-mono select-none ${isActiveLink('/') ? 'text-[#D4AF37]' : 'text-slate-400'}`}>&gt;</span> League Home
                      </Link>
                      {!user ? (
                        <Link
                          href="/login"
                          className="flex items-center justify-center gap-1.5 p-2 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] hover:opacity-95 text-white font-bold text-xs rounded-xl transition-all text-center shadow-md shadow-[#D4AF37]/10"
                          onClick={() => toggleMenu(false)}
                        >
                          Sign In
                        </Link>
                      ) : (
                        <Link
                          href={getDashboardUrl()}
                          className={`flex items-center justify-center gap-1.5 p-2 border text-xs rounded-xl font-medium transition-all ${
                            isActiveLink(getDashboardUrl())
                              ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-[#D4AF37]'
                              : 'bg-[#FAF9F6] hover:bg-white border-[#D4AF37]/20 text-slate-700 hover:text-[#D4AF37]'
                          }`}
                          onClick={() => toggleMenu(false)}
                        >
                          <span className={`font-mono select-none ${isActiveLink(getDashboardUrl()) ? 'text-[#D4AF37]' : 'text-slate-400'}`}>&gt;</span> Dashboard
                        </Link>
                      )}
                    </div>
                  </div>

                  {/* Render Grouped Folders */}
                  {(() => {
                    const links = getNavLinks();
                    // Extract unique categories in insertion order
                    const categories = Array.from(new Set(links.map(l => l.cat)));
                    
                    return categories.map((categoryName) => {
                      const categoryLinks = links.filter(l => l.cat === categoryName);
                      const isCollapsed = collapsedCategories[categoryName] ?? true;

                      return (
                        <div key={categoryName} className="bg-white border border-[#D4AF37]/20 shadow-sm shadow-[#D4AF37]/2 rounded-2xl p-4 flex flex-col">
                          <button
                            onClick={() => toggleCategory(categoryName)}
                            className="w-full flex items-center justify-between py-1 border-b border-[#D4AF37]/20 text-[9px] text-slate-500 uppercase tracking-widest font-bold hover:text-slate-900 transition-colors cursor-pointer"
                          >
                            <span>{categoryName}</span>
                            <span className="font-mono text-[#B8860B] text-[10px] select-none">
                              {isCollapsed ? '[ + ]' : '[ - ]'}
                            </span>
                          </button>
                          
                          {!isCollapsed && (
                            <div className="grid grid-cols-2 gap-2 mt-3 animate-fade-in">
                              {categoryLinks.map((link) => (
                                <Link
                                  key={link.href}
                                  href={link.href}
                                  onClick={() => toggleMenu(false)}
                                  className={`flex items-center gap-1.5 p-2 shadow-sm text-[11px] rounded-xl group transition-all ${
                                    isActiveLink(link.href)
                                      ? 'bg-[#D4AF37]/10 border-[#D4AF37] text-[#D4AF37]'
                                      : 'bg-[#FAF9F6]/50 hover:bg-white border border-[#D4AF37]/10 hover:border-[#D4AF37]/45 text-slate-700 hover:text-slate-950 font-medium'
                                  }`}
                                >
                                  <span className={`transition-colors select-none font-mono font-bold ${
                                    isActiveLink(link.href) ? 'text-[#D4AF37]' : 'text-slate-400 group-hover:text-[#B8860B]'
                                  }`}>&gt;</span>
                                  <span className={`truncate ${isActiveLink(link.href) ? 'text-[#D4AF37] font-bold' : ''}`}>{link.label}</span>
                                </Link>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    });
                  })()}
                </>
              )}

              {/* Account / Session Operations */}
              {user && (
                <div className="bg-white border border-[#D4AF37]/20 shadow-sm shadow-[#D4AF37]/3 rounded-2xl p-4 flex flex-col gap-2.5">
                  <span className="text-[9px] text-slate-500 uppercase tracking-wider font-bold border-b border-[#D4AF37]/20 pb-1.5 select-none">
                    Session Controls
                  </span>
                  <div className="grid grid-cols-2 gap-2.5">
                    <Link
                      href="/profile"
                      className="p-2.5 bg-white hover:bg-[#FAF9F6] border border-[#D4AF37]/25 hover:border-[#D4AF37]/60 text-xs text-slate-700 hover:text-slate-950 rounded-xl font-semibold transition-all text-center"
                      onClick={() => toggleMenu(false)}
                    >
                      Edit Profile
                    </Link>
                    <button
                      onClick={handleSignOut}
                      className="p-2.5 bg-rose-50 hover:bg-rose-100 border border-rose-200 hover:border-rose-300 text-xs text-rose-700 hover:text-rose-800 rounded-xl font-semibold transition-all text-center cursor-pointer"
                    >
                      Logout
                    </button>
                  </div>
                </div>
              )}
            </nav>
          </div>
        </div>
      )}

      {/* Add padding to body when mobile nav is present */}
      <style jsx global>{`
        @media (max-width: 768px) {
          body {
            padding-bottom: ${isStandalone ? '114px' : '84px'};
          }
        }
      `}</style>
    </>
  );
}
