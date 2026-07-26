# Committee Access Fix - Complete Summary

## Problem
The `/dashboard/committee/real-players` page was showing:
```
ERROR: Access denied. Required roles: committee
```

## Root Cause
Multiple API routes were checking for a role called `'committee'` but the actual role in the system is `'committee_admin'`.

## What Was Fixed

### 1. API Routes Updated (13 files)
All `verifyAuth()` calls that checked for `'committee'` were changed to `'committee_admin'`:

**Files Modified:**
1. `/app/api/user/update-profile/route.ts`
2. `/app/api/real-player/[id]/route.ts`
3. `/app/api/seasons/historical/[id]/parse/route.ts`
4. `/app/api/realplayers/fix-points/route.ts`
5. `/app/api/notifications/devices/route.ts` (2 functions)
6. `/app/api/notifications/subscribe/route.ts` (2 functions)
7. `/app/api/notifications/users/route.ts`
8. `/app/api/notifications/send/route.ts` (2 functions)
9. `/app/api/fantasy/lineups/calculate-points/route.ts`
10. `/app/api/fantasy/lineups/auto-lock/route.ts`
11. `/app/api/contracts/assign-bulk/route.ts` (also fixed syntax error)
12. `/app/api/admin/send-manual-notification/route.ts`
13. `/app/api/admin/bulk-tiebreakers/[id]/finalize/route.ts`
14. `/app/api/admin/bulk-tiebreakers/[id]/update-firebase/route.ts`

**Changes Made:**
- `verifyAuth(['committee'])` → `verifyAuth(['committee_admin'])`
- `verifyAuth(['team', 'committee'])` → `verifyAuth(['team', 'committee_admin'])`
- `verifyAuth(['admin', 'committee', 'committee_admin'])` → `verifyAuth(['admin', 'committee_admin'])`

### 2. Syntax Error Fixed
**File:** `/app/api/contracts/assign-bulk/route.ts`
- **Before:** `const auth = await verifyAuth(['committee_admin']), request);`
- **After:** `const auth = await verifyAuth(['committee_admin'], request);`

## How the System Works

### Role Hierarchy
1. **super_admin** - Full system access
2. **committee_admin** - Season-specific administrative access
3. **team** - Team management access

### Authentication Flow
1. User logs in and gets a Firebase JWT token
2. JWT contains custom claims including `role` field
3. `verifyAuth()` function checks the JWT token's role
4. If role doesn't match required roles, returns error

### Why This Happened
- The role `'committee'` was likely used in earlier development
- The actual role in production is `'committee_admin'`
- Some API routes weren't updated when the role name changed

## Tools Created

### 1. Check All Users Script
```bash
npm run check-all-users
```
Shows all users in the system with their roles and identifies mismatches.

### 2. Fix User Role Script
```bash
npm run fix-user-role <email> <seasonId>
```
Updates a user's role to committee_admin and sets their season ID.

Example:
```bash
npm run fix-user-role admin@example.com SSPSLS18
```

### 3. Fix Committee Role Script
```bash
npm run fix-committee-role
```
Automatically fixes all `'committee'` references to `'committee_admin'` in API routes.

### 4. Check User Role HTML Page
Open `check-user-role.html` in your browser to see your current role and access level.

## Testing

### Test the Fix
1. Navigate to: `http://localhost:3000/dashboard/committee/real-players`
2. You should now see the real players page without access denied error
3. If you still see the error, you may need to:
   - Clear your browser cache
   - Log out and log back in (to refresh JWT token)
   - Check your user role with `npm run check-all-users`

### Verify Your Role
Run this command to check all users:
```bash
npm run check-all-users
```

If your role is not `committee_admin`, fix it with:
```bash
npm run fix-user-role your-email@example.com SSPSLS18
```

Then **log out and log back in** to get a fresh JWT token with the updated role.

## Important Notes

1. **JWT Token Caching**: User roles are stored in JWT tokens. After changing a user's role, they MUST log out and log back in for the change to take effect.

2. **Custom Claims**: Firebase custom claims are set when creating/updating users and are embedded in the JWT token.

3. **Role Check Location**: All role checks happen in `lib/auth-helper.ts` via the `verifyAuth()` function.

## Files Created

1. `fix-committee-role.ts` - Auto-fix script for API routes
2. `check-all-users.ts` - User role inspection tool
3. `fix-user-role.ts` - User role update tool
4. `check-user-role.html` - Browser-based role checker
5. `COMMITTEE_ACCESS_FIX_SUMMARY.md` - This document

## Next Steps

1. ✅ API routes fixed
2. ✅ Syntax errors fixed
3. ⏳ Test the real-players page
4. ⏳ If still having issues, check user role and refresh JWT token

## Quick Reference

```bash
# Check all users and their roles
npm run check-all-users

# Fix a specific user's role
npm run fix-user-role email@example.com SSPSLS18

# Fix all committee role references (already done)
npm run fix-committee-role

# Then: Log out and log back in to refresh your JWT token
```
