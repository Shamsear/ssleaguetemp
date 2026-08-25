import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

// Public paths that don't require authentication
const PUBLIC_PATHS = [
  '/',
  '/login',
  '/register',
  '/api/auth',
  '/api/realtime',
  '/api/public',
  '/news',
  '/players',
  '/fixtures',
  '/registered-players',
  '/sw.js',
  '/manifest.json',
  '/logo.png',
  '/favicon.ico',
];

// Paths that always require auth
const PROTECTED_PREFIXES = [
  '/dashboard',
  '/team',
  '/committee',
  '/admin',
  '/superadmin',
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip middleware for public paths, static files, and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.') && !pathname.endsWith('.tsx') && !pathname.endsWith('.ts')
  ) {
    return NextResponse.next();
  }

  // Allow public paths
  const isPublicPath = PUBLIC_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'));
  if (isPublicPath) {
    return NextResponse.next();
  }

  // Check if this is a protected path
  const isProtectedPath = PROTECTED_PREFIXES.some(p => pathname.startsWith(p));
  
  if (isProtectedPath) {
    // Check for auth token cookie
    const token = request.cookies.get('token')?.value;
    
    if (!token) {
      // No token - redirect to login with return URL
      const loginUrl = new URL('/login', request.url);
      loginUrl.searchParams.set('from', pathname);
      return NextResponse.redirect(loginUrl);
    }
    
    // Token exists - let the page handle role-based checks
    // (We can't verify the token in middleware without Firebase Admin SDK overhead)
    return NextResponse.next();
  }

  // Allow everything else
  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all paths except static files
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
