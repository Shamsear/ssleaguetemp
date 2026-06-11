Poster Studio — Page UI & Preview System Guide
This guide explains how the Poster Studio appears on the page — the toggle button, the collapsible panel, the theme tabs, the live preview with the CSS scale trick, and the action buttons. Everything you need to replicate the full interactive UI on any website.

Overview: What the User Sees

┌──────────────────────────────────────────────────────────┐
│  [🎨 Poster Studio]  ← Toggle button (always visible)   │
├──────────────────────────────────────────────────────────┤
│  STUDIO HEADER                                           │
│  ┌──────────────────────────────────┐  ┌──┐┌──┐┌──┐┌──┐ │
│  │ 🎨 Poster Studio                │  │🥾││⚽││🧤││⚡│ │
│  │ Create premium shareable posters│  └──┘└──┘└──┘└──┘ │
│  └──────────────────────────────────┘   Theme Tabs       │
│  Filter by Matchday: [▼ All Matchdays ]                  │
├──────────────────────────────────────────────────────────┤
│                                                          │
│           ┌─────────────────────┐                        │
│           │                     │                        │
│           │   LIVE PREVIEW      │  ← 75% scaled-down    │
│           │   (poster snapshot) │     version of the     │
│           │                     │     800px poster       │
│           └─────────────────────┘                        │
│                                                          │
├──────────────────────────────────────────────────────────┤
│  [Save Award]           [Download Poster]  [Share Poster]│
└──────────────────────────────────────────────────────────┘
HIDDEN (off-screen at left: -9999px):
┌─────────────────────┐
│ Full-size 800px     │ ← This is what captureTableAsPng
│ poster snapshot     │    actually captures
│ (the "camera" ref)  │
└─────────────────────┘
Part 1: The Toggle Button
The Poster Studio is collapsed by default. A toggle button shows/hides the entire panel.

tsx

const [showPoster, setShowPoster] = useState(false)
// The toggle button — always visible on the page
<button
  onClick={() => setShowPoster(!showPoster)}
  className={`flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm 
    transition-all border ${
    showPoster
      ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'        // Active state
      : 'bg-white/5 border-white/10 text-[#D4CCBB] hover:bg-white/10'  // Inactive state
  }`}
>
  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
      d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 
         0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
  {showPoster ? 'Hide Poster Studio' : '🎨 Poster Studio'}
</button>
Design detail: The button changes from a muted grey to a glowing violet when the studio is open, giving clear visual feedback.

Part 2: The Collapsible Panel
When showPoster is true, the entire studio renders. It has 3 vertical sections inside a bordered container:

tsx

{showPoster && (
  <div className="mt-4 rounded-2xl border border-white/10 
    bg-gradient-to-br from-white/[0.04] to-white/[0.01] overflow-hidden">
    
    {/* Section A: Studio Header (title + theme tabs + matchday selector) */}
    <div className="px-5 py-4 border-b border-white/10 bg-white/[0.02]">
      ...
    </div>
    {/* Section B: Live Preview */}
    <div className="p-5">
      ...
    </div>
    {/* Section C: Action Buttons */}
    <div className="px-5 py-4 border-t border-white/10 bg-white/[0.02] 
      flex flex-wrap gap-2 justify-between items-center">
      ...
    </div>
  </div>
)}
Part 3: Theme Tab Selector
Each poster type (Golden Boot, Golden Ball, Golden Glove, Team Matchday, Team of the Week) is a "theme". The user switches between them via pill-shaped tab buttons.

Theme definition
typescript

type ThemeKey = 'golden_boot' | 'ball' | 'glove' | 'team_matchday' | 'team_weekly'
interface Theme {
  label: string      // Display name: "Golden Boot"
  emoji: string      // Tab icon: "🥾"
  bg: string[]       // 3-stop background gradient colors
  accent: string     // Primary accent color
  accent2: string    // Secondary accent color (for gradient buttons)
  glow: string       // Glow effect color (rgba)
  tagline: string    // Poster headline text
}
const THEMES: Record<ThemeKey, Theme> = {
  golden_boot: {
    label: 'Golden Boot', emoji: '🥾',
    bg: ['#0a0a0a', '#1a1200', '#2d1f00'],
    accent: '#FFD700', accent2: '#FFA500',
    glow: 'rgba(255,215,0,0.35)',
    tagline: 'GOLDEN BOOT',
  },
  ball: {
    label: 'Golden Ball', emoji: '⚽',
    bg: ['#050a1a', '#0a1628', '#0d2040'],
    accent: '#3ab8ff', accent2: '#ffffff',
    glow: 'rgba(58,184,255,0.35)',
    tagline: 'GOLDEN BALL',
  },
  glove: {
    label: 'Golden Glove', emoji: '🧤',
    bg: ['#0a0a14', '#0d1a2d', '#1a0d2d'],
    accent: '#a78bfa', accent2: '#38bdf8',
    glow: 'rgba(167,139,250,0.35)',
    tagline: 'GOLDEN GLOVE',
  },
  team_matchday: {
    label: 'Team Matchday', emoji: '⚡',
    bg: ['#0a0a0a', '#0f0f0f', '#141414'],
    accent: '#00e5ff', accent2: '#0077ff',
    glow: 'rgba(0,229,255,0.35)',
    tagline: 'TEAM OF THE DAY',
  },
  team_weekly: {
    label: 'Team of the Week', emoji: '🏆',
    bg: ['#0a0a0a', '#0f0f0f', '#141414'],
    accent: '#E8A800', accent2: '#FFD700',
    glow: 'rgba(232,168,0,0.35)',
    tagline: 'TEAM OF THE WEEK',
  },
}
Tab button rendering
The active tab gets a dynamic glow effect using the theme's own accent color:

tsx

const [activeTheme, setActiveTheme] = useState<ThemeKey>('golden_boot')
const theme = THEMES[activeTheme]
<div className="flex gap-2">
  {(Object.entries(THEMES) as [ThemeKey, Theme][]).map(([key, t]) => (
    <button
      key={key}
      onClick={() => setActiveTheme(key)}
      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs 
        font-bold transition-all border ${
        activeTheme === key
          ? 'border-opacity-50 shadow-lg'                                 // Active
          : 'border-white/10 bg-white/5 text-[#7A7367] hover:bg-white/10' // Inactive
      }`}
      style={
        activeTheme === key
          ? {
              background: `${t.accent}18`,           // Very subtle tint of the accent
              borderColor: `${t.accent}50`,           // Semi-transparent accent border
              color: t.accent,                        // Text in accent color
              boxShadow: `0 2px 12px ${t.glow.replace('0.35', '0.2')}`, // Soft glow
            }
          : undefined
      }
    >
      <span>{t.emoji}</span>
      <span className="hidden sm:inline">{t.label}</span> {/* Label hidden on mobile */}
    </button>
  ))}
</div>
TIP

The style prop with dynamic colors is used instead of Tailwind classes because each theme has a different accent color that would require dozens of custom class variants.

Part 4: Matchday / Week Filter
Below the theme tabs, a <select> dropdown lets the user filter data by matchday or week:

tsx

const [selectedMatchday, setSelectedMatchday] = useState<number>(0) // 0 = "All"
const [selectedWeek, setSelectedWeek] = useState<number>(0)
{activeTheme === 'team_weekly' ? (
  // Week selector for Team of the Week
  <select
    value={selectedWeek}
    onChange={(e) => setSelectedWeek(Number(e.target.value))}
    className="px-3 py-2 rounded-lg bg-white/5 border border-white/10 
      text-[#F5F0E8] text-sm font-bold"
    style={{
      background: `${theme.accent}08`,       // Subtle theme-tinted background
      borderColor: `${theme.accent}30`,       // Theme-tinted border
    }}
  >
    <option value={0}>All Weeks</option>
    {weekOptions.map(week => (
      <option key={week} value={week}>Week {week} (MD {start}-{end})</option>
    ))}
  </select>
) : (
  // Matchday selector for all other themes
  <select
    value={selectedMatchday}
    onChange={(e) => setSelectedMatchday(Number(e.target.value))}
    ...same styling...
  >
    <option value={0}>All Matchdays</option>
    {matchdayOptions.map(md => (
      <option key={md} value={md}>Matchday {md}</option>
    ))}
  </select>
)}
How the filter changes the data:

Theme	Filter Behavior
Golden Boot / Ball / Glove	Cumulative — shows stats summed from Matchday 1 through the selected matchday
Team Matchday	Isolated — shows only the stats from that single matchday
Team of the Week	Range — shows stats from matchdays within the 7-day week window
Part 5: The Live Preview (The CSS Scale Trick)
This is the most important technique. The poster snapshot is designed at a fixed 800px width for export quality, but you want to show it in a 600px max-width container on the page.

The trick: transform: scale(0.75) + width: 133.33%
tsx

<div className="p-5">
  {/* Outer container: limits visible area to 600px */}
  <div className="rounded-xl overflow-hidden border border-white/10 
    shadow-2xl mx-auto" style={{ maxWidth: 600 }}>
    
    {/* Inner wrapper: CSS scale trick */}
    <div style={{ 
      transform: 'scale(0.75)',          // Shrink to 75%
      transformOrigin: 'top left',        // Anchor to top-left corner
      width: '133.33%',                   // Counter-scale: 100 / 0.75 = 133.33%
    }}>
      {/* The actual 800px-wide poster component */}
      <PosterSnapshot
        theme={theme}
        teams={sortedTeams}
        maxTeams={maxTeams}
        tournamentName={tournamentName}
        seasonName={seasonName}
        roundLabel={roundLabel}
        getMetric={getMetric}
      />
    </div>
  </div>
</div>
Why this works

Without the trick:
┌──── 600px container ────┐
│ ┌──── 800px poster ─────│── overflows! ──┐
│ │                        │               │
│ └────────────────────────│───────────────┘
└──────────────────────────┘
With scale(0.75):
  The 800px poster is rendered at 800px internally (so all layout is correct),
  then CSS visually shrinks it to 800 × 0.75 = 600px.
  
  But transform doesn't change the element's layout box (it still occupies 800px 
  of space), so we set width: 133.33% to make the inner div think it has 800px 
  of space inside the 600px container: 600 × 1.3333 = 800px.
Result:
┌──── 600px container ────┐
│ ┌── 800px → scaled 75% ─┐│
│ │  Perfect fit!          ││
│ └────────────────────────┘│
└──────────────────────────┘
IMPORTANT

The preview renders the exact same snapshot component as the off-screen capture target. This is what makes it a true "what you see is what you get" system. The user sees the exact poster they'll download.

Part 6: The Dual Render Pattern
The component renders the snapshot twice:

Render 1: Visible Preview (inside the scaled container)
tsx

<div style={{ transform: 'scale(0.75)', ... }}>
  <PosterSnapshot ... />   {/* ← User sees this */}
</div>
Render 2: Off-screen Capture Target (hidden, full-size)
tsx

<div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }} aria-hidden="true">
  <div ref={posterRef}>
    <PosterSnapshot ... />   {/* ← captureTableAsPng targets this */}
  </div>
</div>
Why two copies?

The preview is inside a scale(0.75) transform. If you try to capture that, html-to-image would capture the scaled-down version and produce a low-resolution image. The off-screen copy is at full 800px and produces a crisp, high-DPI export.

Both copies receive the exact same props so they always show identical content.

Part 7: Action Button Bar
The footer bar contains up to 3 buttons depending on the active theme:


┌──────────────────────────────────────────────────────────┐
│  [💾 Save Award]              [⬇ Download]  [📤 Share]  │
└──────────────────────────────────────────────────────────┘
Button states (all 3 buttons share this pattern)
Each button has 4 visual states managed by useState:

tsx

const [downloading, setDownloading] = useState(false)  // Loading spinner
const [downloadDone, setDownloadDone] = useState(false) // Success checkmark
// idle     → "Download Poster" (normal style)
// loading  → spinner + "Saving…" (disabled, opacity 60%)
// success  → checkmark + "Saved!" (green, auto-resets after 2.5s)
// error    → X icon + error message (red, for Save Award only)
The Share button gradient trick
The Share button uses the theme's accent colors as a gradient fill, making it the primary CTA:

tsx

<button
  style={
    !shareDone
      ? {
          background: `linear-gradient(135deg, ${theme.accent}, ${theme.accent2})`,
          color: '#0a0a0a',     // Dark text on bright gradient
          border: 'none',
        }
      : undefined              // Success state uses green Tailwind classes instead
  }
>
  Share Poster
</button>
This means the Share button's gradient color automatically changes when the user switches themes — gold for Golden Boot, blue for Golden Ball, purple for Golden Glove, etc.

Part 8: The Download & Share Handlers
tsx

const posterRef = useRef<HTMLDivElement>(null)
const handleDownload = async () => {
  if (!posterRef.current || downloading) return
  setDownloading(true)
  try {
    // 1. Capture the off-screen (full-size) snapshot
    const dataUrl = await captureTableAsPng(posterRef.current, {
      width: 800,                          // Poster width
      backgroundColor: theme.bg[0],        // Match the theme's darkest background
    })
    // 2. Convert data URL → Blob → Object URL for reliable download
    const blob = await (await fetch(dataUrl)).blob()
    const blobUrl = URL.createObjectURL(blob)
    // 3. Trigger download via hidden <a> tag
    const link = document.createElement('a')
    link.href = blobUrl
    link.download = `tournament-${activeTheme}-poster.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    setTimeout(() => URL.revokeObjectURL(blobUrl), 100)
    // 4. Show success state for 2.5 seconds
    setDownloadDone(true)
    setTimeout(() => setDownloadDone(false), 2500)
  } catch (err) {
    console.error('Download error:', err)
  } finally {
    setDownloading(false)
  }
}
const handleShare = async () => {
  if (!posterRef.current || sharing) return
  setSharing(true)
  try {
    const dataUrl = await captureTableAsPng(posterRef.current, {
      width: 800,
      backgroundColor: theme.bg[0],
    })
    const blob = await (await fetch(dataUrl)).blob()
    const file = new File([blob], `poster.png`, { type: 'image/png' })
    // Try native share (works on mobile)
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({
        files: [file],
        title: `${tournamentName} — ${theme.label} Poster`,
      })
    } else {
      // Fallback to download on desktop
      await handleDownload()
      return
    }
    setShareDone(true)
    setTimeout(() => setShareDone(false), 2500)
  } catch (err) {
    console.error('Share error:', err)
  } finally {
    setSharing(false)
  }
}
Complete Component Skeleton
Here's a minimal, portable version you can copy to any project:

tsx

'use client'
import { useState, useRef } from 'react'
import { captureTableAsPng } from '@/lib/share-table' // from the previous guide
// Your themes, snapshot components, etc.
export default function PosterStudio({ data, tournamentName, seasonName }) {
  const posterRef = useRef<HTMLDivElement>(null)
  const [showPoster, setShowPoster] = useState(false)
  const [activeTheme, setActiveTheme] = useState('theme_a')
  const [downloading, setDownloading] = useState(false)
  const [downloadDone, setDownloadDone] = useState(false)
  const handleDownload = async () => { /* ... see above ... */ }
  const handleShare = async () => { /* ... see above ... */ }
  return (
    <>
      {/* 1. TOGGLE BUTTON */}
      <button onClick={() => setShowPoster(!showPoster)}>
        {showPoster ? 'Hide Poster Studio' : '🎨 Poster Studio'}
      </button>
      {/* 2. COLLAPSIBLE PANEL */}
      {showPoster && (
        <div className="mt-4 rounded-2xl border border-white/10 overflow-hidden">
          
          {/* 2A. HEADER: Title + Theme Tabs + Filter */}
          <div className="px-5 py-4 border-b border-white/10">
            <h3>🎨 Poster Studio</h3>
            <div className="flex gap-2 mt-3">
              {/* Theme tab buttons */}
            </div>
            <select className="mt-3">
              {/* Matchday/week filter */}
            </select>
          </div>
          {/* 2B. LIVE PREVIEW (CSS scale trick) */}
          <div className="p-5">
            <div style={{ maxWidth: 600 }} className="mx-auto rounded-xl overflow-hidden border border-white/10">
              <div style={{ transform: 'scale(0.75)', transformOrigin: 'top left', width: '133.33%' }}>
                <MyPosterSnapshot data={filteredData} theme={activeTheme} />
              </div>
            </div>
          </div>
          {/* 2C. ACTION BUTTONS */}
          <div className="px-5 py-4 border-t border-white/10 flex gap-2 justify-end">
            <button onClick={handleDownload}>Download Poster</button>
            <button onClick={handleShare}>Share Poster</button>
          </div>
        </div>
      )}
      {/* 3. OFF-SCREEN CAPTURE TARGET (full size, never visible) */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }} aria-hidden="true">
        <div ref={posterRef}>
          <MyPosterSnapshot data={filteredData} theme={activeTheme} />
        </div>
      </div>
    </>
  )
}
Key Takeaways
Concept	Implementation
Toggle	useState(false) + conditional render
Theme switching	Object map of themes + useState<ThemeKey> + dynamic style props
Live preview	scale(0.75) + width: 133.33% + transformOrigin: top left
Dual render	Same snapshot rendered once visible (preview) and once hidden (capture target)
Download	captureTableAsPng(ref) → blob → <a>.click()
Share	captureTableAsPng(ref) → File → navigator.share({ files })
Button states	idle → loading (spinner) → success (checkmark, 2.5s) → idle
