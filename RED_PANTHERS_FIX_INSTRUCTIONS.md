# Red Panthers Registration Fix

## Problem Identified ✅

The team document has **two different user IDs**:
- `owner_uid: "HNcCBvMwmCUcwpHdDeBRS0cCQKJ3"` ❌ (WRONG)
- `userId: "DLCem9bSBvepJ07YQnfnzdRwOBq1"` ✅ (CORRECT)
- `uid: "DLCem9bSBvepJ07YQnfnzdRwOBq1"` ✅ (CORRECT)

The registration API uses `owner_uid` to look up teams, so it's trying to match with the wrong user ID!

---

## Fix Option 1: API Endpoint (Fastest) 🚀

1. Start your dev server:
   ```bash
   npm run dev
   ```

2. Open browser and navigate to:
   ```
   http://localhost:3000/api/admin/fix-red-panthers
   ```
   
   Or use curl:
   ```bash
   curl -X POST http://localhost:3000/api/admin/fix-red-panthers
   ```

3. You should see:
   ```json
   {
     "success": true,
     "message": "Red Panthers team fixed successfully"
   }
   ```

4. Try registering for the season again - it should work! ✅

---

## Fix Option 2: Firebase Console (Manual)

1. Go to Firebase Console
2. Navigate to Firestore Database
3. Go to `teams` collection
4. Click on document `SSPSLT0003`
5. Find the field `owner_uid`
6. Change its value from:
   - `HNcCBvMwmCUcwpHdDeBRS0cCQKJ3`
   - to `DLCem9bSBvepJ07YQnfnzdRwOBq1`
7. Click Save
8. Also check `users` collection document `DLCem9bSBvepJ07YQnfnzdRwOBq1`
9. Make sure it has field `teamId: "SSPSLT0003"`
10. Try registration again - should work! ✅

---

## What the Fix Does

The fix endpoint:
1. Updates `owner_uid` in team document to `DLCem9bSBvepJ07YQnfnzdRwOBq1`
2. Ensures `teamId` field exists in user document
3. Both documents now properly link to each other

---

## Why This Happened

The team document has conflicting user IDs, likely from:
- Initial team creation with one user
- Later update/migration with a different user
- The `owner_uid` wasn't updated to match the current `userId`

---

## After Fix - How Registration Works

1. User logs in with ID: `DLCem9bSBvepJ07YQnfnzdRwOBq1`
2. Registration API checks user's `teamId` field → finds `SSPSLT0003`
3. Looks up team document `SSPSLT0003`
4. ✅ Team exists → Proceeds with registration
5. OR if `teamId` missing, searches teams where `owner_uid == DLCem9bSBvepJ07YQnfnzdRwOBq1`
6. ✅ Finds team → Proceeds with registration

---

## Verification

After applying the fix, verify in Firestore:

**Team Document (`teams/SSPSLT0003`):**
```json
{
  "owner_uid": "DLCem9bSBvepJ07YQnfnzdRwOBq1",  ← MUST MATCH userId
  "userId": "DLCem9bSBvepJ07YQnfnzdRwOBq1",
  "uid": "DLCem9bSBvepJ07YQnfnzdRwOBq1",
  ...
}
```

**User Document (`users/DLCem9bSBvepJ07YQnfnzdRwOBq1`):**
```json
{
  "teamId": "SSPSLT0003",  ← MUST EXIST
  "teamName": "Red Panthers",
  ...
}
```

Then try registration - should work! 🎉
