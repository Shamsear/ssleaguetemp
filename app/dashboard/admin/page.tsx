'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import AuthGuard from '@/components/auth/AuthGuard';

export default function AdminDashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/superadmin');
  }, [router]);

  return (
    <AuthGuard requiredRole="super_admin">
    <div className="min-h-screen flex items-center justify-center font-mono text-xs uppercase text-slate-500">
      Redirecting to Super Admin Dashboard...
    </div>
  
    </AuthGuard>
  );
}
