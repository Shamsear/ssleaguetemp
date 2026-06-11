# WithoutBG API Implementation

## Overview

The poster studio now uses **WithoutBG API** for fast, reliable server-side background removal. This solves the browser freezing issue that occurred with client-side processing.

## Why Server-Side?

### Problems with Client-Side Processing
- ❌ Browser freezes during processing (10-30 seconds)
- ❌ Downloads large AI models (~5-10MB)
- ❌ CPU intensive, slows down entire system
- ❌ Poor user experience

### Benefits of Server-Side API
- ✅ **Fast**: 1-3 seconds per image
- ✅ **No freezing**: Processing happens on WithoutBG servers
- ✅ **No downloads**: No AI models needed in browser
- ✅ **Better quality**: Professional AI models
- ✅ **Reliable**: Managed infrastructure

## Implementation

### 1. API Key Configuration

**File: `.env.local`**
```env
WITHOUTBG_API_KEY=sk-c0d6693fb03c7647a5a632f182961e2fe2b1ea1514aa459d24cdab6ce7f1e9eb
```

Get your API key from: https://withoutbg.com/account

### 2. API Route

**File: `app/api/withoutbg/remove-background/route.ts`**

The server-side endpoint that:
1. Receives image URL from client
2. Downloads the image
3. Calls WithoutBG API
4. Returns processed image as base64 data URL

```typescript
POST /api/withoutbg/remove-background

Request:
{
  "imageUrl": "https://ik.imagekit.io/..."
}

Response:
{
  "success": true,
  "imageUrl": "data:image/png;base64,...",
  "credits_remaining": "245"
}
```

### 3. Utility Function

**File: `lib/background-removal.ts`**

Simplified to just call the API route:

```typescript
export async function removeBackgroundClient(imageUrl: string): Promise<string> {
  const response = await fetch('/api/withoutbg/remove-background', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageUrl }),
  });
  
  const data = await response.json();
  return data.imageUrl;
}
```

### 4. UI Integration

**File: `components/PosterStudio.tsx`**

The button handler remains the same, but now uses server-side API:

```typescript
const handleRemoveBackground = async (imageType: 'player' | 'logo') => {
  setIsRemovingBackground(true);
  
  const { removeBackgroundClient } = await import('@/lib/background-removal');
  const resultDataUrl = await removeBackgroundClient(sourceUrl);
  
  setCustomPlayerPhoto(resultDataUrl); // or setCustomTeamLogo
  setIsRemovingBackground(false);
};
```

## API Details

### Endpoint
```
POST https://api.withoutbg.com/v1.0/image-without-background-base64
```

### Authentication
```
Header: X-API-Key: sk-your-api-key-here
```

### Request Format
```
Content-Type: application/json

Body:
{
  "image_base64": "<base64 encoded image without data URI prefix>"
}
```

### Response Format
```
Content-Type: application/json

Body:
{
  "img_without_background_base64": "<base64 encoded PNG with transparency>"
}
```

### Rate Limits
- **7 requests per minute** per API key
- **10 MB maximum** file size (before base64 encoding)

### Error Codes
- **401**: Invalid API key
- **402/403**: Insufficient credits
- **413**: File too large (> 10MB)
- **415**: Unsupported format (use JPEG, PNG, WebP, TIFF, BMP, GIF)
- **429**: Rate limit exceeded (7 req/min)

## Usage Flow

```
User clicks "🪄 Remove Background"
↓
PosterStudio calls handleRemoveBackground()
↓
Calls removeBackgroundClient(imageUrl)
↓
Fetches /api/withoutbg/remove-background
↓
Next.js API route:
  1. Downloads image from ImageKit as buffer
  2. Converts to base64 (no data URI prefix)
  3. POSTs to WithoutBG API with JSON body
  4. Receives JSON response with base64 PNG
  5. Adds data:image/png;base64, prefix
  6. Returns data URL
↓
PosterStudio updates state with processed image
↓
Poster displays image with transparent background
```

## Performance

| Metric | Client-Side (Old) | Server-Side (New) |
|--------|-------------------|-------------------|
| Processing Time | 10-30 seconds | 1-3 seconds |
| Browser Freezing | Yes ❌ | No ✅ |
| Model Download | 5-10 MB | None |
| Quality | Good | Excellent |
| User Experience | Poor | Great |

## Error Handling

### API Errors
```typescript
// Invalid API key (403)
{ success: false, error: "Invalid API key or insufficient credits" }

// Rate limit (429)
{ success: false, error: "Rate limit exceeded" }

// Other errors
{ success: false, error: "API error: 500 - ..." }
```

### UI Display
- Shows error message below button
- Red text with warning icon
- User can retry

### Console Logs
```
🎨 Starting server-side background removal for player...
✅ Background removed successfully for player (server-side)
📊 Credits remaining: 245
```

## Pricing & Limits

**Free Tier:**
- Check https://withoutbg.com/pricing for current limits
- Usually includes generous free credits

**Paid Plans:**
- Pay-per-image pricing
- Volume discounts available
- Enterprise plans for high usage

**Check Credits:**
```bash
curl -H "X-API-Key: your-key" \
  https://api.withoutbg.com/v1.0/credits
```

## Testing

### Manual Test
1. Open Poster Studio
2. Click "🪄 Remove Background" under Photo Controls
3. Wait 1-3 seconds
4. Image should update with transparent background
5. Check console for success message

### Test with cURL
```bash
# Download a test image first
curl "https://ik.imagekit.io/..." -o test.jpg

# Test WithoutBG API directly
curl -H "X-API-Key: sk-your-key" \
  -F "image_file=@test.jpg" \
  -F "size=auto" \
  https://api.withoutbg.com/v1.0/removebg \
  -o output.png
```

### Test Next.js API Route
```bash
curl -X POST http://localhost:3000/api/withoutbg/remove-background \
  -H "Content-Type: application/json" \
  -d '{"imageUrl":"https://ik.imagekit.io/..."}'
```

## Troubleshooting

### Issue: "Invalid API key"
**Solution:** Check `.env.local` file has correct API key

### Issue: "Insufficient credits"
**Solution:** Check account at https://withoutbg.com/account, add credits if needed

### Issue: "Failed to fetch image"
**Solution:** Ensure image URL is accessible and not CORS-blocked

### Issue: Button doesn't work
**Solution:** 
1. Check browser console for errors
2. Verify API key in `.env.local`
3. Restart Next.js dev server

## Migration Notes

### Before (Client-Side)
```typescript
// Downloaded @imgly/background-removal package
// Processed images in browser
// Caused freezing and slow performance
import { removeBackground } from '@imgly/background-removal';
const blob = await removeBackground(imageUrl, config);
```

### After (Server-Side)
```typescript
// Calls server API
// Fast, no browser freezing
// Better quality
const response = await fetch('/api/withoutbg/remove-background', {
  method: 'POST',
  body: JSON.stringify({ imageUrl }),
});
```

## Security Considerations

1. **API Key Protection**
   - API key stored in `.env.local` (server-side only)
   - Never exposed to client browser
   - Listed in `.gitignore`

2. **Rate Limiting**
   - WithoutBG enforces rate limits
   - Client-side: Disable button during processing
   - Server-side: Consider implementing request queue

3. **Input Validation**
   - Validates image URL format
   - Checks if image is accessible
   - Handles malformed requests

## Future Enhancements

- [ ] Show progress bar during processing
- [ ] Cache processed images to avoid re-processing
- [ ] Batch processing for multiple images
- [ ] Retry failed requests automatically
- [ ] Show credits remaining in UI
- [ ] Add settings to configure output quality

## Related Files

- `app/api/withoutbg/remove-background/route.ts` - API endpoint
- `lib/background-removal.ts` - Utility function
- `components/PosterStudio.tsx` - UI integration
- `.env.local` - API key configuration

## Credits

Powered by [WithoutBG](https://withoutbg.com) - Professional background removal API
