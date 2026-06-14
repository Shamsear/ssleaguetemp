import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
}

// 1. eCoin Icon: A beautiful blue coin with a Euro symbol
export const ECoinIcon = ({ className = "w-4 h-4", ...props }: IconProps) => (
  <svg 
    className={`${className} inline-block mr-1 align-text-bottom`} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="12" r="10" className="text-blue-600 fill-blue-100/50" />
    <path d="M14 9.4a3 3 0 0 0-3 2.6 3 3 0 0 0 3 2.6" className="text-blue-700" strokeWidth="2.5" />
    <path d="M8 11h4" className="text-blue-700" strokeWidth="2.5" />
    <path d="M8 13h4" className="text-blue-700" strokeWidth="2.5" />
  </svg>
);

// 2. SSCoin Icon: A beautiful purple coin with a Dollar/SS symbol
export const SSCoinIcon = ({ className = "w-4 h-4", ...props }: IconProps) => (
  <svg 
    className={`${className} inline-block mr-1 align-text-bottom`} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="12" r="10" className="text-purple-600 fill-purple-100/50" />
    <path d="M12 7v10" className="text-purple-700" strokeWidth="2.2" />
    <path d="M15 9.5a2.5 2.5 0 0 0-5 0v1a2.5 2.5 0 0 0 5 0v1a2.5 2.5 0 0 1-5 0" className="text-purple-700" strokeWidth="2.2" />
  </svg>
);

// 3. Soccer Ball Icon: A high-fidelity modern vector soccer ball
export const SoccerBallIcon = ({ className = "w-4 h-4", ...props }: IconProps) => (
  <svg 
    className={`${className} inline-block mr-1 align-text-bottom text-slate-700`} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="1.5"
    {...props}
  >
    <circle cx="12" cy="12" r="10" />
    <polygon points="12,7.5 16,10.5 14.5,15 9.5,15 8,10.5" fill="currentColor" fillOpacity="0.2" />
    <line x1="12" y1="2" x2="12" y2="7.5" />
    <line x1="2.2" y1="9" x2="8" y2="10.5" />
    <line x1="5.8" y1="20" x2="9.5" y2="15" />
    <line x1="18.2" y1="20" x2="14.5" y2="15" />
    <line x1="21.8" y1="9" x2="16" y2="10.5" />
  </svg>
);

// 4. Goalkeeper Glove Icon: A beautiful goalkeeper glove / hand shield
export const GloveIcon = ({ className = "w-4 h-4", ...props }: IconProps) => (
  <svg 
    className={`${className} inline-block mr-1 align-text-bottom`} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="12" r="10" className="text-emerald-600 fill-emerald-100/50" />
    <path d="M16.5 11.5V8.5a1.5 1.5 0 0 0-3-0v1.5" className="text-emerald-700" />
    <path d="M13.5 11V7.5a1.5 1.5 0 0 0-3-0v2.5" className="text-emerald-700" />
    <path d="M10.5 11V8a1.5 1.5 0 0 0-3-0v3" className="text-emerald-700" />
    <path d="M7.5 12V9.5a1.5 1.5 0 0 0-3-0v4.5" className="text-emerald-700" />
    <path d="M6 14.5c0 2.5 1.5 4.5 4.5 4.5h3c3 0 4.5-2 4.5-4.5V11a1 1 0 0 0-2 0v2.5" className="text-emerald-700" />
  </svg>
);

// 5. Crystal Ball Icon: A beautiful crystal ball for Predictions
export const CrystalBallIcon = ({ className = "w-4 h-4", ...props }: IconProps) => (
  <svg 
    className={`${className} inline-block mr-1 align-text-bottom`} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="10" r="8" className="text-indigo-600 fill-indigo-100/50" />
    <path d="M5 18a2 2 0 0 0-2 2h18a2 2 0 0 0-2-2H5z" className="text-indigo-700" />
    <path d="M12 18v2" className="text-indigo-700" />
  </svg>
);

// 6. Wildcard Icon: A beautiful wildcard card with a plus/star symbol
export const WildcardIcon = ({ className = "w-4 h-4", ...props }: IconProps) => (
  <svg 
    className={`${className} inline-block mr-1 align-text-bottom`} 
    viewBox="0 0 24 24" 
    fill="none" 
    stroke="currentColor" 
    strokeWidth="2" 
    strokeLinecap="round" 
    strokeLinejoin="round"
    {...props}
  >
    <rect x="5" y="3" width="14" height="18" rx="2" className="text-violet-650 fill-violet-100/50" />
    <path d="M12 8v8M8 12h8" className="text-violet-750" strokeWidth="2.2" />
  </svg>
);

// Dynamic Emoji to React Component Mapper
import { 
  Star, Trophy, Crown, Gem, Flame, Zap, Target, Sparkles, Medal, Award, 
  Gamepad2, Info, Lightbulb, Shield, Scale, LogOut, Gavel, UserCheck, Gift, 
  Dumbbell, BookOpen, Type, Globe, Users, Bot, Handshake, HeartCrack, TrendingUp, 
  TrendingDown, Calendar, BarChart2, ClipboardList, Search, Settings, Clock, 
  AlertCircle, Ban, Pencil, Save, Check, XCircle
} from 'lucide-react';

export const renderEmoji = (emoji: string | undefined | null, className: string = "w-4 h-4 inline-block align-text-bottom mr-1") => {
  if (!emoji) return null;
  const clean = emoji.trim();
  
  // Custom SVGs
  if (clean === '💶') return <ECoinIcon className={className} />;
  if (clean === '🪙') return <SSCoinIcon className={className} />;
  if (clean === '⚽') return <SoccerBallIcon className={className} />;
  if (clean === '🧤') return <GloveIcon className={className} />;
  if (clean === '🔮') return <CrystalBallIcon className={className} />;
  if (clean === '🃏') return <WildcardIcon className={className} />;
  
  // Lucide Icons
  if (clean === '🏆') return <Trophy className={`${className} text-amber-500`} />;
  if (clean === '⭐' || clean === '★') return <Star className={`${className} text-amber-400 fill-amber-400`} />;
  if (clean === '☆') return <Star className={`${className} text-slate-300`} />;
  if (clean === '👑') return <Crown className={`${className} text-amber-500 fill-amber-500`} />;
  if (clean === '💎') return <Gem className={`${className} text-blue-500`} />;
  if (clean === '🔥') return <Flame className={`${className} text-orange-500`} />;
  if (clean === '⚡') return <Zap className={`${className} text-yellow-500`} />;
  if (clean === '🎯') return <Target className={`${className} text-rose-500`} />;
  if (clean === '🌟' || clean === '💫' || clean === '✨') return <Sparkles className={`${className} text-amber-400`} />;
  if (clean === '🎖️' || clean === '🎖') return <Medal className={`${className} text-amber-500`} />;
  if (clean === '🏅') return <Award className={`${className} text-amber-550`} />;
  if (clean === '🔰') return <Award className={`${className} text-emerald-500`} />;
  if (clean === '🎮') return <Gamepad2 className={`${className} text-indigo-500`} />;
  if (clean === '🤝') return <Handshake className={`${className} text-emerald-500`} />;
  if (clean === '💔') return <HeartCrack className={`${className} text-rose-500`} />;
  if (clean === '📈') return <TrendingUp className={`${className} text-emerald-500`} />;
  if (clean === '📉') return <TrendingDown className={`${className} text-rose-550`} />;
  if (clean === '📅') return <Calendar className={`${className} text-slate-500`} />;
  if (clean === '📊') return <BarChart2 className={`${className} text-slate-500`} />;
  if (clean === '📋') return <ClipboardList className={`${className} text-slate-500`} />;
  if (clean === '⚙️' || clean === '⚙') return <Settings className={`${className} text-slate-500`} />;
  if (clean === '💡') return <Lightbulb className={`${className} text-amber-500`} />;
  if (clean === 'ℹ️' || clean === 'ℹ') return <Info className={`${className} text-blue-500`} />;
  if (clean === '⏳') return <Clock className={`${className} text-slate-550`} />;
  if (clean === '🚨') return <AlertCircle className={`${className} text-rose-500`} />;
  
  // Fallback for custom component strings
  if (clean.includes('<Star')) return <Star className={`${className} text-amber-400 fill-amber-400`} />;
  if (clean.includes('<Trophy') && clean.includes('text-slate-400')) return <Trophy className={`${className} text-slate-400 fill-slate-400`} />;
  if (clean.includes('<Trophy') && clean.includes('text-amber-700')) return <Trophy className={`${className} text-amber-750 fill-amber-750`} />;
  if (clean.includes('<Trophy')) return <Trophy className={`${className} text-amber-500 fill-amber-500`} />;
  if (clean.includes('<Crown')) return <Crown className={`${className} text-amber-500 fill-amber-500`} />;
  
  // If it's a standard text/emoji that wasn't matched, just render it as text
  return <span>{emoji}</span>;
};
