'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '@/contexts/AuthContext';

interface AuthGuardProps {
  children: React.ReactNode;
  /** Required role(s). If user doesn't have one of these roles, redirect to appropriate page */
  requiredRole?: string | string[];
  /** Where to redirect if not authenticated (default: /login) */
  redirectTo?: string;
  /** Custom loading component */
  loadingComponent?: React.ReactNode;
  /** If true, allows unauthenticated access (for public pages that optionally show auth'd content) */
  allowPublic?: boolean;
}

/**
 * AuthGuard - Centralized auth protection for dashboard pages.
 * 
 * Usage:
 *   // Basic protection (any logged-in user)
 *   <AuthGuard>
 *     <MyDashboardPage />
 *   </AuthGuard>
 * 
 *   // Role-based protection
 *   <AuthGuard requiredRole="committee_admin">
 *     <CommitteePage />
 *   </AuthGuard>
 * 
 *   // Multiple allowed roles
 *   <AuthGuard requiredRole={["committee_admin", "super_admin"]}>
 *     <AdminPage />
 *   </AuthGuard>
 * 
 *   // Allow public access but show different content for auth'd users
 *   <AuthGuard allowPublic>
 *     <PublicPage />
 *   </AuthGuard>
 */
export default function AuthGuard({
  children,
  requiredRole,
  redirectTo,
  loadingComponent,
  allowPublic = false,
}: AuthGuardProps) {
  const { user, loading, error } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Still loading - wait
    if (loading) return;

    // Not authenticated
    if (!user && !allowPublic) {
      const redirect = redirectTo || `/login?from=${encodeURIComponent(pathname)}`;
      router.push(redirect);
      return;
    }

    // Authenticated but wrong role
    if (user && requiredRole) {
      const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
      
      if (!roles.includes(user.role)) {
        // Redirect to appropriate dashboard based on their actual role
        const roleRedirects: Record<string, string> = {
          super_admin: '/dashboard/superadmin',
          committee_admin: '/dashboard/committee',
          team: '/dashboard/team',
          player: '/dashboard/players',
        };
        const target = roleRedirects[user.role] || '/login';
        router.push(target);
        return;
      }
    }
  }, [user, loading, requiredRole, allowPublic, redirectTo, router, pathname]);

  // Show loading state
  if (loading) {
    if (loadingComponent) return <>{loadingComponent}</>;
    
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-500 text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  // Auth error
  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-500 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // Not authenticated and not public - will redirect (show nothing)
  if (!user && !allowPublic) {
    return null;
  }

  // Wrong role - will redirect (show nothing)
  if (user && requiredRole) {
    const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
    if (!roles.includes(user.role)) {
      return null;
    }
  }

  // All checks passed - show children
  return <>{children}</>;
}
