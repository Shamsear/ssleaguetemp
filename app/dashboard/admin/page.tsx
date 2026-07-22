'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function AdminDashboardRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/superadmin');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center font-mono text-xs uppercase text-slate-500">
      Redirecting to Super Admin Dashboard...
    </div>
  );
}
