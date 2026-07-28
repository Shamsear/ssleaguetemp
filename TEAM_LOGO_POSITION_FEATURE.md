# Team Logo Position Adjustment Feature

## Overview
Added a comprehensive logo positioning system for team logos, similar to the player photo positioning feature. This allows superadmins to adjust logo position and scale **separately for both circle and square containers** to ensure consistent display across all logo containers, regardless of the original image aspect ratio (portrait/landscape).

## Features Implemented

### 1. Logo Download Functionality
- **Download Button**: Added in the team edit modal
- **Location**: Under the logo preview in the edit modal
- **Functionality**: Downloads the current logo with automatic filename (`{TEAM_CODE}-logo.{extension}`)
- **Error Handling**: Graceful fallback with user-friendly messages

### 2. Logo Position Adjustment Tool
- **Adjust Logo Button**: Added to the team detail page header
- **Interactive Modal**: Full-featured drag-and-drop interface with **Circle and Square mode switching**
  - **Left Panel**: Source image with draggable focus pointer
  - **Right Panel**: Live preview of the cropped/positioned logo (shape changes based on mode)
  - **Shape Switcher**: Toggle between Circle and Square mode with independent settings
  - **Controls**: 
    - Drag the image to adjust X/Y position (0-100%)
    - Zoom slider to scale the logo (0.5x to 2x)
    - Reset button to return to center position
    - Switch between Circle and Square modes (each saves separately)
  - **Real-time Preview**: See changes immediately before saving

### 3. Database Updates
- **New Fields Added to Teams**:
  - **Circle Container**:
    - `logo_position_x_circle`: X-axis position percentage (0-100)
    - `logo_position_y_circle`: Y-axis position percentage (0-100)
    - `logo_scale_circle`: Zoom/scale multiplier (0.5-2.0)
  - **Square Container**:
    - `logo_position_x_square`: X-axis position percentage (0-100)
    - `logo_position_y_square`: Y-axis position percentage (0-100)
    - `logo_scale_square`: Zoom/scale multiplier (0.5-2.0)

### 4. Consistent Logo Display
- **Applied Styling**: All team logo containers now use the appropriate position settings based on their shape
- **CSS Transforms**: 
  ```css
  /* For Circle containers */
  object-position: logo_position_x_circle% logo_position_y_circle%
  transform: scale(logo_scale_circle)
  transform-origin: logo_position_x_circle% logo_position_y_circle%
  
  /* For Square containers */
  object-position: logo_position_x_square% logo_position_y_square%
  transform: scale(logo_scale_square)
  transform-origin: logo_position_x_square% logo_position_y_square%
  ```
- **Fallback**: Defaults to center (50%, 50%) with 1x scale if not set

## Files Modified

### Frontend
1. **`app/dashboard/superadmin/teams/[id]/page.tsx`**
   - Added state management for logo positioning and shape mode
   - Added `handleDownloadLogo()` function
   - Added `openLogoAdjustModal()` function (loads circle settings by default)
   - Updated `saveLogoPosition()` function to save circle or square settings separately
   - Added `getLogoStyle()` helper function
   - Added "Adjust Logo" button in header
   - Added download button in edit modal
   - Added full logo adjustment modal with drag-and-drop interface
   - Added Circle/Square mode switcher in modal
   - Updated logo display to use position settings
   - Added imports: `Download`, `Move`, `Maximize2`, `Circle`, `Square` icons

2. **`app/dashboard/superadmin/page.tsx`**
   - Updated "Teams Directory" card description to mention logo positioning tools

### Backend
3. **`app/api/superadmin/teams/[teamId]/route.ts`**
   - Updated PATCH endpoint to accept logo position fields for both circle and square
   - Added validation for all 6 position fields (3 for circle, 3 for square)
   - Updates Firebase teams collection with position data for both shapes

## Usage Instructions

### For Superadmins:

#### Download Current Logo:
1. Navigate to **Superadmin → Teams** → Select a team
2. Click **Edit Team** button
3. Find the **"Download Current Logo"** button below the logo preview
4. Click to download (file named automatically as `TEAMCODE-logo.ext`)

#### Adjust Logo Position:
1. Navigate to **Superadmin → Teams** → Select a team
2. Click the **"Adjust Logo"** button (amber/orange button in header)
3. **In the modal:**
   - **Choose Shape Mode**: Click "Circle" or "Square" button to switch between modes
   - **Left side**: Drag anywhere on the source image to set the focus point
   - **Right side**: See live preview with the selected container shape
   - Use the **zoom slider** to scale the logo (smaller/larger)
   - Click **"Reset to Center"** to return to default position
   - **Switch modes and adjust separately** - each shape saves independently!
4. Click **"Save Adjustment"** when satisfied with current shape
5. Repeat for the other shape if needed
6. Logos will now display consistently in both circle and square containers

### Why This Is Useful:
- **Portrait logos** (tall/vertical) can be repositioned differently for circles vs squares
- **Landscape logos** (wide/horizontal) may need different cropping for each shape
- **Circle containers** often need different positioning than square containers
- **Independent control** means you can perfect the logo for both display types
- **Consistent branding** across all team displays (lists, cards, headers)

## Technical Details

### Position Storage (Per Shape)
```typescript
{
  // Circle containers
  logo_position_x_circle: 50,    // 0-100 percentage
  logo_position_y_circle: 50,    // 0-100 percentage
  logo_scale_circle: 1,          // 0.5-2.0 multiplier
  
  // Square containers  
  logo_position_x_square: 50,    // 0-100 percentage
  logo_position_y_square: 50,    // 0-100 percentage
  logo_scale_square: 1,          // 0.5-2.0 multiplier
}
```

### CSS Application
```typescript
// For circle containers
style={{
  objectPosition: `${logo_position_x_circle}% ${logo_position_y_circle}%`,
  transform: `scale(${logo_scale_circle})`,
  transformOrigin: `${logo_position_x_circle}% ${logo_position_y_circle}%`,
}}

// For square containers
style={{
  objectPosition: `${logo_position_x_square}% ${logo_position_y_square}%`,
  transform: `scale(${logo_scale_square})`,
  transformOrigin: `${logo_position_x_square}% ${logo_position_y_square}%`,
}}
```

### Default Values
- Position X: 50% (center)
- Position Y: 50% (center)
- Scale: 1 (original size)
- Applied to both circle and square independently

## Benefits

✅ **Separate Circle/Square Adjustments**: Perfect the logo for both container types  
✅ **Consistent Display**: All logos look uniform regardless of original aspect ratio  
✅ **Professional Appearance**: Logos are properly framed in both shapes  
✅ **Easy Adjustment**: Intuitive drag-and-drop interface with mode switcher  
✅ **Live Preview**: See changes in real container shape before saving  
✅ **Flexible**: Works with portrait, landscape, and square logos  
✅ **Download Option**: Save current logos before replacing  
✅ **Independent Settings**: Circle and square settings don't affect each other

## Future Enhancements (Optional)

- [ ] Add preset positions (top-left, top-center, center, etc.) for each shape
- [ ] Bulk logo position adjustment for multiple teams
- [ ] Logo history/version tracking
- [ ] Auto-detect optimal position for logos
- [ ] Support for multiple logo variants (dark mode, light mode)
- [ ] Copy settings from circle to square (or vice versa)

## Status: ✅ COMPLETE

The feature is fully implemented and ready to use. Superadmins can now:
1. Download team logos
2. Adjust logo position and scale separately for circle and square containers
3. Switch between circle and square modes in real-time
4. Preview changes for each shape before saving
5. Ensure perfect logo display in all container types
