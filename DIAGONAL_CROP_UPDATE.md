# Diagonal Crop Update

## Summary
Added diagonal sides to all player photo crop areas in the Poster Studio component.

## Changes Made

### Modified File
- `components/PosterDesigns.tsx`

### What Changed
All player photo crop containers now use CSS `clip-path` with a polygon shape to create diagonal edges:

```css
clipPath: 'polygon(10% 0%, 100% 0%, 90% 100%, 0% 100%)'
```

### Visual Effect
The polygon creates a parallelogram-like shape with:
- **Top-left**: Diagonal edge (starts at 10% from left)
- **Top-right**: Straight edge (at 100%)
- **Bottom-right**: Diagonal edge (ends at 90% from left)
- **Bottom-left**: Straight edge (at 0%)

This gives the player photos a modern, dynamic look with slanted sides.

### Components Updated
1. **PlayerOfWeekDesign** (2 photo containers)
2. **PlayerOfDayDesign** (1 photo container)
3. **SinglePlayerDesign** (1 photo container)

### Customization
To adjust the diagonal angle, modify the percentage values in the `clip-path`:
- **Less diagonal**: Change `10%` to `5%` and `90%` to `95%`
- **More diagonal**: Change `10%` to `15%` and `90%` to `85%`
- **Opposite direction**: Swap the values to flip the diagonal

### Testing
To see the changes:
1. Navigate to: `http://localhost:3000/dashboard/committee/team-management/player-stats-by-round`
2. Click "🎨 Poster Studio" button
3. Select any theme (Golden Boot, Golden Ball, Player of Day, etc.)
4. The player photos will now have diagonal sides

## Technical Details

The `clip-path` property with a polygon creates a clipping region that only shows the portion of the element inside the shape. The coordinates are defined as percentages of the element's dimensions, making it responsive and scalable.

**Syntax**: `polygon(x1 y1, x2 y2, x3 y3, x4 y4)`
- Point 1 (top-left): 10% 0%
- Point 2 (top-right): 100% 0%
- Point 3 (bottom-right): 90% 100%
- Point 4 (bottom-left): 0% 100%

The points are connected in order to form the shape.
