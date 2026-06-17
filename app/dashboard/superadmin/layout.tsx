import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Super Admin Dashboard - SS League',
  description: 'Super admin control panel for managing users, seasons, and system settings',
};

export default function SuperAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      {/* Ambient Gold Glow */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />
      <div className="max-w-7xl mx-auto relative z-10">
        {children}
      </div>
    </div>
  );
}
