'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function ChangeSupportedTeamPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/team/fantasy/my-team');
  }, [router]);

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center font-mono text-slate-500">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-700 mx-auto mb-3" />
        <p className="text-xs uppercase tracking-wider font-bold">Redirecting to My Team...</p>
      </div>
    </div>
  );
}
