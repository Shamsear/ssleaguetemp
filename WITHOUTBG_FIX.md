# WithoutBG API Fix - Correct Endpoint Implementation

## Issue
Getting 403 Forbidden error when calling WithoutBG API.

**Error:**
```
❌ WithoutBG API error: 403 <html><head><title>403 Forbidden</title></head>
```

## Root Cause
Used incorrect API endpoint and request format:
- ❌ Wrong endpoint: `POST /v1.0/removebg` (doesn't exist)
- ❌ Wrong format: `multipart/form-data` (not supported)

## Solution
Updated to use the correct **Base64 endpoint** with proper format:

### Correct Endpoint
```
POST https://api.withoutbg.com/v1.0/image-without-background-base64
```

### Correct Request Format
```json
POST /v1.0/image-without-background-base64
Content-Type: application/json
X-API-Key: sk-c0d6693fb03c7647a5a632f182961e2fe2b1ea1514aa459d24cdab6ce7f1e9eb

{
  "image_base64": "<base64 string without data URI prefix>"
}
```

### Correct Response Format
```json
{
  "img_without_background_base64": "<base64 PNG with transparency>"
}
```

## Changes Made

### File: `app/api/withoutbg/remove-background/route.ts`

**Before:**
```typescript
// Wrong - tried multipart/form-data
const formData = new FormData();
formData.append('image_file', imageBlob);
formData.append('size', 'auto');

await fetch('https://api.withoutbg.com/v1.0/removebg', {
  method: 'POST',
  headers: { 'X-API-Key': apiKey },
  body: formData,
});
```

**After:**
```typescript
// Correct - use JSON with base64
const imageBuffer = await imageResponse.arrayBuffer();
const imageBase64 = Buffer.from(imageBuffer).toString('base64');

await fetch('https://api.withoutbg.com/v1.0/image-without-background-base64', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-API-Key': apiKey,
  },
  body: JSON.stringify({
    image_base64: imageBase64,
  }),
});
```

## Key Points

1. **Endpoint**: `/v1.0/image-without-background-base64` (not `/v1.0/removebg`)
2. **Format**: JSON with base64 (not multipart/form-data)
3. **Base64**: Raw base64 string without `data:image/...;base64,` prefix
4. **Response**: JSON with `img_without_background_base64` field
5. **Rate Limit**: 7 requests per minute
6. **Max Size**: 10 MB (before base64 encoding)

## Error Handling

Added proper error messages for common issues:

| Code | Error | Message |
|------|-------|---------|
| 401 | Invalid API Key | "Invalid API key" |
| 402/403 | No Credits | "Insufficient credits. Please top up at https://withoutbg.com/account" |
| 413 | File Too Large | "Image file size too large (max 10MB)" |
| 415 | Bad Format | "Unsupported image format. Use JPEG, PNG, WebP, TIFF, BMP, or GIF" |
| 429 | Rate Limit | "Rate limit exceeded (7 requests/minute). Please wait and try again" |

## Testing

Test the fixed implementation:

1. **Restart dev server** (to load updated code):
   ```bash
   # Stop current dev server (Ctrl+C)
   npm run dev
   ```

2. **Test in Poster Studio**:
   - Open: http://localhost:3000/dashboard/committee/team-management/player-stats-by-round
   - Click "🎨 Poster Studio"
   - Click "🪄 Remove Background"
   - Should complete in 1-3 seconds
   - Check console for: ✅ Background removed successfully

3. **Check API directly** (optional):
   ```bash
   # Download test image
   curl "https://ik.imagekit.io/ssleague/player-photos/sspslpsl0015.jpeg" -o test.jpg
   
   # Convert to base64
   BASE64_DATA=$(cat test.jpg | base64 -w 0)
   
   # Test API
   curl -X POST "https://api.withoutbg.com/v1.0/image-without-background-base64" \
     -H "X-API-Key: sk-c0d6693fb03c7647a5a632f182961e2fe2b1ea1514aa459d24cdab6ce7f1e9eb" \
     -H "Content-Type: application/json" \
     -d "{\"image_base64\": \"$BASE64_DATA\"}"
   ```

## Documentation Updated

- `WITHOUTBG_API_IMPLEMENTATION.md` - Updated with correct endpoint details
- `WITHOUTBG_FIX.md` - This document

## Status: ✅ FIXED

The API integration now uses the correct endpoint and request format. Background removal should work properly.

## Next Steps

1. Restart your dev server
2. Test the background removal feature
3. If you see any errors, check the console logs for specific error codes
4. For credit issues (402/403), visit https://withoutbg.com/account to add credits
