# Fix Red Panthers Registration Issue

## Problem
Red Panthers (SSPSLT0003) gets "Team not found" error when trying to register for a season.

## Root Cause
The registration API looks for teams in this order:
1. Check if user has `teamId` field → Get team document by that ID
2. If not found, query `teams` collection where `owner_uid == userId`
3. If neither exists → Return "Team not found" error

## Solution Steps

### Step 1: Check User Document
1. Go to Firebase Console → Firestore
2. Navigate to `users` collection
3. Find the Red Panthers user (search by teamName or email)
4. Check if the user document has:
   - `teamId: "SSPSLT0003"` ← **This field must exist**
   
### Step 2: Check Team Document
1. Navigate to `teams` collection
2. Find document `SSPSLT0003`
3. Check if it has:
   - `owner_uid: "[user_id]"` ← **Must match the user's document ID**

### Step 3: Fix Missing Fields

#### If user is missing `teamId`:
```
users/[USER_ID]
{
  ...existing fields...
  "teamId": "SSPSLT0003"  ← Add this
}
```

#### If team is missing `owner_uid`:
```
teams/SSPSLT0003
{
  ...existing fields...
  "owner_uid": "[USER_ID]"  ← Add this (must match user document ID)
}
```

## Quick Fix in Firebase Console

1. **Find the user:**
   - Go to Firestore → `users` collection
   - Search for Red Panthers (by teamName field)
   - Note the document ID (this is the USER_ID)

2. **Check/Fix user document:**
   - Add field: `teamId` = `SSPSLT0003`
   - Click Save

3. **Check/Fix team document:**
   - Go to `teams` collection → `SSPSLT0003`
   - Verify field: `owner_uid` = `[USER_ID from step 1]`
   - If missing, add it
   - Click Save

4. **Test Registration:**
   - Try registering for the season again
   - Should now work!

## Alternative: API Endpoint Fix

If you want to create an API endpoint to fix this automatically, create:

```typescript
// app/api/admin/fix-team-link/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export async function POST(request: NextRequest) {
  const { teamId, userId } = await request.json();
  
  // Update user with teamId
  await adminDb.collection('users').doc(userId).update({
    teamId: teamId
  });
  
  // Update team with owner_uid
  await adminDb.collection('teams').doc(teamId).update({
    owner_uid: userId
  });
  
  return NextResponse.json({ success: true });
}
```

Then call it with:
```bash
curl -X POST http://localhost:3000/api/admin/fix-team-link \
  -H "Content-Type: application/json" \
  -d '{"teamId":"SSPSLT0003","userId":"[USER_ID_HERE]"}'
```

## Verification

After applying the fix, verify:
1. User document has `teamId: "SSPSLT0003"`
2. Team document `SSPSLT0003` has `owner_uid: "[USER_ID]"`
3. Both values match correctly
4. Try season registration again - should work!
