'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { useLanguage } from '@/contexts/LanguageContext'
import NewsReactions from '@/components/NewsReactions'
import { Activity, Calendar, ChevronLeft, Clock, DollarSign, Gamepad2, Megaphone, Send, Shield, Target, Trophy, Users } from 'lucide-react'

interface NewsItem {
  id: string
  title?: string // Legacy
  title_en?: string
  title_ml?: string
  content?: string // Legacy
  content_en?: string
  content_ml?: string
  summary?: string // Legacy
  summary_en?: string
  summary_ml?: string
  reporter_en?: string
  reporter_ml?: string
  category: string
  event_type: string
  season_id?: string
  season_name?: string
  created_at: string
  published_at?: string
  generated_by: 'ai' | 'admin'
  image_url?: string
  tone?: string
  language?: string
}

const CATEGORY_COLORS: Record<string, string> = {
  registration: 'bg-purple-50 border-purple-200 text-purple-700',
  team: 'bg-blue-50 border-blue-200 text-blue-700',
  auction: 'bg-amber-50 border-amber-200 text-amber-700',
  fantasy: 'bg-emerald-50 border-emerald-250 text-emerald-750',
  match: 'bg-rose-50 border-rose-200 text-rose-700',
  announcement: 'bg-slate-50 border-slate-200 text-slate-700',
  milestone: 'bg-amber-100 border-amber-300 text-amber-900',
}

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  registration: <Users className="w-3.5 h-3.5 text-purple-650" />,
  team: <Trophy className="w-3.5 h-3.5 text-amber-550 fill-amber-550" />,
  auction: <DollarSign className="w-3.5 h-3.5 text-emerald-550" />,
  fantasy: <Gamepad2 className="w-3.5 h-3.5 text-indigo-505" />,
  match: <Activity className="w-3.5 h-3.5 text-rose-500" />,
  announcement: <Megaphone className="w-3.5 h-3.5 text-blue-500" />,
  milestone: <Target className="w-3.5 h-3.5 text-rose-500" />,
}

export default function NewsArticlePage() {
  const params = useParams()
  const id = params?.id as string
  const { language, setLanguage } = useLanguage()

  const [news, setNews] = useState<NewsItem | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Helper to get localized text
  const getLocalizedText = (field: 'title' | 'content' | 'summary' | 'reporter'): string => {
    if (!news) return ''
    
    if (language === 'ml') {
      const mlField = `${field}_ml` as keyof NewsItem
      if (news[mlField]) return news[mlField] as string
    }
    
    const enField = `${field}_en` as keyof NewsItem
    return (news[enField] || news[field] || '') as string
  }

  useEffect(() => {
    if (id) {
      fetchNewsItem()
    }
  }, [id])

  // Update meta tags dynamically for social sharing
  useEffect(() => {
    if (!news) return

    const title = getLocalizedText('title')
    const description = getLocalizedText('summary') || getLocalizedText('content').substring(0, 160)
    const imageUrl = news.image_url || ''
    const url = window.location.href

    // Update document title
    document.title = `${title} | SS Super League`

    // Update or create meta tags
    const updateMetaTag = (property: string, content: string, isProperty = true) => {
      const attribute = isProperty ? 'property' : 'name'
      let tag = document.querySelector(`meta[${attribute}="${property}"]`)
      if (!tag) {
        tag = document.createElement('meta')
        tag.setAttribute(attribute, property)
        document.head.appendChild(tag)
      }
      tag.setAttribute('content', content)
    }

    // Standard meta tags
    updateMetaTag('description', description, false)

    // Open Graph tags
    updateMetaTag('og:type', 'article')
    updateMetaTag('og:url', url)
    updateMetaTag('og:title', title)
    updateMetaTag('og:description', description)
    updateMetaTag('og:site_name', 'SS Super League')
    
    if (imageUrl) {
      updateMetaTag('og:image', imageUrl)
      updateMetaTag('og:image:secure_url', imageUrl)
      updateMetaTag('og:image:width', '1200')
      updateMetaTag('og:image:height', '630')
      updateMetaTag('og:image:alt', title)
    }

    // Twitter Card tags
    updateMetaTag('twitter:card', 'summary_large_image', false)
    updateMetaTag('twitter:url', url, false)
    updateMetaTag('twitter:title', title, false)
    updateMetaTag('twitter:description', description, false)
    if (imageUrl) {
      updateMetaTag('twitter:image', imageUrl, false)
    }
  }, [news, language])

  const fetchNewsItem = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`/api/news?include_drafts=false&limit=100`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch news')
      }

      const data = await response.json()
      const item = data.news?.find((n: NewsItem) => n.id === id)

      if (!item) {
        setError('News article not found')
      } else {
        setNews(item)
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load news')
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat('en-IN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata',
    }).format(date)
  }

  const handleShare = () => {
    if (!news) return

    const title = getLocalizedText('title')
    const summary = getLocalizedText('summary')
    const content = getLocalizedText('content')
    const currentUrl = window.location.href
    const shareText = `*${title}*\n\n${summary || content.slice(0, 200) + '...'}\n\nRead more: ${currentUrl}`
    
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareText)}`
    window.open(whatsappUrl, '_blank')
  }

  if (loading) {
    return (
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="text-slate-500 font-mono text-xs">Loading Article...</p>
        </div>
      </div>
    )
  }

  if (error || !news) {
    return (
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm max-w-md mx-4 space-y-4">
          <Shield className="w-12 h-12 text-rose-500 mx-auto" />
          <h3 className="text-xl font-bold text-slate-900">Article Error</h3>
          <p className="text-sm text-slate-500 font-mono">{error || 'Article not found.'}</p>
          <Link
            href="/news"
            className="inline-flex items-center px-5 py-2.5 rounded-xl bg-slate-800 text-white font-mono font-bold text-xs hover:bg-slate-700 transition-colors"
          >
            BACK TO NEWSROOM
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-4xl mx-auto relative z-10 space-y-6">
        
        {/* Navigation Back */}
        <Link
          href="/news"
          className="inline-flex items-center text-xs font-mono font-bold text-slate-500 hover:text-amber-600 transition-colors"
        >
          {"<-"} BACK_TO_NEWSROOM
        </Link>

        {/* Action Panel: Language & Share */}
        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 bg-white border border-slate-200/60 rounded-2xl p-4 shadow-sm">
          {/* Language Selection */}
          <div className="flex bg-slate-100 border border-slate-200/60 p-1 rounded-xl gap-1 font-mono self-start sm:self-auto">
            <button
              onClick={() => setLanguage('en')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                language === 'en'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-650 hover:text-amber-600'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('ml')}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                language === 'ml'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-650 hover:text-amber-600'
              }`}
            >
              ML
            </button>
          </div>

          {/* WhatsApp share */}
          <button
            onClick={handleShare}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-mono font-bold text-xs shadow-sm transition-all cursor-pointer uppercase tracking-wider"
          >
            <Send className="w-3.5 h-3.5" /> SHARE_ON_WHATSAPP
          </button>
        </div>

        {/* Article Layout */}
        <article className="bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm">
          {/* Featured Image */}
          {news.image_url && (
            <div className="w-full h-64 sm:h-96 overflow-hidden bg-slate-50 border-b border-slate-100 relative">
              <img
                src={news.image_url}
                alt={getLocalizedText('title')}
                className="w-full h-full object-cover"
                loading="eager"
              />
            </div>
          )}

          <div className="p-6 sm:p-8 lg:p-12 space-y-6">
            
            {/* Metadata bar */}
            <div className="flex flex-wrap items-center gap-4 border-b border-slate-100 pb-5">
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider border ${CATEGORY_COLORS[news.category] || 'bg-slate-50 text-slate-800'}`}>
                <span className="text-[10px]">{CATEGORY_ICONS[news.category]}</span>
                {news.category}
              </span>
              
              <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-slate-400 uppercase">
                <Clock className="w-3.5 h-3.5" />
                <span>{formatDate(news.published_at || news.created_at)}</span>
              </div>
              
              {getLocalizedText('reporter') && (
                <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-slate-400 uppercase sm:ml-auto">
                  <span>REPORTED_BY:</span>
                  <span className="text-slate-600 font-extrabold">{getLocalizedText('reporter')}</span>
                  {news.tone && <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-bold">{news.tone}</span>}
                </div>
              )}
            </div>

            {/* Title */}
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-slate-900 leading-tight tracking-tight">
              {getLocalizedText('title')}
            </h1>

            {/* Summary Banner */}
            {getLocalizedText('summary') && (
              <div className="p-4 sm:p-6 bg-slate-50 border border-slate-200/60 rounded-xl border-l-4 border-l-amber-500 text-slate-700 font-medium leading-relaxed italic text-sm sm:text-base">
                {getLocalizedText('summary')}
              </div>
            )}

            {/* Content Body */}
            <div className="prose prose-slate max-w-none prose-sm sm:prose-base leading-relaxed text-slate-800 whitespace-pre-line font-sans border-b border-slate-100 pb-8">
              {getLocalizedText('content')}
            </div>

            {/* Reactions widget */}
            <div className="pt-2">
              <NewsReactions newsId={news.id} />
            </div>

            {/* Season Footer Tag */}
            {news.season_name && (
              <div className="pt-6 border-t border-slate-100">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl">
                  <Calendar className="w-3.5 h-3.5 text-slate-400 inline" />
                  <span className="text-[10px] font-mono font-bold text-slate-900 uppercase">
                    Season: {news.season_name}
                  </span>
                </div>
              </div>
            )}
          </div>
        </article>

        {/* View more back indicator */}
        <div className="text-center pt-4">
          <Link
            href="/news"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl font-mono font-bold text-xs shadow-sm transition-all"
          >
            {"<-"} RETURN TO ALL NEWS
          </Link>
        </div>
      </div>
    </div>
  )
}
