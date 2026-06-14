'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useTeamRegistration } from '@/contexts/TeamRegistrationContext';
import { useFirebaseAuth } from '@/hooks/useFirebase';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export default function Navbar() {
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const { user, loading } = useAuth();

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  const { isRegistered, teamLogo } = useTeamRegistration();
  const { signOut } = useFirebaseAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const currentTab = searchParams ? (searchParams.get('tab') || searchParams.get('filter')) : null;
  const isHome = pathname === '/';
  const dropdownRefs = useRef<{ [key: string]: HTMLDivElement | null }>({});

  const isActiveLink = (href: string) => {
    if (href === '/') {
      return pathname === '/';
    }
    if (href === '/results') {
      return pathname === '/fixtures' && currentTab === 'results';
    }
    if (href === '/fixtures') {
      return pathname === '/fixtures' && currentTab !== 'results';
    }
    return pathname.startsWith(href);
  };

  const isActiveDropdown = (hrefs: string[]) => {
    return hrefs.some(href => isActiveLink(href));
  };

  const getLinkClass = (href: string) => {
    return `relative z-10 px-3 py-2 transition-all duration-200 rounded-lg font-medium text-sm group ${
      isActiveLink(href) ? 'text-[#D4AF37] font-bold' : 'text-gray-700 hover:text-[#D4AF37]'
    }`;
  };

  const getBackgroundSpanClass = (href: string) => {
    return `absolute inset-0 bg-[#D4AF37]/8 rounded-lg transition-all duration-200 -z-10 ${
      isActiveLink(href) ? 'opacity-100 scale-100' : 'opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100'
    }`;
  };

  const getDropdownClass = (hrefs: string[]) => {
    return `relative z-10 px-3 py-2 transition-all duration-200 rounded-lg flex items-center gap-1 font-medium text-sm group ${
      isActiveDropdown(hrefs) ? 'text-[#D4AF37] font-bold' : 'text-gray-700 hover:text-[#D4AF37]'
    }`;
  };

  const getDropdownSpanClass = (hrefs: string[]) => {
    return `absolute inset-0 bg-[#D4AF37]/8 rounded-lg transition-all duration-200 -z-10 ${
      isActiveDropdown(hrefs) ? 'opacity-100 scale-100' : 'opacity-0 scale-75 group-hover:opacity-100 group-hover:scale-100'
    }`;
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const isOutside = Object.values(dropdownRefs.current).every(
        (ref) => ref && !ref.contains(target)
      );
      if (isOutside) {
        setOpenDropdown(null);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleDropdown = (name: string) => {
    setOpenDropdown(openDropdown === name ? null : name);
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
      router.push('/login');
    } catch (error) {
      console.error('Sign out error:', error);
    }
  };

  return (
    <div className={`fixed left-1/2 -translate-x-1/2 z-50 hidden sm:block w-[95%] max-w-6xl transition-all duration-300 ${
      isScrolled ? 'top-3 max-w-[90%]' : 'top-5'
    }`}>
      <nav className={`rounded-2xl transition-all duration-300 border ${
        isScrolled 
          ? 'bg-white/80 backdrop-blur-xl border-[#D4AF37]/25 shadow-[0_10px_30px_rgba(212,175,55,0.1)] shadow-black/5' 
          : 'bg-white/50 backdrop-blur-md border-[#D4AF37]/15 shadow-sm shadow-[#D4AF37]/5'
      }`}>
        <div className="px-6 flex justify-between items-center relative transition-all duration-300" style={{ height: isScrolled ? '54px' : '64px' }}>
        {/* Logo */}
        <Link href={getDashboardUrl()} className="flex items-center group gap-3">
          <div className="relative w-10 h-10 rounded-xl overflow-hidden transition-all duration-300 hover:scale-105 shadow-md group-hover:shadow-lg bg-white ring-2 ring-[#D4AF37]/20 hover:ring-[#D4AF37]/40">
            <Image
              src="/logo.png"
              alt="SS League Logo"
              width={40}
              height={40}
              className="object-contain p-0.5"
              priority
            />
            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-[#D4AF37]/10 to-[#B8860B]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
          </div>
          <div className="flex flex-col">
            <span className="text-lg font-bold gradient-text leading-none tracking-tight">
              SS League
            </span>
            <span className="text-[10px] text-gray-500 font-medium leading-none mt-0.5">Auction Platform</span>
          </div>
        </Link>

        {/* Center Navigation Links */}
        <div className="hidden lg:flex items-center gap-1">
          {!user ? (
            <>
              {/* Public Navigation */}
              <Link href="/" className={getLinkClass('/')}>
                Home
                <span className={getBackgroundSpanClass('/')}></span>
              </Link>
              {/* Season Dropdown */}
              <div className="relative" ref={(el) => { dropdownRefs.current['publicSeason'] = el; }}>
                <button
                  onClick={() => toggleDropdown('publicSeason')}
                  className={getDropdownClass(['/season/current', '/seasons'])}
                >
                  Season
                  <span className={getDropdownSpanClass(['/season/current', '/seasons'])}></span>
                  <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === 'publicSeason' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openDropdown === 'publicSeason' && (
                  <div className="absolute top-full left-0 mt-2 w-48 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl py-2 z-50 border border-[#D4AF37]/20 shadow-[#D4AF37]/5 animate-fade-in">
                    <Link 
                      href="/season/current" 
                      className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                        isActiveLink('/season/current')
                          ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                          : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                      }`}
                      onClick={() => setOpenDropdown(null)}
                    >
                      <span className="flex items-center">
                        <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                          isActiveLink('/season/current') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}></span>
                        Current Season
                      </span>
                    </Link>
                    <Link 
                      href="/seasons" 
                      className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                        isActiveLink('/seasons')
                          ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                          : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                      }`}
                      onClick={() => setOpenDropdown(null)}
                    >
                      <span className="flex items-center">
                        <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                          isActiveLink('/seasons') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                        }`}></span>
                        See All Seasons
                      </span>
                    </Link>
                  </div>
                )}
              </div>
              <Link href="/players" className={getLinkClass('/players')}>
                Players
                <span className={getBackgroundSpanClass('/players')}></span>
              </Link>
              <Link href="/footballplayers" className={getLinkClass('/footballplayers')}>
                Football Players
                <span className={getBackgroundSpanClass('/footballplayers')}></span>
              </Link>
              <Link href="/teams" className={getLinkClass('/teams')}>
                Teams
                <span className={getBackgroundSpanClass('/teams')}></span>
              </Link>
              <Link href="/fixtures" className={getLinkClass('/fixtures')}>
                Fixtures
                <span className={getBackgroundSpanClass('/fixtures')}></span>
              </Link>
              <Link href="/fixtures?tab=results" className={getLinkClass('/results')}>
                Results
                <span className={getBackgroundSpanClass('/results')}></span>
              </Link>
              <Link href="/awards" className={getLinkClass('/awards')}>
                Awards
                <span className={getBackgroundSpanClass('/awards')}></span>
              </Link>
              <Link href="/news" className={getLinkClass('/news')}>
                News
                <span className={getBackgroundSpanClass('/news')}></span>
              </Link>
              <Link href="/polls" className={getLinkClass('/polls')}>
                Polls
                <span className={getBackgroundSpanClass('/polls')}></span>
              </Link>
            </>
          ) : (
            <>
              {/* Role-based Navigation */}
              <Link href={getDashboardUrl()} className={getLinkClass(getDashboardUrl())}>
                Dashboard
                <span className={getBackgroundSpanClass(getDashboardUrl())}></span>
              </Link>

              {/* Super Admin Navigation */}
              {user.role === 'super_admin' && (
                <>
                  {/* Seasons Dropdown */}
                  <div className="relative" ref={(el) => { dropdownRefs.current['seasons'] = el; }}>
                    <button
                      onClick={() => toggleDropdown('seasons')}
                      className={getDropdownClass(['/dashboard/superadmin/seasons', '/dashboard/superadmin/historical-seasons', '/dashboard/superadmin/season-player-stats'])}
                    >
                      Seasons
                      <span className={getDropdownSpanClass(['/dashboard/superadmin/seasons', '/dashboard/superadmin/historical-seasons', '/dashboard/superadmin/season-player-stats'])}></span>
                      <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === 'seasons' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openDropdown === 'seasons' && (
                      <div className="absolute top-full left-0 mt-2 w-56 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl py-2.5 z-50 border border-[#D4AF37]/20 shadow-[#D4AF37]/5 animate-fade-in">
                        <Link 
                          href="/dashboard/superadmin/seasons" 
                          className={`block px-3 py-2 text-sm transition-all duration-150 rounded-lg mx-1.5 font-medium ${
                            isActiveLink('/dashboard/superadmin/seasons')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          All Seasons
                        </Link>
                        <Link 
                          href="/dashboard/superadmin/seasons/create" 
                          className={`block px-3 py-2 text-sm transition-all duration-150 rounded-lg mx-1.5 font-medium ${
                            isActiveLink('/dashboard/superadmin/seasons/create')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          Create Season
                        </Link>
                        <Link 
                          href="/dashboard/superadmin/historical-seasons" 
                          className={`block px-3 py-2 text-sm transition-all duration-150 rounded-lg mx-1.5 font-medium ${
                            isActiveLink('/dashboard/superadmin/historical-seasons')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          Historical Seasons
                        </Link>
                        <Link 
                          href="/dashboard/superadmin/season-player-stats" 
                          className={`block px-3 py-2 text-sm transition-all duration-150 rounded-lg mx-1.5 font-medium ${
                            isActiveLink('/dashboard/superadmin/season-player-stats')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          Season Stats
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Management Dropdown */}
                  <div className="relative" ref={(el) => { dropdownRefs.current['management'] = el; }}>
                    <button
                      onClick={() => toggleDropdown('management')}
                      className={getDropdownClass(['/dashboard/superadmin/users', '/dashboard/superadmin/teams', '/dashboard/superadmin/players', '/dashboard/superadmin/invites', '/dashboard/superadmin/password-requests', '/dashboard/superadmin/monitoring'])}
                    >
                      Management
                      <span className={getDropdownSpanClass(['/dashboard/superadmin/users', '/dashboard/superadmin/teams', '/dashboard/superadmin/players', '/dashboard/superadmin/invites', '/dashboard/superadmin/password-requests', '/dashboard/superadmin/monitoring'])}></span>
                      <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${openDropdown === 'management' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openDropdown === 'management' && (
                      <div className="absolute top-full left-0 mt-2 w-56 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl py-2.5 z-50 border border-[#D4AF37]/20 shadow-[#D4AF37]/5 animate-fade-in">
                        <Link 
                          href="/dashboard/superadmin/users" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/superadmin/users')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/superadmin/users') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Users
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/superadmin/teams" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/superadmin/teams')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/superadmin/teams') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Teams
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/superadmin/players" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/superadmin/players')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/superadmin/players') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Players
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/superadmin/invites" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/superadmin/invites')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/superadmin/invites') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Invites
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/superadmin/password-requests" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/superadmin/password-requests')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/superadmin/password-requests') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Password Requests
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/superadmin/monitoring" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/superadmin/monitoring')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/superadmin/monitoring') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Monitoring
                          </span>
                        </Link>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Committee Admin Navigation */}
              {user.role === 'committee_admin' && (
                <>
                  {/* Teams & Players Dropdown */}
                  <div className="relative" ref={(el) => { dropdownRefs.current['teams'] = el; }}>
                    <button
                      onClick={() => toggleDropdown('teams')}
                      className={getDropdownClass(['/dashboard/committee/teams', '/dashboard/committee/players', '/dashboard/committee/registration', '/dashboard/committee/database'])}
                    >
                      Teams & Players
                      <span className={getDropdownSpanClass(['/dashboard/committee/teams', '/dashboard/committee/players', '/dashboard/committee/registration', '/dashboard/committee/database'])}></span>
                      <svg className={`w-4 h-4 ml-1.5 transition-transform duration-350 ${openDropdown === 'teams' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openDropdown === 'teams' && (
                      <div className="absolute top-full left-0 mt-2 w-60 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl py-3 z-50 border border-[#D4AF37]/20 shadow-[#D4AF37]/5 animate-fade-in">
                        <Link 
                          href="/dashboard/committee/teams" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/committee/teams')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/committee/teams') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            All Teams
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/committee/players" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/committee/players')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/committee/players') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            All Players
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/committee/registration" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/committee/registration')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/committee/registration') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Registration
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/committee/database" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/committee/database')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/committee/database') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Database
                          </span>
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Rounds & Matches Dropdown */}
                  <div className="relative" ref={(el) => { dropdownRefs.current['rounds'] = el; }}>
                    <button
                      onClick={() => toggleDropdown('rounds')}
                      className={getDropdownClass(['/dashboard/committee/rounds', '/dashboard/committee/bulk-rounds', '/dashboard/committee/tiebreakers'])}
                    >
                      Rounds & Matches
                      <span className={getDropdownSpanClass(['/dashboard/committee/rounds', '/dashboard/committee/bulk-rounds', '/dashboard/committee/tiebreakers'])}></span>
                      <svg className={`w-4 h-4 ml-1.5 transition-transform duration-350 ${openDropdown === 'rounds' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openDropdown === 'rounds' && (
                      <div className="absolute top-full left-0 mt-2 w-60 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl py-3 z-50 border border-[#D4AF37]/20 shadow-[#D4AF37]/5 animate-fade-in">
                        <Link 
                          href="/dashboard/committee/rounds" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/committee/rounds')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/committee/rounds') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            All Rounds
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/committee/bulk-rounds" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/committee/bulk-rounds')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/committee/bulk-rounds') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Bulk Rounds
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/committee/tiebreakers" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/committee/tiebreakers')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/committee/tiebreakers') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Tiebreakers
                          </span>
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Tournament Dropdown */}
                  <div className="relative" ref={(el) => { dropdownRefs.current['tournament'] = el; }}>
                    <button
                      onClick={() => toggleDropdown('tournament')}
                      className={getDropdownClass(['/dashboard/committee/team-management'])}
                    >
                      Tournament
                      <span className={getDropdownSpanClass(['/dashboard/committee/team-management'])}></span>
                      <svg className={`w-4 h-4 ml-1.5 transition-transform duration-350 ${openDropdown === 'tournament' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openDropdown === 'tournament' && (
                      <div className="absolute top-full left-0 mt-2 w-60 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl py-3 z-50 border border-[#D4AF37]/20 shadow-[#D4AF37]/5 animate-fade-in">
                        <Link 
                          href="/dashboard/committee/team-management" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            pathname === '/dashboard/committee/team-management'
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              pathname === '/dashboard/committee/team-management' ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Team Management
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/committee/team-management/categories" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/committee/team-management/categories')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/committee/team-management/categories') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Categories
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/committee/team-management/match-days" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/committee/team-management/match-days')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/committee/team-management/match-days') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Match Days
                          </span>
                        </Link>
                        <div className="border-t border-[#D4AF37]/10 my-1"></div>
                        <Link 
                          href="/dashboard/committee/team-management/team-standings" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/committee/team-management/team-standings')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/committee/team-management/team-standings') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Team Standings
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/committee/team-management/player-stats" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/committee/team-management/player-stats')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/committee/team-management/player-stats') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Player Statistics
                          </span>
                        </Link>
                        <div className="border-t border-[#D4AF37]/10 my-1"></div>
                        <Link 
                          href="/dashboard/committee/team-management/team-members" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/committee/team-management/team-members')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/committee/team-management/team-members') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Team Members
                          </span>
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Settings Dropdown */}
                  <div className="relative" ref={(el) => { dropdownRefs.current['settings'] = el; }}>
                    <button
                      onClick={() => toggleDropdown('settings')}
                      className={getDropdownClass(['/dashboard/committee/auction-settings', '/dashboard/committee/position-groups', '/dashboard/committee/player-selection', '/dashboard/committee/awards'])}
                    >
                      Settings
                      <span className={getDropdownSpanClass(['/dashboard/committee/auction-settings', '/dashboard/committee/position-groups', '/dashboard/committee/player-selection', '/dashboard/committee/awards'])}></span>
                      <svg className={`w-4 h-4 ml-1.5 transition-transform duration-350 ${openDropdown === 'settings' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openDropdown === 'settings' && (
                      <div className="absolute top-full left-0 mt-2 w-60 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl py-3 z-50 border border-[#D4AF37]/20 shadow-[#D4AF37]/5 animate-fade-in">
                        <Link 
                          href="/dashboard/committee/auction-settings" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/committee/auction-settings')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/committee/auction-settings') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Auction Settings
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/committee/position-groups" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/committee/position-groups')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/committee/position-groups') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Position Groups
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/committee/player-selection" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/committee/player-selection')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/committee/player-selection') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Player Selection
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/committee/awards" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/committee/awards')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/committee/awards') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Awards Management
                          </span>
                        </Link>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* Team Navigation - Only show if registered */}
              {user.role === 'team' && isRegistered && (
                <>
                  {/* My Team Dropdown */}
                  <div className="relative" ref={(el) => { dropdownRefs.current['myteam'] = el; }}>
                    <button
                      onClick={() => toggleDropdown('myteam')}
                      className={getDropdownClass(['/dashboard/team/profile', '/dashboard/team/players', '/dashboard/team/budget-planner', '/dashboard/team/players-database'])}
                    >
                      My Team
                      <span className={getDropdownSpanClass(['/dashboard/team/profile', '/dashboard/team/players', '/dashboard/team/budget-planner', '/dashboard/team/players-database'])}></span>
                      <svg className={`w-4 h-4 ml-1.5 transition-transform duration-350 ${openDropdown === 'myteam' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openDropdown === 'myteam' && (
                      <div className="absolute top-full left-0 mt-2 w-60 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl py-3 z-50 border border-[#D4AF37]/20 shadow-[#D4AF37]/5 animate-fade-in">
                        <Link 
                          href="/dashboard/team/profile" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/team/profile')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/team/profile') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Team Profile
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/team/players" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/team/players')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/team/players') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            My Players
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/team/budget-planner" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/team/budget-planner')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/team/budget-planner') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Budget Planner
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/team/players-database" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/team/players-database')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/team/players-database') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Player Database
                          </span>
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Matches Dropdown */}
                  <div className="relative" ref={(el) => { dropdownRefs.current['matches'] = el; }}>
                    <button
                      onClick={() => toggleDropdown('matches')}
                      className={getDropdownClass(['/dashboard/team/matches', '/dashboard/team/fixtures'])}
                    >
                      Matches
                      <span className={getDropdownSpanClass(['/dashboard/team/matches', '/dashboard/team/fixtures'])}></span>
                      <svg className={`w-4 h-4 ml-1.5 transition-transform duration-350 ${openDropdown === 'matches' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openDropdown === 'matches' && (
                      <div className="absolute top-full left-0 mt-2 w-60 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl py-3 z-50 border border-[#D4AF37]/20 shadow-[#D4AF37]/5 animate-fade-in">
                        <Link 
                          href="/dashboard/team/matches" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/team/matches')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/team/matches') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            All Matches
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/team/fixtures" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/team/fixtures')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/team/fixtures') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Fixtures
                          </span>
                        </Link>
                      </div>
                    )}
                  </div>

                  {/* Leaderboards Dropdown */}
                  <div className="relative" ref={(el) => { dropdownRefs.current['leaderboards'] = el; }}>
                    <button
                      onClick={() => toggleDropdown('leaderboards')}
                      className={getDropdownClass(['/dashboard/team/team-leaderboard', '/dashboard/team/player-leaderboard', '/dashboard/team/all-teams'])}
                    >
                      Leaderboards
                      <span className={getDropdownSpanClass(['/dashboard/team/team-leaderboard', '/dashboard/team/player-leaderboard', '/dashboard/team/all-teams'])}></span>
                      <svg className={`w-4 h-4 ml-1.5 transition-transform duration-350 ${openDropdown === 'leaderboards' ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </button>
                    {openDropdown === 'leaderboards' && (
                      <div className="absolute top-full left-0 mt-2 w-60 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl py-3 z-50 border border-[#D4AF37]/20 shadow-[#D4AF37]/5 animate-fade-in">
                        <Link 
                          href="/dashboard/team/team-leaderboard" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/team/team-leaderboard')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/team/team-leaderboard') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Team Leaderboard
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/team/player-leaderboard" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/team/player-leaderboard')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/team/player-leaderboard') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            Player Leaderboard
                          </span>
                        </Link>
                        <Link 
                          href="/dashboard/team/all-teams" 
                          className={`block px-4 py-2 text-sm transition-all duration-200 rounded-xl mx-2 font-medium group ${
                            isActiveLink('/dashboard/team/all-teams')
                              ? 'bg-[#D4AF37]/10 text-[#D4AF37]'
                              : 'text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37]'
                          }`}
                        >
                          <span className="flex items-center">
                            <span className={`w-1.5 h-1.5 rounded-full bg-[#D4AF37] mr-3 transition-opacity ${
                              isActiveLink('/dashboard/team/all-teams') ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            }`}></span>
                            All Teams
                          </span>
                        </Link>
                      </div>
                    )}
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* Right Side Actions */}
        <div className="flex items-center space-x-3">
          {user ? (
            <>
              {/* User Profile Dropdown */}
              <div className="relative" ref={(el) => { dropdownRefs.current['profile'] = el; }}>
                <button
                  onClick={() => toggleDropdown('profile')}
                  className="relative z-10 flex items-center space-x-3 px-3 py-1.5 rounded-lg transition-all duration-300 group border border-transparent"
                >
                  <span className="absolute inset-0 bg-[#D4AF37]/8 rounded-lg scale-75 opacity-0 group-hover:opacity-100 group-hover:scale-100 transition-all duration-200 -z-10"></span>
                  <div className="flex items-center space-x-2">
                    {user.role === 'team' && teamLogo ? (
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-white shadow-lg ring-2 ring-[#D4AF37]/30 group-hover:ring-[#D4AF37]/50 transition-all">
                        <Image
                          src={teamLogo}
                          alt="Team Logo"
                          width={32}
                          height={32}
                          className="object-cover w-full h-full"
                        />
                      </div>
                    ) : (
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#D4AF37] to-[#B8860B] flex items-center justify-center text-white font-bold text-xs shadow-lg ring-2 ring-[#D4AF37]/30 group-hover:ring-[#D4AF37]/50 transition-all">
                        {user.username.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div className="text-left hidden xl:block">
                      <p className="text-xs font-semibold text-gray-800 leading-tight">{user.username}</p>
                      <p className="text-[10px] text-gray-500">
                        {user.role === 'super_admin' && 'Super Admin'}
                        {user.role === 'committee_admin' && 'Committee Admin'}
                        {user.role === 'team' && 'Team Manager'}
                      </p>
                    </div>
                  </div>
                  <svg className="w-3.5 h-3.5 text-gray-500 group-hover:text-[#D4AF37] transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openDropdown === 'profile' && (
                  <div className="absolute top-full right-0 mt-2 w-64 bg-white/95 backdrop-blur-xl rounded-2xl shadow-2xl py-3 z-50 border border-[#D4AF37]/20 shadow-[#D4AF37]/5 animate-fade-in">
                    <div className="px-5 py-4 border-b border-[#D4AF37]/10">
                      <p className="text-sm font-semibold text-gray-800">{user.username}</p>
                      <p className="text-xs text-gray-500">{user.email}</p>
                      {user.role === 'super_admin' && (
                        <span className="inline-block mt-2 px-2.5 py-1 text-xs rounded-full bg-purple-100 text-purple-800 font-medium">Super Admin</span>
                      )}
                      {user.role === 'committee_admin' && (
                        <span className="inline-block mt-2 px-2.5 py-1 text-xs rounded-full bg-[#F3E5AB] text-[#B8860B] font-medium">Committee Admin</span>
                      )}
                      {user.role === 'team' && (
                        <span className="inline-block mt-2 px-2.5 py-1 text-xs rounded-full bg-green-100 text-green-800 font-medium">Team Manager</span>
                      )}
                    </div>
                    <Link href={getDashboardUrl()} className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37] transition-all rounded-lg mx-1 mt-1">
                      <svg className="w-4 h-4 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                      </svg>
                      Dashboard
                    </Link>
                    {user.role === 'team' && (
                      <Link href="/dashboard/team/profile" className="block px-4 py-2.5 text-sm text-gray-700 hover:bg-[#D4AF37]/5 hover:text-[#D4AF37] transition-all rounded-lg mx-1">
                        <svg className="w-4 h-4 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                        </svg>
                        My Profile
                      </Link>
                    )}
                    <div className="border-t border-[#D4AF37]/10 mt-1 pt-1">
                      <button
                        onClick={handleSignOut}
                        className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-all rounded-lg mx-1 mb-1"
                      >
                        <svg className="w-4 h-4 inline-block mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                        </svg>
                        Logout
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className={`relative z-10 px-5 py-1.5 overflow-hidden font-semibold text-sm border rounded-xl transition-all duration-300 group shadow-md ${
                  pathname === '/login'
                    ? 'border-[#D4AF37] text-white shadow-[#D4AF37]/20'
                    : 'text-[#D4AF37] border-[#D4AF37]/30 hover:border-[#D4AF37] hover:text-white shadow-[#D4AF37]/5 hover:shadow-[#D4AF37]/20'
                }`}
              >
                <span className={`absolute inset-0 bg-gradient-to-r from-[#D4AF37] to-[#B8860B] transition-transform duration-300 -z-10 ${
                  pathname === '/login' ? 'translate-y-0' : 'translate-y-full group-hover:translate-y-0'
                }`}></span>
                Login
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  </div>
  );
}
