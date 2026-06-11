# Background Removal Setup Guide

## Problem
When ImageKit's background removal transformation fails (usually due to "Extensions limit exceeded"), images need a fallback solution that still removes backgrounds.

## Solution
The system now has a two-tier fallback mechanism with multiple API key support:

1. **Primary**: ImageKit transformation (`tr:e-removedotbg`)
2. **Fallback**: Remove.bg API with automatic key rotation

## How It Works

### Flow:
```
1. Try ImageKit transformation
   ↓ (if fails)
2. Detect error → Call /api/remove-background
   ↓
3. Try Remove.bg API Key #1
   ↓ (if quota exceeded)
4. Try Remove.bg API Key #2
   ↓ (if quota exceeded)
5. Try Remove.bg API Key #3
   ↓
6. Return base64 image with transparent background
   ↓
7. Display image in poster
```

### Error Logs:
```javascript
❌ Image Load Error [Player of Week - Main Photo]
⚠️ ImageKit transformation error detected
🔄 Attempting background removal via API
🔑 Found 3 remove.bg API key(s)
🔑 Trying Key 1/3...
⚠️ Key 1/3 quota exceeded, trying next key...
🔑 Trying Key 2/3...
✅ Background removed successfully using Key 2/3
```

## Setup Instructions

### 1. Get Multiple Remove.bg API Keys

1. Go to https://www.remove.bg/api
2. Sign up for **multiple free accounts** (use different emails)
3. Get API key from each account
4. Free tier includes 50 API calls/month **per account**

**Example:**
- Account 1 (your-email@domain.com): 50 calls/month
- Account 2 (your-email+remove2@domain.com): 50 calls/month  
- Account 3 (your-email+remove3@domain.com): 50 calls/month
- **Total: 150 calls/month for free!**

### 2. Add API Keys to Environment

Open `.env.local` and add **comma-separated** API keys:

```bash
# Single key (50 calls/month)
REMOVE_BG_API_KEY=ANe1J1nK3LHMANtWarGjvY8T

# Multiple keys (150 calls/month with 3 keys)
REMOVE_BG_API_KEY=key1_here,key2_here,key3_here

# Example with real keys:
REMOVE_BG_API_KEY=ANe1J1nK3LHMANtWarGjvY8T,BNf2K2oL4mIzpCouXbsHwZ9U,COf3L3pM5nJaqDpvYctIxA0V
```

### 3. Restart Development Server

```bash
npm run dev
```

## API Key Rotation Logic

The system automatically tries each key in order:
1. **First key**: Tries first API key
2. **If quota exceeded (402 error)**: Automatically tries next key
3. **If all keys exhausted**: Returns error and logs which keys were tried
4. **Success**: Logs which key was used successfully

### Console Output:
```
🔑 Found 3 remove.bg API key(s)
🔄 Removing background for: https://example.com/photo.jpg
🔑 Trying Key 1/3...
❌ Key 1/3 failed: 402 {"errors":[{"title":"Payment Required"}]}
⚠️ Key 1/3 quota exceeded, trying next key...
🔑 Trying Key 2/3...
✅ Background removed successfully using Key 2/3
```

## API Response

**Success**:
```json
{
  "success": true,
  "imageUrl": "data:image/png;base64,...",
  "type": "base64",
  "usedKey": 2,
  "totalKeys": 3
}
```

**All Keys Failed**:
```json
{
  "success": false,
  "error": "Key 3/3 quota exceeded",
  "fallbackUrl": "https://example.com/original.jpg",
  "triedKeys": 3
}
```

## Cost Optimization Strategies

### Free Tier Maximization (Recommended)
- Use 3-5 free accounts = 150-250 images/month
- Email tip: Use `+` addressing (gmail ignores it)
  - `yourname+bg1@gmail.com`
  - `yourname+bg2@gmail.com`
  - All emails go to `yourname@gmail.com`

### Hybrid Approach
- Configure ImageKit properly (primary method)
- Use remove.bg as emergency fallback only
- Monitor usage to stay within free tier

### Paid Plan
- Remove.bg: $0.20 per image (after free tier)
- Subscription: $9/month for 100 images
- Enterprise: Custom pricing

## Monitoring

### Check Quota Usage
1. Login to each remove.bg account
2. Check dashboard for usage stats
3. See which key is being used most

### Console Logs Show:
```javascript
✅ Background removed successfully using Key 2/3  // Shows which key worked
⚠️ Key 1/3 quota exceeded, trying next key...    // Shows quota issues
❌ All remove.bg API keys failed                   // All keys exhausted
```

## Troubleshooting

### All Keys Show "Quota Exceeded"
- Wait for monthly quota reset (1st of each month)
- Add more API keys to `.env.local`
- Upgrade to paid plan
- Pre-process images offline

### "Background removal service not configured"
- `REMOVE_BG_API_KEY` is not set in `.env.local`
- Check for typos in environment variable name
- Restart dev server after adding keys

### Keys Not Rotating
- Check that keys are comma-separated
- No spaces between commas and keys (or use spaces consistently)
- Verify all keys are valid (test individually)

### How to Test
```bash
# Test with curl
curl -X POST http://localhost:3000/api/remove-background \
  -H "Content-Type: application/json" \
  -d '{"imageUrl":"https://example.com/photo.jpg"}'
```

## Production Recommendations

1. **Pre-process Images** (Best)
   - Remove backgrounds before uploading
   - Saves API costs
   - Faster loading

2. **Multiple Free Accounts** (Good)
   - 3-5 accounts = 150-250 images/month free
   - Automatic rotation handles failover
   - Monitor usage monthly

3. **Paid Backup** (Insurance)
   - Keep one paid account as last resort
   - Add it as the final key in the list
   - Only used when all free keys exhausted

4. **Monitor & Alert**
   - Log key usage
   - Set up alerts when approaching quota
   - Plan accordingly

## Example Multi-Key Setup

```bash
# .env.local
# 5 free accounts = 250 images/month
REMOVE_BG_API_KEY=\
ANe1J1nK3LHMANtWarGjvY8T,\
BNf2K2oL4mIzpCouXbsHwZ9U,\
COf3L3pM5nJaqDpvYctIxA0V,\
DPg4M4qN6oKbrEqwZduJyB1W,\
EQh5N5rO7pLcsfrXaevKzC2X
```

This gives you 250 free background removals per month with automatic failover! 🎉
