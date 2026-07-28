# Team Logo Positioning - Implementation Guide

## Overview
All team logos should use the positioning settings stored in the database to ensure they fill their containers without white space. This applies to **both circle and square containers**.

## Database Fields

Each team has 6 positioning fields:

### Circle Containers
- `logo_position_x_circle`: X-axis position (0-100%)
- `logo_position_y_circle`: Y-axis position (0-100%)
- `logo_scale_circle`: Zoom/scale (0.5-2.0)

### Square Containers
- `logo_position_x_square`: X-axis position (0-100%)
- `logo_position_y_square`: Y-axis position (0-100%)
- `logo_scale_square`: Zoom/scale (0.5-2.0)

## How to Apply Logo Positioning

### Method 1: Using the TeamLogo Component (Recommended)

```tsx
import { TeamLogo } from '@/components/TeamLogo';

// For square containers (default)
<div className="w-12 h-12 rounded-xl overflow-hidden">
  <TeamLogo
    src={team.logo_url}
    alt={team.team_name}
    team={team}
    shape="square"
    className="w-full h-full"
    fallback={<span>{team.team_code}</span>}
  />
</div>

// For circle containers
<div className="w-12 h-12 rounded-full overflow-hidden">
  <TeamLogo
    src={team.logo_url}
    alt={team.team_name}
    team={team}
    shape="circle"
    className="w-full h-full"
    fallback={<span>{team.team_code}</span>}
  />
</div>
```

### Method 2: Using Inline Styles (When component can't be used)

```tsx
import { getTeamLogoStyle } from '@/components/TeamLogo';

// For square containers
<img
  src={team.logo_url}
  alt={team.team_name}
  className="w-full h-full object-cover"
  style={getTeamLogoStyle(team, 'square')}
/>

// For circle containers
<img
  src={team.logo_url}
  alt={team.team_name}
  className="w-full h-full object-cover"
  style={getTeamLogoStyle(team, 'circle')}
/>
```

### Method 3: Manual Implementation (Direct CSS)

```tsx
// For SQUARE containers (rounded rectangles)
<img
  src={team.logo_url}
  alt={team.team_name}
  className="w-full h-full object-cover"
  style={{
    objectPosition: `${team.logo_position_x_square ?? 50}% ${team.logo_position_y_square ?? 50}%`,
    transform: `scale(${team.logo_scale_square ?? 1})`,
    transformOrigin: `${team.logo_position_x_square ?? 50}% ${team.logo_position_y_square ?? 50}%`,
  }}
/>

// For CIRCLE containers (rounded-full)
<img
  src={team.logo_url}
  alt={team.team_name}
  className="w-full h-full object-cover"
  style={{
    objectPosition: `${team.logo_position_x_circle ?? 50}% ${team.logo_position_y_circle ?? 50}%`,
    transform: `scale(${team.logo_scale_circle ?? 1})`,
    transformOrigin: `${team.logo_position_x_circle ?? 50}% ${team.logo_position_y_circle ?? 50}%`,
  }}
/>
```

## Important CSS Rules

### 1. Use `object-cover` instead of `object-contain`
```tsx
// ❌ WRONG - Creates white space
className="object-contain"

// ✅ CORRECT - Fills container
className="object-cover"
```

### 2. Use `w-full h-full`
```tsx
// ❌ WRONG - Logo won't fill container
className="max-w-full max-h-full"

// ✅ CORRECT - Logo fills entire container
className="w-full h-full object-cover"
```

### 3. Container must have `overflow-hidden`
```tsx
// ✅ CORRECT
<div className="w-12 h-12 rounded-xl overflow-hidden">
  <img src={logo} className="w-full h-full object-cover" style={...} />
</div>
```

## Container Shape Detection

### Square Containers (use square settings)
- `rounded`, `rounded-lg`, `rounded-xl`, `rounded-2xl`
- Rectangular shapes
- Card thumbnails

### Circle Containers (use circle settings)
- `rounded-full`
- Avatar-style displays
- Circular badges

## Examples by Use Case

### 1. Team List/Grid (Square containers)
```tsx
<div className="h-10 w-10 rounded-xl bg-slate-50 border overflow-hidden">
  <img 
    src={team.logo_url} 
    alt={team.team_name}
    className="w-full h-full object-cover"
    style={{
      objectPosition: `${team.logo_position_x_square ?? 50}% ${team.logo_position_y_square ?? 50}%`,
      transform: `scale(${team.logo_scale_square ?? 1})`,
      transformOrigin: `${team.logo_position_x_square ?? 50}% ${team.logo_position_y_square ?? 50}%`,
    }}
  />
</div>
```

### 2. Team Header/Profile (Large square)
```tsx
<div className="w-16 h-16 rounded-2xl bg-slate-50 border overflow-hidden">
  <img 
    src={team.logo_url} 
    alt={team.team_name}
    className="w-full h-full object-cover"
    style={{
      objectPosition: `${team.logo_position_x_square ?? 50}% ${team.logo_position_y_square ?? 50}%`,
      transform: `scale(${team.logo_scale_square ?? 1})`,
      transformOrigin: `${team.logo_position_x_square ?? 50}% ${team.logo_position_y_square ?? 50}%`,
    }}
  />
</div>
```

### 3. Team Avatar (Circle)
```tsx
<div className="w-12 h-12 rounded-full bg-slate-50 border overflow-hidden">
  <img 
    src={team.logo_url} 
    alt={team.team_name}
    className="w-full h-full object-cover"
    style={{
      objectPosition: `${team.logo_position_x_circle ?? 50}% ${team.logo_position_y_circle ?? 50}%`,
      transform: `scale(${team.logo_scale_circle ?? 1})`,
      transformOrigin: `${team.logo_position_x_circle ?? 50}% ${team.logo_position_y_circle ?? 50}%`,
    }}
  />
</div>
```

### 4. Standings Table (Small square)
```tsx
<div className="w-8 h-8 rounded bg-white border overflow-hidden">
  <img 
    src={team.logo_url} 
    alt={team.team_name}
    className="w-full h-full object-cover"
    style={{
      objectPosition: `${team.logo_position_x_square ?? 50}% ${team.logo_position_y_square ?? 50}%`,
      transform: `scale(${team.logo_scale_square ?? 1})`,
      transformOrigin: `${team.logo_position_x_square ?? 50}% ${team.logo_position_y_square ?? 50}%`,
    }}
  />
</div>
```

## Migration Checklist

When updating an existing logo display:

- [ ] Identify the container shape (circle or square)
- [ ] Change `object-contain` to `object-cover`
- [ ] Change `max-w-full max-h-full` to `w-full h-full`
- [ ] Add `overflow-hidden` to container
- [ ] Add positioning style (use correct shape variant)
- [ ] Ensure team object includes position fields
- [ ] Test with different logo aspect ratios (portrait, landscape, square)

## TypeScript Type Definition

```typescript
interface TeamWithLogo {
  id: string;
  team_name: string;
  team_code: string;
  logo_url?: string;
  
  // Circle positioning
  logo_position_x_circle?: number;
  logo_position_y_circle?: number;
  logo_scale_circle?: number;
  
  // Square positioning
  logo_position_x_square?: number;
  logo_position_y_square?: number;
  logo_scale_square?: number;
}
```

## Common Mistakes to Avoid

### ❌ Using object-contain
```tsx
// This creates white space
<img className="object-contain" />
```

### ❌ Not specifying shape
```tsx
// Which settings should this use?
<img style={getTeamLogoStyle(team)} /> // Missing shape parameter
```

### ❌ Missing overflow-hidden
```tsx
// Logo might overflow container
<div className="w-12 h-12 rounded-xl">
  <img className="w-full h-full object-cover" />
</div>
```

### ✅ Correct Implementation
```tsx
<div className="w-12 h-12 rounded-xl overflow-hidden">
  <img 
    className="w-full h-full object-cover"
    style={getTeamLogoStyle(team, 'square')}
  />
</div>
```

## Files Already Updated

✅ `app/dashboard/superadmin/teams/page.tsx` - Teams list (desktop & mobile)
✅ `app/dashboard/superadmin/teams/[id]/page.tsx` - Team detail header
✅ `components/TeamLogo.tsx` - Reusable component created

## Files That Need Updating

Review these files and apply positioning where team logos are displayed:
- `app/season/current/page.tsx` - Season standings
- `app/teams/[id]/page.tsx` - Public team pages
- `app/dashboard/team/*` - Team dashboard pages
- `components/FixtureShareButton.tsx` - Match fixtures
- Any other components showing team logos

## Testing

After implementing logo positioning:

1. **Test with different logo shapes**:
   - Portrait logos (tall)
   - Landscape logos (wide)
   - Square logos

2. **Test in different containers**:
   - Small icons (8x8, 10x10, 12x12)
   - Medium thumbnails (16x16, 20x20)
   - Large headers (32x32, 48x48, 64x64)

3. **Test both shapes**:
   - Circle containers (`rounded-full`)
   - Square containers (`rounded-xl`, etc.)

4. **Verify no white space**:
   - Logos should completely fill their containers
   - No gaps or padding issues
   - Proper cropping based on settings

## Superadmin Adjustment

Superadmins can adjust logo positioning via:
1. **Superadmin → Teams** → Select a team
2. Click **"Adjust Logo"** button
3. Use Circle/Square mode switcher
4. Drag to position, zoom slider to scale
5. Save for each shape independently

This ensures logos look perfect in all containers across the application!
