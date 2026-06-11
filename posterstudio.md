he Poster Studio Architecture: A Complete Guide
The "Poster Studio" is a powerful system that dynamically generates premium, data-driven image graphics (like Matchday Results, Golden Boot standings, etc.) entirely within the browser.

This document explains the architecture, the core technologies, and the "secret sauce" required to build this feature in any React or Next.js application.

1. The Core Concept: DOM-to-Image
Instead of relying on a complex backend server running headless browsers or Python image manipulation libraries (like Pillow), the Poster Studio leverages the user's own browser to do the rendering.

You build the poster exactly like a regular React component using HTML and CSS. Then, an open-source library takes a "snapshot" of that DOM node, draws it onto an invisible HTML5 <canvas>, and exports it as a .png data URL.

Recommended Dependency
html-to-image: The most modern and reliable library for this task. It handles SVGs, CSS filters, and modern flexbox layouts better than older alternatives like html2canvas.
bash

npm install html-to-image
2. The Two-Tier Architecture
One of the biggest mistakes developers make is trying to capture the responsive UI directly. This results in stretched, broken, or misaligned posters depending on the user's screen size.

The Poster Studio solves this using a Two-Tier Architecture:

The Preview UI: The responsive, interactive component the user sees on their screen.
The Snapshot Component: A hidden, fixed-dimension component designed exclusively for the camera.
jsx

export default function PosterStudio() {
  const exportRef = useRef<HTMLDivElement>(null);
  const downloadPoster = async () => {
    if (!exportRef.current) return;
    
    // The library targets the hidden, fixed-size container
    const dataUrl = await htmlToImage.toPng(exportRef.current, {
      quality: 1,
      pixelRatio: 2 // High resolution multiplier
    });
    
    // Trigger download
    const link = document.createElement('a');
    link.download = 'my-poster.png';
    link.href = dataUrl;
    link.click();
  };
  return (
    <div>
      <button onClick={downloadPoster}>Download</button>
      {/* OFF-SCREEN SNAPSHOT CONTAINER */}
      <div style={{ position: 'absolute', left: '-9999px', top: '-9999px' }}>
        <div ref={exportRef}>
           <MyPosterSnapshot data={data} />
        </div>
      </div>
    </div>
  )
}
3. The "Secret Sauce" & Critical Fixes
When generating images from the DOM, you will run into several frustrating browser security and rendering quirks. The TFC Poster Studio implements specific fixes for all of them:

A. Inline Styles are Mandatory
When the DOM is serialized into a canvas, external CSS stylesheets (like Tailwind or global .css files) are often lost or incorrectly applied. Solution: The Snapshot component must use strict React inline style={{ ... }} for every element to guarantee pixel-perfect accuracy.

B. The Custom Font Disappearance
A common issue is the downloaded image reverting to Times New Roman or Arial, even if it looks fine on the screen. The canvas renderer doesn't wait for external web fonts to load. Solution: Inject the font stylesheet directly inside the snapshot container.

jsx

<div style={{ width: 800, height: 600, fontFamily: '"Outfit", sans-serif' }}>
  {/* Force the renderer to parse the font locally */}
  <link 
    rel="stylesheet" 
    href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap" 
  />
  
  <h1>Dynamic Poster Title</h1>
</div>
C. The Tainted Canvas (CORS Issues)
If your poster includes images from other domains (like user avatars or CDN logos), the browser will trigger a Cross-Origin security error and the image generation will fail silently. Solution: You MUST add crossOrigin="anonymous" to every <img> tag in the snapshot.

jsx

<img 
  src="https://cdn.example.com/logo.png" 
  alt="Logo" 
  crossOrigin="anonymous" // CRITICAL FOR EXTERNAL IMAGES
  style={{ width: 100 }}
/>
(Note: The server hosting the image must also return Access-Control-Allow-Origin: * headers).

4. Designing Premium Aesthetics with CSS - SS League Brand Identity
Because the Poster Studio uses the DOM, you have access to the full power of modern CSS to create stunning visuals that match your website's Vision OS-inspired design system.

### Brand Color Palette
Use the official SS League color scheme defined in your design system:

```jsx
const brandColors = {
  primary: '#0066FF',       // SS League Blue
  primaryDark: '#0055CC',   // Hover state
  secondary: '#9580FF',     // Purple accent
  accent: '#FF2D55',        // Red accent
  golden: '#D4AF37',        // Awards/highlights
  dark: '#1C1C1E',          // Background dark
  light: '#F5F5F7',         // Background light
};
```

### Vision OS-Inspired Glow Orbs
Create background ambient lighting matching your website's aesthetic:

```jsx
{/* Primary Blue Glow - Top Left */}
<div style={{
  position: 'absolute',
  width: 400,
  height: 400,
  top: -100,
  left: -100,
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(0, 102, 255, 0.15), transparent 70%)',
  filter: 'blur(60px)',
}} />

{/* Secondary Purple Glow - Bottom Right */}
<div style={{
  position: 'absolute',
  width: 350,
  height: 350,
  bottom: -80,
  right: -80,
  borderRadius: '50%',
  background: 'radial-gradient(circle, rgba(149, 128, 255, 0.12), transparent 70%)',
  filter: 'blur(60px)',
}} />
```

### Glassmorphism / Vision OS Depth
Use the same glass effect as your website's navigation and cards:

```jsx
{/* Glass Container - Matches nav-glass and card styles */}
<div style={{
  background: 'rgba(255, 255, 255, 0.4)',
  backdropFilter: 'blur(8px)',
  WebkitBackdropFilter: 'blur(8px)',
  border: '1px solid rgba(255, 255, 255, 0.3)',
  boxShadow: '0 4px 30px rgba(0, 0, 0, 0.05)',
  borderRadius: 16,
  padding: 24,
}}>
  Content
</div>
```

### Dynamic Theming with Brand Colors
Integrate team colors while maintaining brand consistency:

```jsx
const teamColor = data.primaryColor || brandColors.primary;
const backgroundGradient = `linear-gradient(135deg, rgba(245, 245, 247, 0.95) 0%, rgba(255, 255, 255, 0.95) 100%)`;
// Add subtle team color overlay
const teamAccent = `radial-gradient(circle at 20% 30%, ${teamColor}15, transparent 60%)`;
```

### Logo Integration - Critical for Brand Identity
Every poster MUST include the SS League logo for official branding:

```jsx
{/* SS League Logo - Top Corner */}
<div style={{
  position: 'absolute',
  top: 24,
  left: 24,
  display: 'flex',
  alignItems: 'center',
  gap: 12,
}}>
  <div style={{
    width: 48,
    height: 48,
    borderRadius: 12,
    overflow: 'hidden',
    background: '#ffffff',
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.08)',
    padding: 4,
  }}>
    <img 
      src="/logo.png" 
      alt="SS League"
      crossOrigin="anonymous"
      style={{ 
        width: '100%', 
        height: '100%', 
        objectFit: 'contain' 
      }}
    />
  </div>
  <div style={{
    display: 'flex',
    flexDirection: 'column',
  }}>
    <span style={{
      fontSize: 18,
      fontWeight: 700,
      background: 'linear-gradient(90deg, #0066FF, #9580FF)',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      WebkitTextFillColor: 'transparent',
      letterSpacing: '-0.02em',
    }}>
      SS League
    </span>
    <span style={{
      fontSize: 10,
      color: '#6B7280',
      fontWeight: 500,
    }}>
      Auction Platform
    </span>
  </div>
</div>
```

### Typography - Match Website Fonts
Use Geist Sans (website font) or Outfit as fallback:

```jsx
<link 
  rel="stylesheet" 
  href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;900&display=swap" 
/>

<div style={{
  fontFamily: '"Geist", "Outfit", -apple-system, BlinkMacSystemFont, sans-serif',
  WebkitFontSmoothing: 'antialiased',
}}>
  {/* Your content */}
</div>
```
5. Advanced Exporting: The Web Share API
Instead of just downloading the file, modern mobile browsers allow you to instantly open the native Share menu (WhatsApp, Instagram, Twitter) by converting the data URL back into a File object.

javascript

// 1. Convert Data URL to Blob
const response = await fetch(dataUrl);
const blob = await response.blob();
const file = new File([blob], 'poster.png', { type: 'image/png' });
// 2. Trigger Native Share Menu
if (navigator.canShare && navigator.canShare({ files: [file] })) {
  await navigator.share({
    title: 'Match Result',
    text: 'Check out these stats!',
    files: [file]
  });
} else {
  // Fallback to normal download
}
6. Player Recognition Posters: Player of the Day & Week

The Poster Studio can be extended to create automated recognition graphics that celebrate outstanding performances. These posters are particularly effective for social media engagement and player motivation.

### Player of the Day Poster
Celebrates a standout performance from a single match or round with full SS League branding.

**Key Data Points:**
- SS League logo and branding (mandatory)
- Player name, team, and photo
- Match date and opponent
- Performance stats (goals, assists, clean sheets, saves, etc.)
- Man of the Match indicator
- Dynamic background with Vision OS-inspired glows and brand colors

**Design Pattern:**
```jsx
<div style={{
  width: 1080,
  height: 1080, // Square format for Instagram
  background: 'linear-gradient(135deg, rgba(245, 245, 247, 0.98) 0%, rgba(255, 255, 255, 0.98) 100%)',
  position: 'relative',
  fontFamily: '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif'
}}>
  {/* Vision OS Glow - Primary Blue */}
  <div style={{
    position: 'absolute',
    width: 500,
    height: 500,
    top: -150,
    left: -150,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(0, 102, 255, 0.12), transparent 70%)',
    filter: 'blur(60px)'
  }} />
  
  {/* Vision OS Glow - Secondary Purple */}
  <div style={{
    position: 'absolute',
    width: 450,
    height: 450,
    bottom: -100,
    right: -100,
    borderRadius: '50%',
    background: `radial-gradient(circle, rgba(149, 128, 255, 0.1), transparent 70%)`,
    filter: 'blur(60px)'
  }} />
  
  {/* SS League Logo & Branding - Top Left */}
  <div style={{
    position: 'absolute',
    top: 32,
    left: 32,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    zIndex: 10,
  }}>
    <div style={{
      width: 56,
      height: 56,
      borderRadius: 14,
      overflow: 'hidden',
      background: '#ffffff',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
      padding: 6,
    }}>
      <img 
        src="/logo.png" 
        alt="SS League"
        crossOrigin="anonymous"
        style={{ 
          width: '100%', 
          height: '100%', 
          objectFit: 'contain' 
        }}
      />
    </div>
    <div style={{
      display: 'flex',
      flexDirection: 'column',
    }}>
      <span style={{
        fontSize: 22,
        fontWeight: 700,
        background: 'linear-gradient(90deg, #0066FF, #9580FF)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        WebkitTextFillColor: 'transparent',
        letterSpacing: '-0.02em',
      }}>
        SS League
      </span>
      <span style={{
        fontSize: 11,
        color: '#6B7280',
        fontWeight: 500,
      }}>
        Auction Platform
      </span>
    </div>
  </div>
  
  {/* Badge: "PLAYER OF THE DAY" */}
  <div style={{
    fontSize: 16,
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: 3,
    color: '#0066FF',
    textAlign: 'center',
    marginTop: 120,
  }}>
    ⭐ Player of the Day
  </div>
  
  {/* Player Photo Container with Glass Effect */}
  <div style={{
    width: 320,
    height: 320,
    margin: '40px auto',
    borderRadius: '50%',
    border: '5px solid #0066FF',
    overflow: 'hidden',
    boxShadow: '0 8px 32px rgba(0, 102, 255, 0.25)',
    background: 'rgba(255, 255, 255, 0.5)',
    backdropFilter: 'blur(8px)',
  }}>
    <img 
      src={player.photoUrl} 
      crossOrigin="anonymous"
      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
    />
  </div>
  
  {/* Player Name */}
  <h1 style={{
    fontSize: 52,
    fontWeight: 900,
    textAlign: 'center',
    color: '#1C1C1E',
    margin: '24px 0 12px',
    letterSpacing: '-0.02em',
  }}>
    {player.name}
  </h1>
  
  {/* Team Name */}
  <p style={{
    fontSize: 20,
    fontWeight: 600,
    textAlign: 'center',
    color: '#6B7280',
    marginBottom: 40,
  }}>
    {player.teamName}
  </p>
  
  {/* Stats Grid - Glass Cards */}
  <div style={{ 
    display: 'flex', 
    justifyContent: 'center', 
    gap: 20, 
    padding: '0 60px',
  }}>
    <div style={{
      background: 'rgba(255, 255, 255, 0.4)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      borderRadius: 16,
      padding: '20px 28px',
      textAlign: 'center',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
      minWidth: 100,
    }}>
      <div style={{ fontSize: 36, fontWeight: 900, color: '#0066FF' }}>
        {player.goals}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#6B7280', marginTop: 4 }}>
        Goals
      </div>
    </div>
    
    <div style={{
      background: 'rgba(255, 255, 255, 0.4)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      borderRadius: 16,
      padding: '20px 28px',
      textAlign: 'center',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
      minWidth: 100,
    }}>
      <div style={{ fontSize: 36, fontWeight: 900, color: '#9580FF' }}>
        {player.assists}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#6B7280', marginTop: 4 }}>
        Assists
      </div>
    </div>
    
    <div style={{
      background: 'rgba(255, 255, 255, 0.4)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(255, 255, 255, 0.3)',
      borderRadius: 16,
      padding: '20px 28px',
      textAlign: 'center',
      boxShadow: '0 4px 20px rgba(0, 0, 0, 0.05)',
      minWidth: 100,
    }}>
      <div style={{ fontSize: 36, fontWeight: 900, color: '#D4AF37' }}>
        {player.rating}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: '#6B7280', marginTop: 4 }}>
        Rating
      </div>
    </div>
  </div>
  
  {/* Match Info Footer */}
  <div style={{
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 14,
    color: '#9CA3AF',
    fontWeight: 500,
  }}>
    {player.matchDate} • vs {player.opponent}
  </div>
</div>
```

### Player of the Week Poster
Recognizes consistent excellence across multiple matches in a week with full SS League branding.

**Key Data Points:**
- SS League logo and branding (mandatory)
- Player name, team, and photo
- Week date range or week number
- Aggregate stats from all matches in the week
- Number of matches played
- Average rating or total points

**Design Differences:**
- Landscape format (1200×630) for better social media thumbnail
- "WEEK X" or date range badge
- Comparison stats showing improvement/consistency
- Multiple match indicators
- Vision OS-inspired glass effect matching website design

**Design Pattern:**
```jsx
<div style={{
  width: 1200,
  height: 630,
  background: 'linear-gradient(135deg, rgba(245, 245, 247, 0.98) 0%, rgba(255, 255, 255, 0.98) 100%)',
  position: 'relative',
  fontFamily: '"Outfit", -apple-system, BlinkMacSystemFont, sans-serif',
  display: 'flex',
  padding: 40,
}}>
  {/* Vision OS Glow - Top Right */}
  <div style={{
    position: 'absolute',
    width: 450,
    height: 450,
    top: -150,
    right: -150,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(0, 102, 255, 0.12), transparent 70%)',
    filter: 'blur(60px)'
  }} />
  
  {/* Vision OS Glow - Bottom Left */}
  <div style={{
    position: 'absolute',
    width: 400,
    height: 400,
    bottom: -120,
    left: -120,
    borderRadius: '50%',
    background: 'radial-gradient(circle, rgba(149, 128, 255, 0.1), transparent 70%)',
    filter: 'blur(60px)'
  }} />
  
  {/* SS League Logo & Branding - Top Left */}
  <div style={{
    position: 'absolute',
    top: 28,
    left: 32,
    display: 'flex',
    alignItems: 'center',
    gap: 12,
    zIndex: 10,
  }}>
    <div style={{
      width: 48,
      height: 48,
      borderRadius: 12,
      overflow: 'hidden',
      background: '#ffffff',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.08)',
      padding: 5,
    }}>
      <img 
        src="/logo.png" 
        alt="SS League"
        crossOrigin="anonymous"
        style={{ 
          width: '100%', 
          height: '100%', 
          objectFit: 'contain' 
        }}
      />
    </div>
    <div style={{
      display: 'flex',
      flexDirection: 'column',
    }}>
      <span style={{
        fontSize: 19,
        fontWeight: 700,
        background: 'linear-gradient(90deg, #0066FF, #9580FF)',
        WebkitBackgroundClip: 'text',
        backgroundClip: 'text',
        color: 'transparent',
        WebkitTextFillColor: 'transparent',
        letterSpacing: '-0.02em',
      }}>
        SS League
      </span>
      <span style={{
        fontSize: 10,
        color: '#6B7280',
        fontWeight: 500,
      }}>
        Auction Platform
      </span>
    </div>
  </div>
  
  {/* Left Side - Player Photo */}
  <div style={{
    flex: '0 0 380px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  }}>
    {/* Week Badge */}
    <div style={{
      background: 'linear-gradient(135deg, #0066FF, #9580FF)',
      color: '#ffffff',
      padding: '10px 28px',
      borderRadius: 12,
      fontSize: 15,
      fontWeight: 700,
      letterSpacing: 2,
      marginBottom: 24,
      boxShadow: '0 4px 16px rgba(0, 102, 255, 0.25)',
    }}>
      🏆 WEEK {weekNumber}
    </div>
    
    {/* Player Photo */}
    <div style={{
      width: 240,
      height: 240,
      borderRadius: '50%',
      border: '5px solid #0066FF',
      overflow: 'hidden',
      boxShadow: '0 8px 32px rgba(0, 102, 255, 0.25)',
      background: 'rgba(255, 255, 255, 0.5)',
      backdropFilter: 'blur(8px)',
    }}>
      <img 
        src={player.photoUrl} 
        crossOrigin="anonymous"
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
    </div>
  </div>
  
  {/* Right Side - Player Info & Stats */}
  <div style={{
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    paddingLeft: 40,
    zIndex: 5,
  }}>
    {/* Title Badge */}
    <div style={{
      fontSize: 14,
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: 2.5,
      color: '#0066FF',
      marginBottom: 12,
    }}>
      ⭐ PLAYER OF THE WEEK
    </div>
    
    {/* Player Name */}
    <h1 style={{
      fontSize: 48,
      fontWeight: 900,
      color: '#1C1C1E',
      margin: '0 0 8px 0',
      letterSpacing: '-0.02em',
      lineHeight: 1.1,
    }}>
      {player.name}
    </h1>
    
    {/* Team Name */}
    <p style={{
      fontSize: 18,
      fontWeight: 600,
      color: '#6B7280',
      marginBottom: 28,
    }}>
      {player.teamName} • {player.matchesPlayed} Matches
    </p>
    
    {/* Stats Grid */}
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: 12,
      maxWidth: 520,
    }}>
      <div style={{
        background: 'rgba(255, 255, 255, 0.4)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        borderRadius: 12,
        padding: '16px 12px',
        textAlign: 'center',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)',
      }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#0066FF' }}>
          {player.totalGoals}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginTop: 4 }}>
          Goals
        </div>
      </div>
      
      <div style={{
        background: 'rgba(255, 255, 255, 0.4)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        borderRadius: 12,
        padding: '16px 12px',
        textAlign: 'center',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)',
      }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#9580FF' }}>
          {player.totalAssists}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginTop: 4 }}>
          Assists
        </div>
      </div>
      
      <div style={{
        background: 'rgba(255, 255, 255, 0.4)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        borderRadius: 12,
        padding: '16px 12px',
        textAlign: 'center',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)',
      }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#D4AF37' }}>
          {player.avgRating}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginTop: 4 }}>
          Avg Rating
        </div>
      </div>
      
      <div style={{
        background: 'rgba(255, 255, 255, 0.4)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.3)',
        borderRadius: 12,
        padding: '16px 12px',
        textAlign: 'center',
        boxShadow: '0 4px 16px rgba(0, 0, 0, 0.05)',
      }}>
        <div style={{ fontSize: 28, fontWeight: 900, color: '#FF2D55' }}>
          {player.totalPoints}
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#6B7280', marginTop: 4 }}>
          Points
        </div>
      </div>
    </div>
    
    {/* Date Range */}
    <div style={{
      marginTop: 20,
      fontSize: 13,
      color: '#9CA3AF',
      fontWeight: 500,
    }}>
      {weekStartDate} - {weekEndDate}
    </div>
  </div>
</div>
```

**Technical Considerations:**
```jsx
// Automated selection logic (example)
const getPlayerOfTheWeek = (weekNumber: number) => {
  const weekMatches = matches.filter(m => m.week === weekNumber);
  const playerStats = aggregatePlayerStats(weekMatches);
  
  // Rank by total points, goals, or custom scoring system
  return playerStats.sort((a, b) => b.totalPoints - a.totalPoints)[0];
};

// Generate poster automatically at week end
const generateWeeklyPoster = async () => {
  const player = getPlayerOfTheWeek(currentWeek);
  const dataUrl = await htmlToImage.toPng(weeklyPosterRef.current);
  
  // Auto-post to social media or notify admins
  await shareToSocial(dataUrl, {
    caption: `🏆 Player of the Week ${currentWeek}: ${player.name}!`
  });
};
```

### Automation & Scheduling
For Player of the Week posters, consider implementing:
- **Cron Jobs**: Automatically generate and post every Sunday at 8 PM
- **Admin Approval Queue**: Generate draft, allow admin to review before posting
- **Historical Archive**: Store all recognition posters in a gallery for players to revisit

Summary Checklist for Porting
If you are moving this feature to a new website, make sure you:

 Install html-to-image
 Create a hidden wrapper <div style={{ position: 'absolute', left: '-9999px' }}>
 Build a fixed-dimension (e.g., 800x600) snapshot component using inline styles only.
 Embed <link> tags for your custom fonts inside the snapshot.
 Add crossOrigin="anonymous" to all <img> tags.
 Use htmlToImage.toPng(ref) to trigger the capture.
 For Player of Day/Week: Implement selection logic based on performance metrics
 Consider automation for weekly poster generation and social media posting

## SS League Brand Consistency Checklist

**MANDATORY ELEMENTS:**
 Include SS League logo (`/logo.png`) in top-left corner of every poster
 Logo must be in white rounded container (48-56px) with shadow
 Brand text "SS League" with gradient (linear-gradient(90deg, #0066FF, #9580FF))
 Subtitle "Auction Platform" in subtle gray (#6B7280)

**COLOR PALETTE:**
 Use brand primary blue (#0066FF) for main accents, borders, and CTAs
 Use secondary purple (#9580FF) for complementary accents and gradients
 Use golden (#D4AF37) for awards, ratings, and achievements
 Light backgrounds: linear-gradient(135deg, rgba(245, 245, 247, 0.98), rgba(255, 255, 255, 0.98))

**DESIGN SYSTEM:**
 Vision OS-inspired glow orbs with brand colors (opacity 0.1-0.15, blur 60px)
 Glass morphism matching website: rgba(255, 255, 255, 0.4) with backdrop-filter: blur(8px)
 Border radius: 12-16px for cards, 12-14px for logo container
 Box shadows: 0 4px 16px rgba(0, 0, 0, 0.05-0.08)

**TYPOGRAPHY:**
 Use Outfit font (Google Fonts) weights 400-900
 Apply letter-spacing: -0.02em to headings
 Enable antialiasing: -webkit-font-smoothing: antialiased
 Brand gradient text for "SS League" branding

**TECHNICAL:**
 All external images must have crossOrigin="anonymous"
 Logo must load from /logo.png with proper CORS headers
 Test on both light and dark mode if applicable
 Verify renders at 2x pixel ratio for high-resolution exports