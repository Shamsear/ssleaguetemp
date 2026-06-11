'use client';

import React from 'react';
import Link from 'next/link';
import { useLanguage } from '@/contexts/LanguageContext';

interface NewsCardData {
  id: string;
  title_en?: string;
  title_ml?: string;
  title?: string; // Legacy support
  content_en?: string;
  content_ml?: string;
  content?: string; // Legacy support
  summary_en?: string;
  summary_ml?: string;
  summary?: string; // Legacy support
  category: string;
  event_type: string;
  image_url?: string;
  created_at: string;
  published_at?: string;
  is_published: boolean;
  reporter_en?: string;
  reporter_ml?: string;
  tone?: string;
}

interface NewsCardProps {
  news: NewsCardData;
  onClick?: () => void;
  showLink?: boolean;
  showImage?: boolean;
  compact?: boolean;
  className?: string;
}

export default function NewsCard({
  news,
  onClick,
  showLink = true,
  showImage = true,
  compact = false,
  className = '',
}: NewsCardProps) {
  const { language } = useLanguage();

  // Support both bilingual and legacy single-language content
  const title = language === 'en'
    ? (news.title_en || news.title || '')
    : (news.title_ml || news.title || '');
  
  const summary = language === 'en'
    ? (news.summary_en || news.summary || '')
    : (news.summary_ml || news.summary || '');
  
  const reporter = language === 'en'
    ? (news.reporter_en || 'Reporter')
    : (news.reporter_ml || 'റിപ്പോർട്ടർ');

  const getCategoryLabel = () => {
    const categoryMap: Record<string, { en: string; ml: string }> = {
      tournament: { en: 'Tournament', ml: 'ടൂർണമെന്റ്' },
      player: { en: 'Player', ml: 'കളിക്കാരൻ' },
      team: { en: 'Team', ml: 'ടീം' },
      match: { en: 'Match', ml: 'മാച്ച്' },
      season: { en: 'Season', ml: 'സീസൺ' },
      announcement: { en: 'Announcement', ml: 'അറിയിപ്പ്' },
      other: { en: 'News', ml: 'വാർത്ത' },
    };

    const cat = categoryMap[news.category] || categoryMap.other;
    return language === 'en' ? cat.en : cat.ml;
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString(language === 'en' ? 'en-US' : 'ml-IN', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const cardContent = (
    <article
      className={`console-card rounded-2xl bg-white border border-slate-200/60 shadow-sm transition-all duration-250 hover:border-amber-400/40 group flex flex-col h-full ${
        onClick ? 'cursor-pointer' : ''
      } ${className}`}
      onClick={onClick}
    >
      {/* Image */}
      {showImage && news.image_url && (
        <div className={`relative w-full ${compact ? 'h-40' : 'h-48'} bg-slate-50 overflow-hidden border-b border-slate-100`}>
          <img
            src={news.image_url}
            alt={title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            loading="lazy"
          />
        </div>
      )}

      {/* Content */}
      <div className={`flex-grow flex flex-col justify-between ${compact ? 'p-4' : 'p-5'}`}>
        <div className="space-y-2.5 mb-4">
          {/* Category Badge */}
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[8px] font-mono font-bold bg-amber-50 border border-amber-200 text-amber-700 uppercase tracking-wide">
              {getCategoryLabel()}
            </span>
            {news.tone && (
              <span className="text-[9px] font-mono text-slate-400 uppercase font-bold">{news.tone}</span>
            )}
          </div>

          {/* Title */}
          <h3 className={`font-extrabold text-slate-900 group-hover:text-amber-600 transition-colors leading-snug ${compact ? 'text-sm line-clamp-2' : 'text-base line-clamp-3'}`}>
            {title}
          </h3>

          {/* Summary */}
          {summary && !compact && (
            <p className="text-xs text-slate-505 line-clamp-3 leading-relaxed font-sans">{summary}</p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between text-[9px] font-mono text-slate-400 pt-3 border-t border-slate-100 uppercase font-bold">
          <div className="flex items-center gap-1">
            <span className="text-xs select-none">👤</span>
            <span>{reporter}</span>
          </div>
          
          {/* Date */}
          <time dateTime={news.published_at || news.created_at}>
            {formatDate(news.published_at || news.created_at)}
          </time>
        </div>
      </div>
    </article>
  );

  if (showLink) {
    return <Link href={`/news/${news.id}`} className="block h-full">{cardContent}</Link>;
  }

  return cardContent;
}
