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
import ScrollAnimationProvider from "@/components/common/ScrollAnimationProvider";

import { Suspense } from "react";

// Local system-ui font config (prevents Turbopack build failure in offline/restricted environments)
const geistSans = { variable: "font-sans" };
const geistMono = { variable: "font-mono" };

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'https://ssleague.vercel.app'),
  title: {
    default: "SS Super Soccer League (South Soccers)",
    template: "%s | SS Super Soccer League"
  },
  description: "Welcome to the SS Super Soccer League (South Soccers). Experience the thrill of building your dream football team through strategic bidding, competitive auctions, and manager statistics.",
  keywords: [
    "SS Super Soccer League",
    "South Soccers",
    "Football Auction",
    "Fantasy Football",
    "Football bidding",
    "SS League",
    "SS League Auction",
    "Football Manager",
    "Soccer Auction"
  ],
  alternates: {
    canonical: './',
  },
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
    title: "SS Super Soccer League (South Soccers)",
    description: "Welcome to the SS Super Soccer League (South Soccers). Experience the thrill of building your dream football team through strategic bidding, competitive auctions, and manager statistics.",
    images: ['/logo.png'],
    locale: 'en_US',
    type: 'website',
    siteName: 'SS Super Soccer League',
  },
  twitter: {
    card: 'summary_large_image',
    title: "SS Super Soccer League (South Soccers)",
    description: "Welcome to the SS Super Soccer League (South Soccers). Experience the thrill of building your dream football team through strategic bidding, competitive auctions, and manager statistics.",
    images: ['/logo.png'],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
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
                  <ScrollAnimationProvider />
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
