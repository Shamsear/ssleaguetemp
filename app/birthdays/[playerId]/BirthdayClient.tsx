'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ChevronLeft,
  Calendar,
  Share2,
  Copy,
  Check,
  Trophy,
  Target,
  Award,
  ExternalLink,
  Users,
  Heart,
  MessageCircle,
  ArrowRight,
  CircleDot,
  Swords,
  Languages,
  Star,
} from 'lucide-react';
import ConfettiEffect from '../../../components/birthday/ConfettiEffect';

interface StoryContent {
  headline: string;
  subtitle: string;
  roastParagraph: string;
  tacticalReport: string;
  lockerRoomRumor: string;
  birthdayWish: string;
  isAiGenerated: boolean;
}

interface BirthdayData {
  player: {
    id: string;
    player_id: string;
    name: string;
    display_name: string;
    dob: string;
    age: number;
    photo_url: string;
    team: string;
    category: string;
    place?: string;
  };
  stats: {
    matches: number;
    goals: number;
    goals_conceded: number;
    wins: number;
    draws: number;
    losses: number;
    clean_sheets: number;
    motm_awards: number;
    points: number;
  };
  seasons: Array<{
    season_id: string;
    team: string;
    category: string;
    matches: number;
    goals: number;
    wins: number;
    clean_sheets: number;
    motm_awards: number;
    points: number;
    base_points?: number;
    raw_points?: number;
    star_rating?: number;
  }>;
  awards: any[];
  story: StoryContent;
  storyEn?: StoryContent;
  storyMl?: StoryContent;
  initialLang?: 'en' | 'ml';
}

const getCategoryColor = (category: string) => {
  const cat = (category || '').toLowerCase();
  if (cat.includes('★') || cat.includes('star')) {
    return 'bg-amber-50 text-amber-800 border-amber-200';
  }
  switch (cat) {
    case 'red':
      return 'bg-red-50 text-red-700 border-red-200';
    case 'black':
      return 'bg-slate-900 text-white border-slate-800';
    case 'blue':
      return 'bg-blue-50 text-blue-700 border-blue-200';
    case 'orange':
      return 'bg-orange-50 text-orange-700 border-orange-200';
    case 'white':
      return 'bg-slate-100 text-slate-700 border-slate-200';
    case 'na':
    case 'n/a':
    case 'a':
      return 'bg-slate-100 text-slate-500 border-slate-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200';
  }
};

function getOrdinal(n: number): string {
  if (!n) return '';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

const translations = {
  en: {
    backToHome: 'BACK TO HOME',
    playerId: 'PLAYER_ID',
    birthdayEdition: 'BIRTHDAY EDITION',
    years: 'YEARS',
    playerRole: 'PLAYER',
    spotlightBadge: 'SS SUPER LEAGUE // BIRTHDAY SPOTLIGHT',
    aka: 'AKA',
    team: 'TEAM',
    cat: 'CAT',
    greeting:
      'The SS Premier Super League family congratulates you on your special day. Celebrating your dedication, tournament consistency, and tournament highlights.',
    wishHappyBirthday: 'Wish Happy Birthday',
    wished: 'Wished!',
    copyLink: 'COPY LINK',
    copied: 'COPIED',
    whatsapp: 'WHATSAPP',
    shareOnX: 'SHARE ON X',
    pressDispatch: 'Tournament Press Dispatch // Special Feature',
    chronicleTitle: 'The Birthday Chronicle: Roast & Toast',
    aiGenerated: 'AI SPORTS DESK',
    editorialDesk: 'LEAGUE SPORTS DESK',
    regenerateStory: 'Regenerate Feature',
    draftingStory: 'Drafting Feature...',
    communityRoast: 'COMMUNITY ROAST & OBSERVATION',
    tacticalDispatch: 'TACTICAL SCOUTING DISPATCH',
    franchiseNotes: 'FRANCHISE & TEAMMATE NOTES',
    officialSalute: 'OFFICIAL LEAGUE SALUTE',
    performanceRecord: 'Career Hall of Records',
    tournamentMetrics: 'Tournament Metrics',
    seasonsCount: 'SEASONS',
    matches: 'Matches',
    totalPlayed: 'Total Played',
    goals: 'Goals',
    perMatch: '/ match',
    wins: 'Wins',
    winRate: 'Win Rate',
    cleanSheets: 'Clean Sheets',
    shutouts: 'Shutouts',
    motm: 'MOTM',
    awards: 'Awards',
    points: 'Points',
    careerPts: 'Career Pts',
    historyBySeason: 'Tournament History by Season',
    colSeason: 'Season',
    colTeam: 'Team',
    colCat: 'Cat / Star',
    colMatches: 'Matches',
    colGoals: 'Goals',
    colWins: 'Wins',
    colPoints: 'Points',
    honorsTitle: 'Honors & Accolades',
    potd: 'Player of the Day',
    potw: 'Player of the Week',
    viewInstagram: 'View Instagram Feature',
    returnHome: 'RETURN TO SS SUPER LEAGUE HOME',
    whatsappShareText: (name: string, age: number, url: string) =>
      age
        ? `Wishing *${name}* a very Happy ${getOrdinal(age)} Birthday! Drop your wishes and explore his SS League stats:\n${url}`
        : `Wishing *${name}* a very Happy Birthday! Drop your wishes and explore his SS League stats:\n${url}`,
    twitterShareText: (name: string, age: number) =>
      age
        ? `Wishing ${name} a very Happy ${getOrdinal(age)} Birthday! Explore his SS League tournament record:`
        : `Wishing ${name} a very Happy Birthday! Explore his SS League tournament record:`,
  },
  ml: {
    backToHome: 'ഹോമിലേക്ക് മടങ്ങുക',
    playerId: 'പ്ലെയർ ഐഡി',
    birthdayEdition: 'ബർത്ത്ഡേ സ്പെഷ്യൽ',
    years: 'വയസ്സ്',
    playerRole: 'താരം',
    spotlightBadge: 'എസ്എസ് സൂപ്പർ ലീഗ് // ജന്മദിനാശംസകൾ',
    aka: 'അറിയപ്പെടുന്നത്',
    team: 'ടീം',
    cat: 'കാറ്റഗറി',
    greeting:
      'എസ്എസ് പ്രീമിയർ സൂപ്പർ ലീഗ് കുടുംബത്തിന്റെ ഹൃദയം നിറഞ്ഞ ജന്മദിനാശംസകൾ. ടൂർണമെന്റിലെ നിങ്ങളുടെ അർപ്പണബോധവും സ്ഥിരതയും മിന്നും പ്രകടനങ്ങളും ഞങ്ങൾ ആഘോഷിക്കുന്നു.',
    wishHappyBirthday: 'ജന്മദിനാശംസകൾ നേരുക',
    wished: 'ആശംസകൾ നേർന്നു!',
    copyLink: 'ലിങ്ക് കോപ്പി ചെയ്യുക',
    copied: 'കോപ്പി ചെയ്തു!',
    whatsapp: 'വാട്ട്‌സ്ആപ്പ്',
    shareOnX: 'എക്സിൽ പങ്കിടുക',
    pressDispatch: 'ടൂർണമെന്റ് സ്പെഷ്യൽ ഫീച്ചർ // പ്രസ്സ് ഡിസ്പാച്ച്',
    chronicleTitle: 'ബർത്ത്ഡേ ക്രോണിക്കിൾ: സ്നേഹത്തോടും തമാശയോടും',
    aiGenerated: 'എഐ സ്പോർട്സ് ഡെസ്ക്',
    editorialDesk: 'ലീഗ് സ്പോർട്സ് ഡെസ്ക്',
    regenerateStory: 'പുതിയ ഫീച്ചർ എഴുതുക',
    draftingStory: 'തയ്യാറാക്കുന്നു...',
    communityRoast: 'സൗഹൃദ ട്രോളും നിരീക്ഷണങ്ങളും',
    tacticalDispatch: 'ടാക്റ്റിക്കൽ സ്കൗട്ടിംഗ് വിശകലനം',
    franchiseNotes: 'ടീമംഗങ്ങളുടെ വക കുറിപ്പുകൾ',
    officialSalute: 'എസ്എസ് ലീഗ് മാനേജ്‌മെന്റിന്റെ ഔദ്യോഗിക സല്യൂട്ട്',
    performanceRecord: 'കരിയർ റെക്കോർഡുകൾ',
    tournamentMetrics: 'ടൂർണമെന്റ് സ്ഥിതിവിവരക്കണക്കുകൾ',
    seasonsCount: 'സീസണുകൾ',
    matches: 'മത്സരങ്ങൾ',
    totalPlayed: 'ആകെ കളിച്ചത്',
    goals: 'ഗോളുകൾ',
    perMatch: '/ മത്സരം',
    wins: 'വിജയങ്ങൾ',
    winRate: 'വിജയ ശതമാനം',
    cleanSheets: 'ക്ലീൻ ഷീറ്റുകൾ',
    shutouts: 'ഷട്ട്ഔട്ടുകൾ',
    motm: 'മാൻ ഓഫ് ദി മാച്ച്',
    awards: 'പുരസ്കാരങ്ങൾ',
    points: 'പോയിന്റുകൾ',
    careerPts: 'ആകെ പോയിന്റുകൾ',
    historyBySeason: 'സീസൺ തിരിച്ചുള്ള ടൂർണമെന്റ് ചരിത്രം',
    colSeason: 'സീസൺ',
    colTeam: 'ടീം',
    colCat: 'കാറ്റഗറി / സ്റ്റാർ',
    colMatches: 'മത്സരങ്ങൾ',
    colGoals: 'ഗോളുകൾ',
    colWins: 'വിജയങ്ങൾ',
    colPoints: 'പോയിന്റുകൾ',
    honorsTitle: 'പുരസ്കാരങ്ങളും നേട്ടങ്ങളും',
    potd: 'പ്ലെയർ ഓഫ് ദി ഡേ',
    potw: 'പ്ലെയർ ഓഫ് ദി വീക്ക്',
    viewInstagram: 'ഇൻസ്റ്റാഗ്രാം പോസ്റ്റ് കാണുക',
    returnHome: 'ഹോം പേജിലേക്ക് മടങ്ങുക',
    whatsappShareText: (name: string, age: number, url: string) =>
      age
        ? `നമ്മുടെ സ്വന്തം *${name}*ന് ഹൃദയം നിറഞ്ഞ ജന്മദിനാശംസകൾ (${age} വയസ്സ്)! ആശംസകൾ അറിയിക്കാനും SS League റെക്കോർഡുകൾ കാണാനും സന്ദർശിക്കുക:\n${url}`
        : `നമ്മുടെ സ്വന്തം *${name}*ന് ഹൃദയം നിറഞ്ഞ ജന്മദിനാശംസകൾ! ആശംസകൾ അറിയിക്കാനും SS League റെക്കോർഡുകൾ കാണാനും സന്ദർശിക്കുക:\n${url}`,
    twitterShareText: (name: string, age: number) =>
      age
        ? `നമ്മുടെ സ്വന്തം ${name}ന് ഹൃദയം നിറഞ്ഞ ജന്മദിനാശംസകൾ (${age} വയസ്സ്)! SS League ടൂർണമെന്റ് റെക്കോർഡ്:`
        : `നമ്മുടെ സ്വന്തം ${name}ന് ഹൃദയം നിറഞ്ഞ ജന്മദിനാശംസകൾ! SS League ടൂർണമെന്റ് റെക്കോർഡ്:`,
  },
};

export default function BirthdayClient({ initialData }: { initialData: BirthdayData }) {
  const { player, stats, seasons, awards } = initialData;

  const [lang, setLang] = useState<'en' | 'ml'>(initialData.initialLang || 'en');
  const [storyEn, setStoryEn] = useState<StoryContent>(initialData.storyEn || initialData.story);
  const [storyMl, setStoryMl] = useState<StoryContent | undefined>(initialData.storyMl);
  const [story, setStory] = useState<StoryContent>(initialData.story);

  const [copied, setCopied] = useState(false);
  const [showConfetti, setShowConfetti] = useState(true);
  const [isGeneratingStory, setIsGeneratingStory] = useState(false);
  const [wishCount, setWishCount] = useState(1);
  const [hasWished, setHasWished] = useState(false);

  const t = translations[lang];

  const winRate = stats.matches > 0 ? Math.round((stats.wins / stats.matches) * 100) : 0;
  const goalsPerMatch = stats.matches > 0 ? (stats.goals / stats.matches).toFixed(2) : '0.00';

  // Synchronize language from URL if present
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const urlLang = urlParams.get('lang');
      if (urlLang === 'ml' || urlLang === 'en') {
        if (urlLang !== lang) {
          handleLanguageChange(urlLang as 'en' | 'ml');
        }
      }
    }
  }, []);

  const handleLanguageChange = async (newLang: 'en' | 'ml') => {
    setLang(newLang);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', newLang);
      window.history.replaceState({}, '', url.toString());
    }

    if (newLang === 'ml') {
      if (storyMl) {
        setStory(storyMl);
      } else {
        await handleRegenerateStory('ml');
      }
    } else {
      if (storyEn) {
        setStory(storyEn);
      } else {
        await handleRegenerateStory('en');
      }
    }
  };

  const getShareUrl = () => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('lang', lang);
      return url.toString();
    }
    return '';
  };

  const handleCopyLink = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(getShareUrl());
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    }
  };

  const handleShareWhatsApp = () => {
    if (typeof window !== 'undefined') {
      const text = encodeURIComponent(t.whatsappShareText(player.name, player.age, getShareUrl()));
      window.open(`https://api.whatsapp.com/send?text=${text}`, '_blank');
    }
  };

  const handleShareTwitter = () => {
    if (typeof window !== 'undefined') {
      const text = encodeURIComponent(t.twitterShareText(player.name, player.age));
      window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(getShareUrl())}`, '_blank');
    }
  };

  const handleSendWish = () => {
    setWishCount((prev) => prev + 1);
    setHasWished(true);
    setShowConfetti(false);
    setTimeout(() => setShowConfetti(true), 50);
  };

  const handleRegenerateStory = async (targetLang: 'en' | 'ml' = lang) => {
    try {
      setIsGeneratingStory(true);
      const res = await fetch(`/api/birthdays/${player.id}/story`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lang: targetLang }),
      });
      const data = await res.json();
      if (data.success && data.story) {
        setStory(data.story);
        if (targetLang === 'ml') {
          setStoryMl(data.story);
        } else {
          setStoryEn(data.story);
        }
        setShowConfetti(false);
        setTimeout(() => setShowConfetti(true), 50);
      }
    } catch (err) {
      console.error('Failed to regenerate birthday story:', err);
    } finally {
      setIsGeneratingStory(false);
    }
  };

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-24 sm:pt-32 lg:pt-36 pb-12 px-4 sm:px-6">
      {/* Gentle celebratory particle effect */}
      {showConfetti && <ConfettiEffect duration={3500} />}

      {/* Decorative ambient gold glow overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none" />

      <div className="max-w-5xl mx-auto relative z-10 space-y-6">
        {/* Navigation & Status Header with Language Switcher */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-4 sm:p-5 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2 rounded-xl text-xs font-bold transition-all shadow-sm font-mono"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {t.backToHome}
          </Link>

          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            {/* Language Switcher Pill */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200">
              <Languages className="h-3.5 w-3.5 text-slate-400 ml-1.5 hidden sm:inline" />
              <button
                type="button"
                onClick={() => handleLanguageChange('en')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  lang === 'en'
                    ? 'bg-white text-slate-950 shadow-sm font-black'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => handleLanguageChange('ml')}
                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                  lang === 'ml'
                    ? 'bg-[#D4AF37] text-slate-950 shadow-sm font-black'
                    : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                മലയാളം
              </button>
            </div>

            <span className="bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1 rounded-xl font-bold hidden md:inline">
              {t.playerId}: {player.player_id || player.id}
            </span>
            <span className="bg-[#D4AF37]/10 border border-[#D4AF37]/20 text-amber-700 px-3 py-1 rounded-xl font-bold">
              {t.birthdayEdition}
            </span>
          </div>
        </div>

        {/* HERO SECTION: Player Spotlight Card */}
        <section className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-10 shadow-sm relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-center gap-6 sm:gap-10 relative z-10">
            {/* Player Avatar */}
            <div className="relative shrink-0">
              <div className="h-32 w-32 sm:h-40 sm:w-40 rounded-2xl border-2 border-slate-200/90 ring-2 ring-[#D4AF37]/30 p-1 bg-white shadow-md overflow-hidden">
                <div className="relative h-full w-full rounded-xl overflow-hidden bg-slate-100">
                  <Image
                    src={player.photo_url || '/placeholder-player.png'}
                    alt={player.name}
                    fill
                    sizes="(max-width: 640px) 128px, 160px"
                    priority
                    className="object-cover"
                  />
                </div>
              </div>

              {/* Age Milestone Badge */}
              <div className="absolute -bottom-2 -right-2 flex h-8 px-2.5 items-center justify-center rounded-lg bg-slate-950 text-[#D4AF37] font-mono text-xs font-bold border border-slate-800 shadow-md">
                {player.age ? `${player.age} ${t.years}` : t.playerRole}
              </div>
            </div>

            {/* Player Greeting & Details */}
            <div className="flex-1 text-center md:text-left">
              <div className="inline-flex items-center gap-1.5 px-3 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-800 text-[10px] font-mono font-bold uppercase tracking-wider mb-2.5">
                <CircleDot className="w-2.5 h-2.5 text-[#D4AF37] animate-pulse" />
                {t.spotlightBadge}
              </div>

              <h1 className="text-3xl sm:text-5xl font-black text-slate-950 tracking-tight uppercase leading-none">
                {player.name}
              </h1>

              {player.display_name && player.display_name !== player.name && (
                <p className="text-xs font-mono font-bold text-slate-500 mt-1 uppercase">
                  {t.aka} {player.display_name}
                </p>
              )}

              <div className="mt-3.5 flex flex-wrap items-center justify-center md:justify-start gap-2">
                <span className="border border-slate-200 bg-slate-50 px-3 py-1 rounded-xl text-xs font-mono font-bold text-slate-700">
                  {t.team}: <strong className="text-slate-900">{player.team === 'Unknown' || !player.team ? 'FREE AGENT' : player.team}</strong>
                </span>
                {player.category && player.category.includes('★') ? (
                  <span className="inline-flex items-center gap-1 border border-amber-200 bg-amber-50 px-3 py-1 rounded-xl text-xs font-mono font-bold text-amber-800">
                    <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
                    <span>STAR: {player.category}</span>
                  </span>
                ) : (
                  <span className={`border px-3 py-1 rounded-xl text-xs font-mono font-bold ${getCategoryColor(player.category)}`}>
                    {t.cat}: {player.category === 'A' ? 'NA' : (player.category || 'NA')}
                  </span>
                )}
                {player.dob && (
                  <span className="flex items-center gap-1 border border-slate-200 bg-slate-50 px-3 py-1 rounded-xl text-xs font-mono text-slate-600">
                    <Calendar className="h-3 w-3 text-[#D4AF37]" />
                    {player.dob}
                  </span>
                )}
              </div>

              <p className="mt-3.5 text-xs sm:text-sm text-slate-600 font-mono leading-relaxed max-w-2xl">
                {t.greeting}
              </p>

              {/* Action Buttons: Wish & Share */}
              <div className="mt-6 flex flex-wrap items-center justify-center md:justify-start gap-2.5">
                <button
                  onClick={handleSendWish}
                  className="inline-flex items-center gap-2 bg-slate-950 hover:bg-slate-900 text-white px-5 py-2.5 rounded-xl text-xs font-mono font-bold shadow-md transition-all hover:scale-105 border border-slate-950"
                >
                  <Heart className={`h-3.5 w-3.5 ${hasWished ? 'fill-current text-rose-400' : 'text-[#D4AF37]'}`} />
                  <span>{hasWished ? t.wished : t.wishHappyBirthday}</span>
                  <span className="rounded bg-white/20 px-1.5 py-0.2 text-[10px]">
                    {wishCount}
                  </span>
                </button>

                <button
                  onClick={handleCopyLink}
                  className="inline-flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition-all shadow-sm"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5 text-slate-400" />}
                  <span>{copied ? t.copied : t.copyLink}</span>
                </button>

                <button
                  onClick={handleShareWhatsApp}
                  className="inline-flex items-center gap-1.5 border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-emerald-800 px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition-all shadow-sm"
                >
                  <MessageCircle className="h-3.5 w-3.5 text-emerald-600" />
                  <span>{t.whatsapp}</span>
                </button>

                <button
                  onClick={handleShareTwitter}
                  className="inline-flex items-center gap-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-4 py-2.5 rounded-xl text-xs font-mono font-bold transition-all shadow-sm"
                >
                  <Share2 className="h-3.5 w-3.5 text-slate-600" />
                  <span>{t.shareOnX}</span>
                </button>
              </div>
            </div>
          </div>

          {/* Decorative console chevron line */}
          <div className="absolute bottom-0 left-0 right-0 h-[4px] bg-[repeating-linear-gradient(90deg,rgba(0,0,0,0.06)_0px,rgba(0,0,0,0.06)_1px,transparent_1px,transparent_12px)] opacity-50" />
        </section>

        {/* SECTION: The Birthday Chronicle */}
        <section className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="border-b border-slate-100 pb-4">
            <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider font-mono">
              {t.pressDispatch}
            </span>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-0.5">
              {t.chronicleTitle}
            </h2>
          </div>

          <article className="mt-5 space-y-4">
            {/* Headline */}
            <div>
              <h3 className="text-lg sm:text-2xl font-black text-slate-950 tracking-tight leading-snug">
                {story.headline}
              </h3>
              {story.subtitle && (
                <p className="mt-1 text-xs sm:text-sm font-mono text-slate-500 italic">
                  "{story.subtitle}"
                </p>
              )}
            </div>

            {/* Roast Box */}
            <div className="rounded-xl border border-amber-200/70 bg-amber-50/40 p-4 text-xs sm:text-sm text-slate-800 leading-relaxed font-mono">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-1.5">
                <Target className="h-3 w-3 text-amber-600" />
                {t.communityRoast}
              </div>
              <p>{story.roastParagraph}</p>
            </div>

            {/* Tactical Report */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-xs sm:text-sm text-slate-800 leading-relaxed font-mono">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                <Trophy className="h-3 w-3 text-[#D4AF37]" />
                {t.tacticalDispatch}
              </div>
              <p>{story.tacticalReport}</p>
            </div>

            {/* Locker Room Rumor */}
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-4 text-xs sm:text-sm text-slate-800 leading-relaxed font-mono">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-600 mb-1.5">
                <Users className="h-3 w-3 text-slate-600" />
                {t.franchiseNotes}
              </div>
              <p>{story.lockerRoomRumor}</p>
            </div>

            {/* League Birthday Salute */}
            <div className="rounded-xl border border-[#D4AF37]/30 bg-[#D4AF37]/10 p-4 text-xs sm:text-sm text-amber-950 leading-relaxed font-mono font-medium">
              <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-amber-800 mb-1.5">
                <Swords className="h-3 w-3 text-[#D4AF37]" />
                {t.officialSalute}
              </div>
              <p>{story.birthdayWish}</p>
            </div>
          </article>
        </section>

        {/* SECTION: Career Stats Metrics */}
        <section className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm">
          <div className="mb-5 flex items-center justify-between">
            <div>
              <span className="text-[10px] text-amber-700 font-bold uppercase tracking-wider font-mono">
                {t.performanceRecord}
              </span>
              <h2 className="text-xl sm:text-2xl font-black text-slate-950 tracking-tight mt-0.5">
                {t.tournamentMetrics}
              </h2>
            </div>
            <span className="text-xs font-mono font-bold bg-slate-100 border border-slate-200 text-slate-600 px-3 py-1 rounded-xl">
              {seasons.length} {t.seasonsCount}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-center">
              <span className="block text-[10px] font-mono font-bold text-slate-500 uppercase">{t.matches}</span>
              <span className="mt-1 block text-2xl sm:text-3xl font-black text-slate-900">
                {stats.matches}
              </span>
              <span className="text-[10px] font-mono text-slate-400">{t.totalPlayed}</span>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-center">
              <span className="block text-[10px] font-mono font-bold text-slate-500 uppercase">{t.goals}</span>
              <span className="mt-1 block text-2xl sm:text-3xl font-black text-amber-700">
                {stats.goals}
              </span>
              <span className="text-[10px] font-mono text-slate-400">{goalsPerMatch} {t.perMatch}</span>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-center">
              <span className="block text-[10px] font-mono font-bold text-slate-500 uppercase">{t.wins}</span>
              <span className="mt-1 block text-2xl sm:text-3xl font-black text-emerald-600">
                {stats.wins}
              </span>
              <span className="text-[10px] font-mono text-slate-400">{winRate}% {t.winRate}</span>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-center">
              <span className="block text-[10px] font-mono font-bold text-slate-500 uppercase">{t.cleanSheets}</span>
              <span className="mt-1 block text-2xl sm:text-3xl font-black text-sky-600">
                {stats.clean_sheets}
              </span>
              <span className="text-[10px] font-mono text-slate-400">{t.shutouts}</span>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-center">
              <span className="block text-[10px] font-mono font-bold text-slate-500 uppercase">{t.motm}</span>
              <span className="mt-1 block text-2xl sm:text-3xl font-black text-[#D4AF37]">
                {stats.motm_awards}
              </span>
              <span className="text-[10px] font-mono text-slate-400">{t.awards}</span>
            </div>

            <div className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 text-center">
              <span className="block text-[10px] font-mono font-bold text-slate-500 uppercase">{t.points}</span>
              <span className="mt-1 block text-2xl sm:text-3xl font-black text-slate-900">
                {stats.points}
              </span>
              <span className="text-[10px] font-mono text-slate-400">{t.careerPts}</span>
            </div>
          </div>
        </section>

        {/* SECTION: Season-by-Season Journey */}
        {seasons.length > 0 && (
          <section className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm">
            <h2 className="text-xl font-black text-slate-900 tracking-tight mb-4 flex items-center gap-2">
              <Calendar className="h-5 w-5 text-[#D4AF37]" />
              {t.historyBySeason}
            </h2>

            {/* Desktop Table View (hidden on mobile) */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="pb-2.5 font-bold uppercase">{t.colSeason}</th>
                    <th className="pb-2.5 font-bold uppercase">{t.colTeam}</th>
                    <th className="pb-2.5 font-bold uppercase">{t.colCat}</th>
                    <th className="pb-2.5 font-bold uppercase text-center">{t.colMatches}</th>
                    <th className="pb-2.5 font-bold uppercase text-center">{t.colGoals}</th>
                    <th className="pb-2.5 font-bold uppercase text-center">{t.colWins}</th>
                    <th className="pb-2.5 font-bold uppercase text-center">{t.colPoints}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {seasons.map((s, idx) => (
                    <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-2.5 font-bold text-amber-700">{s.season_id}</td>
                      <td className="py-2.5 font-semibold text-slate-900">
                        {s.team === 'Unknown' || !s.team ? 'FREE AGENT' : s.team}
                      </td>
                      <td className="py-2.5">
                        {s.star_rating ? (
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border bg-amber-50 text-amber-800 border-amber-200 shadow-2xs font-mono">
                              <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                              <span>{s.star_rating}★</span>
                            </span>
                            <span className="hidden xl:inline-flex items-center gap-0.5">
                              {[...Array(Math.min(s.star_rating, 10))].map((_, i) => (
                                <Star key={i} className="w-3 h-3 text-amber-400 fill-amber-400" />
                              ))}
                            </span>
                          </div>
                        ) : (
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${getCategoryColor(s.category)}`}>
                            {s.category === 'A' ? 'NA' : (s.category || 'NA')}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-center text-slate-600">{s.matches}</td>
                      <td className="py-2.5 text-center font-bold text-slate-900">{s.goals}</td>
                      <td className="py-2.5 text-center text-emerald-600 font-bold">{s.wins}</td>
                      <td className="py-2.5 text-center font-bold text-[#D4AF37]">{s.points}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card View (shown only on small devices) */}
            <div className="sm:hidden space-y-2.5">
              {seasons.map((s, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5 space-y-2.5 font-mono"
                >
                  {/* Top Row: Season Badge, Team Name, and Category */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-[11px] font-black text-amber-800 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 shrink-0">
                        {s.season_id}
                      </span>
                      <span className="text-xs font-bold text-slate-900 truncate">
                        {s.team === 'Unknown' || !s.team ? 'FREE AGENT' : s.team}
                      </span>
                    </div>
                    {s.star_rating ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border bg-amber-50 text-amber-800 border-amber-200 shrink-0 font-mono">
                        <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                        <span>{s.star_rating}★</span>
                      </span>
                    ) : (
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border shrink-0 ${getCategoryColor(s.category)}`}>
                        {s.category === 'A' ? 'NA' : (s.category || 'NA')}
                      </span>
                    )}
                  </div>

                  {/* Bottom Row: 4 Metric Badges */}
                  <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-slate-200/60 text-center">
                    <div className="bg-white rounded-lg p-1.5 border border-slate-200/70 shadow-2xs">
                      <span className="block text-[8px] uppercase text-slate-400 font-bold tracking-tight">{t.colMatches}</span>
                      <span className="text-xs font-bold text-slate-800">{s.matches}</span>
                    </div>
                    <div className="bg-white rounded-lg p-1.5 border border-slate-200/70 shadow-2xs">
                      <span className="block text-[8px] uppercase text-slate-400 font-bold tracking-tight">{t.colGoals}</span>
                      <span className="text-xs font-black text-amber-700">{s.goals}</span>
                    </div>
                    <div className="bg-white rounded-lg p-1.5 border border-slate-200/70 shadow-2xs">
                      <span className="block text-[8px] uppercase text-slate-400 font-bold tracking-tight">{t.colWins}</span>
                      <span className="text-xs font-black text-emerald-600">{s.wins}</span>
                    </div>
                    <div className="bg-white rounded-lg p-1.5 border border-slate-200/70 shadow-2xs">
                      <span className="block text-[8px] uppercase text-slate-400 font-bold tracking-tight">{t.colPoints}</span>
                      <span className="text-xs font-black text-[#D4AF37]">{s.points}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SECTION: Honors & Awards */}
        {awards.length > 0 && (
          <section className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm">
            <h2 className="text-xl font-black text-slate-900 tracking-tight mb-4 flex items-center gap-2">
              <Trophy className="h-5 w-5 text-[#D4AF37]" />
              {t.honorsTitle} ({awards.length})
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {awards.map((award, i) => (
                <div
                  key={i}
                  className="flex items-start gap-3 rounded-xl border border-slate-200/80 bg-slate-50/60 p-3.5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 border border-amber-500/20 text-[#D4AF37]">
                    <Award className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0 font-mono">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-800 uppercase">
                        {award.award_type === 'POTD' ? t.potd : award.award_type === 'POTW' ? t.potw : award.award_type}
                      </span>
                      <span className="text-[10px] text-slate-400">• {award.season_id}</span>
                    </div>
                    <p className="text-xs font-bold text-slate-800 truncate mt-0.5">
                      {award.team_name || player.team}
                    </p>
                    {award.performance_stats && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        {award.performance_stats.goals ? `${award.performance_stats.goals} ${t.goals}` : ''}
                        {award.performance_stats.matchup ? ` • ${award.performance_stats.matchup}` : ''}
                      </p>
                    )}
                    {award.instagram_post_url && (
                      <a
                        href={award.instagram_post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-pink-600 hover:text-pink-500"
                      >
                        <span>{t.viewInstagram}</span>
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Footer Back Button */}
        <div className="text-center pt-4">
          <Link
            href="/"
            className="inline-flex items-center gap-2 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 px-6 py-3 rounded-xl text-xs font-bold transition-all shadow-sm font-mono"
          >
            <ChevronLeft className="h-4 w-4" />
            <span>{t.returnHome}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
