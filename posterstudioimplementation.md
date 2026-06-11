Poster Studio Integration for Player Stats Page
This plan details the implementation of a dynamic, browser-based Poster Studio generator on the Committee Admin Player Stats page. It enables admins to generate premium, visually stunning stats graphics for individual players, season leaderboards, **Player of the Day recognition**, and **Player of the Week awards**.

## Implementation Status

✅ **COMPLETED:**
- **PosterStudio component** created at `/components/PosterStudio.tsx` matching posterstudioui.md spec
- **Toggle button** - Always visible, shows/hides the collapsible panel
- **Collapsible panel** with 3 sections:
  - Studio Header with title, theme tabs, and round/week filter
  - Live Preview using CSS scale trick (75% scale, 133.33% width)
  - Action buttons (Download & Share with gradient styling)
- **Theme system** with 5 poster types:
  - Golden Boot (🥾) - Yellow/Orange theme
  - Golden Ball (⚽) - Blue/White theme
  - Golden Glove (🧤) - Purple/Cyan theme
  - Player of Day (⚡) - Cyan/Blue theme
  - Player of Week (🏆) - Gold theme
- **Dynamic theme styling** - Accent colors, glows, and gradients change per theme
- **Dual render pattern** - Preview (scaled) + hidden capture target (full 800px)
- **Button states** - Idle → Loading (spinner) → Success (checkmark, 2.5s) → Idle
- **Web Share API** support with download fallback
- **SS League branding** integrated on all posters
- Integrated into Player Stats By Round page
- html-to-image library (v1.11.13) for high-quality 2x pixel ratio exports

**UI/UX Highlights:**
- ✅ Toggle button with violet glow when active
- ✅ Glass morphism panel with gradient background
- ✅ Theme tabs with dynamic glow effects matching accent colors
- ✅ Round/week filter with theme-tinted styling
- ✅ Live preview at 75% scale (600px visible, 800px internal)
- ✅ Share button with dynamic gradient (changes per theme)
- ✅ Download button with state animations
- ✅ Off-screen capture target for crisp exports

**NEXT STEPS:**
- Add player photos (currently showing placeholder rank numbers)
- Add more poster variations (Team Matchday, Top 20)
- Test with actual player data and photos
- Implement automated selection logic for Player of the Week
- Add scheduled poster generation (cron jobs)
- Create admin approval queue for recognition posters

Proposed Changes
We will introduce a two-tier rendering system: a responsive preview UI for interaction, and a set of off-screen, fixed-dimension components built with strict inline styling, Google Fonts, and ambient glow grids for pixel-perfect image generation.

Components
[MODIFY] 
page.tsx
Import html-to-image: Add library import to capture DOM nodes as PNG blobs/data URLs.
Add Export State & Action Handlers:
State for loading state of poster generation (e.g., generatingPosterId).
Action sharePlayerCard(player): Generates and triggers native sharing or download of the individual player stat card.
Action shareLeaderboard(): Generates and triggers native sharing or download of the top 5 standings poster.
Action sharePlayerOfTheDay(player, matchData): Generates Player of the Day recognition poster with match-specific performance stats.
Action sharePlayerOfTheWeek(player, weekNumber, weekStats): Generates Player of the Week poster with aggregate weekly performance data.
Integrate Share Buttons:
Add a prominent "Export Standings Poster" button at the page level (near the season selectors).
Add a "Share Card" button with a camera icon on each player's row.
Add "Player of the Day" button for generating recognition posters after match completion.
Add "Player of the Week" button (admin-level) to generate weekly recognition posters.
Embed Hidden Off-screen Capturing Divs:
Build the Player Card Poster Snapshot (800x1000px) with rich typography, glassmorphism, radial gradient glow orbs, and strict inline styles matching the Vision OS design system.
Build the Leaderboard Poster Snapshot (1200x630px) displaying the season's top 5 players with SS League branding.
Build the Player of the Day Poster Snapshot (1080x1080px - Instagram square format) with:
SS League logo and branding in top-left corner (MANDATORY)
Vision OS-inspired glow orbs using brand colors (#0066FF, #9580FF)
Player photo in circular frame with primary blue border (#0066FF)
Performance stats from specific match (goals, assists, rating)
Glass morphism stat cards matching website's card style
Match date and opponent information
"PLAYER OF THE DAY" badge in brand blue with proper spacing
Light gradient background matching website aesthetic
Build the Player of the Week Poster Snapshot (1200x630px - social media landscape format) with:
SS League logo and branding in top-left corner (MANDATORY)
Vision OS-inspired glow orbs in complementary positions
Player photo and name with brand color accents
Week number badge with gradient (linear-gradient(135deg, #0066FF, #9580FF))
Aggregate stats from all matches in the week in glass card grid
Number of matches played indicator
Average rating or total points display
Comparison metrics showing consistency/improvement
Date range footer in subtle gray
Inject the <link> tag for the custom Google Font **Outfit** (weights: 400, 500, 600, 700, 900) inside all poster containers.
Ensure all dynamic elements use fallback values and `crossOrigin="anonymous"` for remote images (especially logo and player photos).
Design System & Poster Aesthetics
The snapshots will be built using the **SS League Vision OS-Inspired Design System**:

**Brand Colors (Mandatory):**
- Primary Blue: `#0066FF` - Main brand color for headers, accents, CTAs
- Primary Dark: `#0055CC` - Hover states and deeper accents
- Secondary Purple: `#9580FF` - Secondary accent and gradient partner
- Accent Red: `#FF2D55` - Highlights and alerts
- Golden: `#D4AF37` - Awards, achievements, special recognition
- Dark: `#1C1C1E` - Text and dark backgrounds
- Light: `#F5F5F7` - Light backgrounds and cards

**Backgrounds:** 
- Base: Light gradient `linear-gradient(135deg, rgba(245, 245, 247, 0.98) 0%, rgba(255, 255, 255, 0.98) 100%)`
- Vision OS Glows: Radial ambient glows using brand colors
  - Primary: `radial-gradient(circle, rgba(0, 102, 255, 0.12), transparent 70%)` with `blur(60px)`
  - Secondary: `radial-gradient(circle, rgba(149, 128, 255, 0.1), transparent 70%)` with `blur(60px)`

**Glass Morphism (Matching Website Nav & Cards):**
- Background: `rgba(255, 255, 255, 0.4)`
- Backdrop Filter: `blur(8px)` with `-webkit-backdrop-filter` fallback
- Border: `1px solid rgba(255, 255, 255, 0.3)`
- Box Shadow: `0 4px 30px rgba(0, 0, 0, 0.05)` for subtle depth
- Border Radius: `12px` to `16px` for modern rounded corners

**Typography:** 
- Primary Font: **Outfit** (Google Fonts) with weights 400, 500, 600, 700, 900
- Fallback: Geist (website font), `-apple-system`, `BlinkMacSystemFont`, `sans-serif`
- Anti-aliasing: `-webkit-font-smoothing: antialiased`
- Letter Spacing: `-0.02em` for headings (matching website's vision-text-shadow class)

**Gradient Text (Logo & Titles):**
```jsx
background: 'linear-gradient(90deg, #0066FF, #9580FF)',
WebkitBackgroundClip: 'text',
backgroundClip: 'text',
color: 'transparent',
WebkitTextFillColor: 'transparent',
```

**Logo Integration (MANDATORY ON ALL POSTERS):**
Every poster must include the SS League logo in the top-left corner:
- Logo file: `/logo.png`
- Container: 48-56px square with white background and rounded corners (12-14px radius)
- Shadow: `0 4px 16px rgba(0, 0, 0, 0.08)`
- Brand text: "SS League" in gradient with "Auction Platform" subtitle
- Must use `crossOrigin="anonymous"` for CORS compliance
Verification Plan
Automated Verification
Run npm run build to ensure the compilation succeeds.
Verify TypeScript types for html-to-image and standard browser sharing APIs.
Manual Verification
Navigate to the Player Statistics page.
Select a season and click "Export Standings Poster". Ensure a high-resolution, perfectly-aligned PNG is either shared or downloaded.
Expand a player or click "Share Card" in their row. Verify the individual card captures their correct name, team, points, W-D-L counts, goals, and clean sheets.
Inspect that the image renders the custom font Outfit and dynamic backgrounds.
**Player of the Day:**
Navigate to a completed match page or player stats.
Click "Generate Player of the Day" for a standout performer.
Verify the 1080x1080px square poster includes:
Player photo with team-colored circular border
Match-specific stats (goals, assists, rating)
Correct match date and opponent
Dynamic team-colored glow effects
Premium "PLAYER OF THE DAY" badge
Test download and native share functionality on mobile devices.
**Player of the Week:**
As an admin, navigate to weekly stats or use automated generation.
Click "Generate Player of the Week" for the current/past week.
Verify the 1200x630px landscape poster includes:
Player photo and team information
Week number or date range
Aggregate stats from all matches that week
Match count indicator
Average rating or total points
Test that poster generates correctly at week boundaries.
Verify automated generation (if implemented) runs on schedule.

## Implementation Notes

### Player Selection Logic
For automated Player of the Day/Week selection, consider implementing:
- **Points-based system**: Goals × 3 + Assists × 2 + Clean Sheets × 1
- **Rating-based**: Highest match rating or average weekly rating
- **Admin override**: Allow manual selection before auto-posting
- **Eligibility criteria**: Minimum minutes played, exclude red cards

### Automation Options
**Player of the Day:**
- Generate after each match completion
- Create approval queue for admin review
- Auto-post to social media at scheduled time

**Player of the Week:**
- Run cron job every Sunday at 8 PM
- Calculate from Monday-Sunday match window
- Store in historical archive for player profiles
- Send notifications to winning player

### Data Requirements
Ensure the following data is available:
- Player photos (with CORS headers for crossOrigin)
- Team primary colors (hex codes)
- Match-level statistics (goals, assists, saves, ratings)
- Week-level aggregated statistics
- Match dates and opponent information

## Brand Consistency Requirements

All posters generated must strictly adhere to the SS League brand identity:

**Logo Placement:**
- SS League logo must appear in top-left corner (32px from top, 32px from left for 1080px posters)
- Logo size: 48-56px square depending on poster dimensions
- Container: White background, rounded 12-14px, with shadow `0 4px 16px rgba(0, 0, 0, 0.08)`
- Gradient brand text: "SS League" using `linear-gradient(90deg, #0066FF, #9580FF)`
- Subtitle: "Auction Platform" in `#6B7280`

**Color Usage:**
- Primary actions/borders: `#0066FF` (SS League Blue)
- Secondary accents: `#9580FF` (Purple)
- Awards/highlights: `#D4AF37` (Golden)
- Text: `#1C1C1E` (Dark) and `#6B7280` (Gray)
- Never use generic neon colors or team colors for primary branding elements

**Design Consistency:**
- Match website's Vision OS-inspired glassmorphism
- Use identical glow orb styling as homepage
- Apply same border radius values (12-16px)
- Maintain consistent padding and spacing
- Use Outfit font family matching website typography

**Quality Standards:**
- Export at `pixelRatio: 2` for high-resolution (Retina) displays
- Test logo visibility on all background variations
- Verify glass effect renders correctly in exported image
- Ensure all fonts load before capture (wait for font load event)

**Testing:**
- Generate sample posters and compare with website UI
- Check logo clarity at actual exported resolution
- Verify brand colors match exactly (use color picker to validate)
- Test on multiple devices and screen sizes
- Confirm CORS headers allow logo loading from CDN/server