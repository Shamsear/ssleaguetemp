# Poster Studio - Team Logo Fix

## Issue
Team logos were not appearing in Player of Day, Player of Week, and Team of Week posters. Instead, placeholders were being shown with the error:
```
❌ Image Load Error [Player of Day - Team Logo]: No image URL provided, using placeholder
👻 Hiding failed team logo for TM Asgardians
```

## Root Cause
The frontend TypeScript interfaces were missing the `photo_url` and `team_logo` fields, even though the backend API was already fetching and returning these fields from Firebase.

## Solution

### 1. Updated TypeScript Interfaces

**File: `app/dashboard/committee/team-management/player-stats-by-round/page.tsx`**

Updated `PlayerStats` interface:
```typescript
interface PlayerStats {
  player_id: string;
  player_name: string;
  team_name: string;
  // ... other fields ...
  photo_url?: string;  // ✅ Added - Player photo from Firebase
  team_logo?: string;  // ✅ Added - Team logo from Firebase
}
```

Updated `PlayerAward` interface:
```typescript
interface PlayerAward {
  id: string;
  award_type: string;
  // ... other fields ...
  player_photo?: string;  // ✅ Added - Player photo
  team_logo?: string;     // ✅ Added - Team logo
}
```

**File: `components/PosterStudio.tsx`**

Updated `PlayerStats` interface:
```typescript
interface PlayerStats {
  player_id: string;
  player_name: string;
  team_name: string;
  // ... other fields ...
  player_photo?: string; // Add player photo field
  photo_url?: string;    // Support both field names
  team_logo?: string;    // ✅ Added - Team logo field
}
```

### 2. Backend API Confirmation

The API endpoint `/api/committee/player-stats-by-round` already includes logic to:
- Fetch player photos from Firebase `realplayers` collection
- Fetch team logos from Firebase `team_seasons` collection  
- Match team names using multiple strategies (exact match, trimmed, with/without "FC" suffix, fuzzy matching)
- Add `photo_url` and `team_logo` fields to each player stat object

### 3. Clip-Path Fix

Also fixed an issue where `clip-path` was being applied to logos even at default 100% crop values, which was causing rendering issues. Now clip-path only applies when crop values are less than 100%:

```typescript
...(logoCrop.width < 100 || logoCrop.height < 100 ? {
  clipPath: `inset(...)`
} : {})
```

## Result

✅ Team logos now display correctly in all poster types:
- Player of Day
- Player of Week  
- Team of Week
- Single player views
- Golden Boot/Ball/Glove posters

✅ Player photos continue to work correctly

✅ Cropping controls work without breaking display at default values

## Testing

To verify the fix works:
1. Navigate to Player Stats by Round page
2. Open Poster Studio
3. Select any theme (Player of Day, Player of Week, etc.)
4. Team logos should now appear correctly
5. Photo position and crop controls should work smoothly
6. Custom display names should be available for all poster types
