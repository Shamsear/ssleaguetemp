import type { Metadata } from "next";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import MobileNav from "@/components/layout/MobileNav";
import { AuthProvider } from "@/contexts/AuthContext";
import { TeamRegistrationProvider } from "@/contexts/TeamRegistrationContext";
import { QueryProvider } from "@/contexts/QueryProvider";
import { TournamentProvider } from "@/contexts/TournamentContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { Analytics } from "@vercel/analytics/next";
import RegisterServiceWorker from "./register-sw";

import { Suspense } from "react";

// Local system-ui font config (prevents Turbopack build failure in offline/restricted environments)
const geistSans = { variable: "font-sans" };
const geistMono = { variable: "font-mono" };

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://ssleaguetemp.vercel.app'),
  title: "SS League - Football Auction Platform",
  description: "Experience the thrill of building your dream football team through strategic bidding and competitive auctions",
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'SS League',
  },
  openGraph: {
    title: "SS League - Football Auction Platform",
    description: "Experience the thrill of building your dream football team through strategic bidding and competitive auctions",
    images: ['/logo.png'],
  },
  twitter: {
    card: 'summary_large_image',
    title: "SS League - Football Auction Platform",
    description: "Experience the thrill of building your dream football team through strategic bidding and competitive auctions",
    images: ['/logo.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen flex flex-col`}
      >
        <QueryProvider>
          <AuthProvider>
            <TeamRegistrationProvider>
              <TournamentProvider>
                <LanguageProvider>
                  <RegisterServiceWorker />
                  <Suspense fallback={<div className="h-16 bg-white/40 backdrop-blur-md border-b border-slate-200/50" />}>
                    <Navbar />
                  </Suspense>
                  <main className="flex-grow">
                    {children}
                  </main>
                  <Footer />
                  <MobileNav />
                </LanguageProvider>
              </TournamentProvider>
            </TeamRegistrationProvider>
          </AuthProvider>
        </QueryProvider>
        <Analytics />
      </body>
    </html>
  );
}
