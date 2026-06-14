'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { useLanguage } from '@/contexts/LanguageContext'
import NewsCard from '@/components/NewsCard'
import Link from 'next/link'
import { Activity, ArrowRight, Calendar, DollarSign, Gamepad2, Globe, Megaphone, Shield, Tag, Target, Trophy, Users } from 'lucide-react'

interface NewsItem {
  id: string
  title?: string
  title_en?: string
  title_ml?: string
  content?: string
  content_en?: string
  content_ml?: string
  summary?: string
  summary_en?: string
  summary_ml?: string
  category: string
  event_type: string
  season_id?: string
  season_name?: string
  created_at: string
  published_at?: string
  generated_by: 'ai' | 'admin'
  image_url?: string
}

const CATEGORY_COLORS: Record<string, string> = {
  registration: 'bg-purple-50 border-purple-200 text-purple-700',
  team: 'bg-blue-50 border-blue-200 text-blue-700',
  auction: 'bg-amber-50 border-amber-200 text-amber-700',
  fantasy: 'bg-emerald-50 border-emerald-250 text-emerald-750',
  match: 'bg-rose-55 border-rose-200 text-rose-700',
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

function NewsContent() {
  const searchParams = useSearchParams()
  const seasonFilter = searchParams?.get('season')
  const categoryFilter = searchParams?.get('category')
  const { language, setLanguage } = useLanguage()

  const [news, setNews] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<string | null>(categoryFilter)
  const [selectedSeason, setSelectedSeason] = useState<string | null>(seasonFilter)

  // Helper to get localized text
  const getLocalizedText = (item: NewsItem, field: 'title' | 'content' | 'summary'): string => {
    if (language === 'ml') {
      const mlField = `${field}_ml` as keyof NewsItem
      if (item[mlField]) return item[mlField] as string
    }
    const enField = `${field}_en` as keyof NewsItem
    return (item[enField] || item[field] || '') as string
  }

  useEffect(() => {
    fetchNews()
  }, [selectedCategory, selectedSeason])

  const fetchNews = async () => {
    setLoading(true)
    setError(null)

    try {
      const params = new URLSearchParams()
      params.append('limit', '100')
      
      if (selectedCategory) {
        params.append('category', selectedCategory)
      }
      
      if (selectedSeason) {
        params.append('season_id', selectedSeason)
      }

      const response = await fetch(`/api/news?${params.toString()}`)
      
      if (!response.ok) {
        throw new Error('Failed to fetch news')
      }

      const data = await response.json()
      setNews(data.news || [])
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
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Kolkata',
    }).format(date)
  }

  if (loading) {
    return (
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="text-slate-500 font-mono text-xs">Loading Newsroom feed...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center shadow-sm max-w-md mx-4 space-y-4">
          <Shield className="w-12 h-12 text-rose-500 mx-auto" />
          <h3 className="text-xl font-bold text-slate-900">Newsroom Error</h3>
          <p className="text-sm text-slate-500 font-mono">{error}</p>
          <button
            onClick={fetchNews}
            className="inline-flex items-center px-5 py-2.5 rounded-xl bg-slate-800 text-white font-mono font-bold text-xs hover:bg-slate-700 transition-colors cursor-pointer"
          >
            TRY AGAIN
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="console-bg min-h-screen text-slate-800 relative pt-5 lg:pt-24 pb-8 sm:pb-12 px-4 sm:px-6">
      
      {/* Decorative eSports glowing ambient overlay */}
      <div className="absolute top-0 left-0 right-0 h-96 bg-gradient-to-b from-[#D4AF37]/5 to-transparent pointer-events-none"></div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-8">
        
        {/* Back Button */}
        <Link
          href="/"
          className="inline-flex items-center text-xs font-mono font-bold text-slate-500 hover:text-amber-600 transition-colors"
        >
          {"<-"} BACK_TO_HOME
        </Link>

        {/* Title Panel */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-6 sm:p-8 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="text-center md:text-left">
            <span className="text-[10px] text-amber-600 font-bold uppercase tracking-wider font-mono">LOBBY COMMUNIQUÉS</span>
            <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight mt-0.5">
              News & Updates
            </h1>
            <p className="text-xs text-slate-500 font-mono mt-1">
              STAY TUNED: FEED INTEGRATES <span className="text-amber-600 font-bold">{news.length}</span> RECENT ARTICLES & TOURNAMENT REVEALS
            </p>
          </div>
          
          {/* Language Toggle */}
          <div className="flex bg-slate-100 border border-slate-200/60 p-1 rounded-xl gap-1 font-mono">
            <button
              onClick={() => setLanguage('en')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                language === 'en'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-650 hover:text-amber-600'
              }`}
            >
              EN
            </button>
            <button
              onClick={() => setLanguage('ml')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                language === 'ml'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'text-slate-650 hover:text-amber-600'
              }`}
            >
              ML
            </button>
          </div>
        </div>

        {/* Filters Panel */}
        <div className="bg-white border border-slate-200/60 rounded-2xl p-5 shadow-sm space-y-4">
          <div className="text-[10px] font-mono font-bold uppercase tracking-wider text-slate-400">
            FILTER BY TOPIC CATEGORY
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory(null)}
              className={`px-3 py-2 rounded-xl font-mono font-bold text-xs border transition-all cursor-pointer ${
                !selectedCategory
                  ? 'bg-amber-600 text-white border-amber-600 shadow-sm shadow-amber-600/10'
                  : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
              }`}
            >
              ALL FEED
            </button>
            {Object.keys(CATEGORY_COLORS).map(category => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-3 py-2 rounded-xl font-mono font-bold text-xs border transition-all flex items-center gap-1.5 cursor-pointer ${
                  selectedCategory === category
                    ? 'bg-amber-600 text-white border-amber-650 shadow-sm shadow-amber-600/10'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                <span>{CATEGORY_ICONS[category]}</span>
                <span className="uppercase">{category}</span>
              </button>
            ))}
          </div>
        </div>

        {/* News List */}
        {news.length === 0 ? (
          <div className="bg-white border border-slate-200/60 rounded-2xl p-12 text-center shadow-sm max-w-lg mx-auto">
            <Tag className="w-12 h-12 text-slate-300 mx-auto mb-4" />
            <p className="text-slate-900 text-lg font-bold">No News Found</p>
            <p className="text-xs text-slate-400 font-mono mt-1 uppercase">Updates will be published here once recorded</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Featured Article (Latest) */}
            {news[0] && (
              <Link
                href={`/news/${news[0].id}`}
                className="block bg-white border border-slate-200/60 rounded-2xl overflow-hidden shadow-sm hover:shadow-md hover:border-amber-400/40 transition-all duration-250 group console-card"
              >
                <div className="grid grid-cols-1 lg:grid-cols-2">
                  {/* Featured Image */}
                  {news[0].image_url ? (
                    <div className="h-64 sm:h-80 lg:h-full min-h-[300px] overflow-hidden bg-slate-50 border-b lg:border-b-0 lg:border-r border-slate-100 relative">
                      <img
                        src={news[0].image_url}
                        alt={getLocalizedText(news[0], 'title')}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 absolute inset-0"
                        loading="eager"
                      />
                    </div>
                  ) : (
                    <div className="h-64 sm:h-80 lg:h-full min-h-[300px] bg-slate-50 border-b lg:border-b-0 lg:border-r border-slate-100 flex items-center justify-center">
                      <Shield className="w-16 h-16 text-slate-200" />
                    </div>
                  )}

                  <div className="p-6 sm:p-8 flex flex-col justify-between space-y-6">
                    <div className="space-y-4">
                      {/* Category & Date */}
                      <div className="flex items-center gap-3">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[8px] font-mono font-bold uppercase tracking-wider border ${CATEGORY_COLORS[news[0].category] || 'bg-slate-50 text-slate-800'}`}>
                          <span className="text-[10px]">{CATEGORY_ICONS[news[0].category]}</span>
                          {news[0].category}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 font-bold uppercase">
                          {formatDate(news[0].published_at || news[0].created_at)}
                        </span>
                      </div>

                      {/* Title */}
                      <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 leading-tight group-hover:text-amber-600 transition-colors">
                        {getLocalizedText(news[0], 'title')}
                      </h2>

                      {/* Summary */}
                      <p className="text-sm text-slate-550 leading-relaxed font-sans line-clamp-4">
                        {getLocalizedText(news[0], 'summary') || getLocalizedText(news[0], 'content').substring(0, 250) + '...'}
                      </p>
                    </div>

                    {/* Read More link */}
                    <div className="flex items-center gap-2 text-xs font-mono font-bold text-amber-650 group-hover:gap-3 transition-all uppercase tracking-wider pt-4 border-t border-slate-100">
                      <span>READ FULL STORY</span>
                      <ArrowRight className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              </Link>
            )}

            {/* Other News Grid */}
            {news.length > 1 && (
              <div className="space-y-4">
                <h3 className="text-sm font-bold text-slate-900 font-mono uppercase tracking-wider flex items-center gap-2">
                  <span>MORE ARTICLES</span>
                  <div className="h-[1px] flex-1 bg-slate-200"></div>
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {news.slice(1).map((item) => (
                    <NewsCard
                      key={item.id}
                      news={item as any}
                      showLink={true}
                      showImage={true}
                      compact={false}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default function NewsPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen console-bg flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-amber-600 mx-auto"></div>
          <p className="text-slate-500 font-mono text-xs">Loading Newsroom...</p>
        </div>
      </div>
    }>
      <NewsContent />
    </Suspense>
  )
}
