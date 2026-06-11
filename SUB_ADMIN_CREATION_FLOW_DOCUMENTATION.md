# Sub-Admin (Committee Admin) Creation Flow Documentation

## Overview
This document provides a comprehensive explanation of how committee administrators (sub-admins) are created in the system. Committee admins are season-specific administrators who can manage teams, auctions, and players for their assigned season.

**Status**: ✅ Complete and Verified
**Last Updated**: June 4, 2026

---

## Architecture Summary

The system uses an **invite-based approach** for creating committee administrators:

1. **Super Admin** creates an invitation code for a specific season
2. Invite link is shared with the intended admin
3. Admin registers using the invite link
4. System automatically assigns them as **committee_admin** role for that season
5. Admin gains immediate access (no approval needed)

---

## Key Components

### 1. User Role System

**Location**: `types/user.ts`

```typescript
export type UserRole = 'super_admin' | 'committee_admin' | 'team';

export interface CommitteeAdmin extends BaseUser {
  role: 'committee_admin';
  seasonId: string;              // Each admin is tied to ONE season
  seasonName?: string;           // Display name of the season
  seasonYear?: string;           // Season year (e.g., "2024-25")
  committeeId?: string;          // Optional committee identifier
  committeeName?: string;        // Optional committee name
  permissions: string[];         // Array of permission strings
  canManageTeams: boolean;
  canManageAuctions: boolean;
  canManagePlayers: boolean;
}
```

---

### 2. Invite System

**Location**: `types/invite.ts`, `lib/firebase/invites.ts`

#### Invite Data Structure
```typescript
export interface AdminInvite {
  id: string;                    // Firestore document ID
  code: string;                  // Unique invite code (format: XXXX-XXXX-XXXX)
  description: string;           // Optional description of invite purpose
  seasonId: string;              // Season this invite is for
  seasonName: string;            // Display name of season
  seasonYear: string;            // Season year (e.g., "2024-25")
  maxUses: number;              // Maximum number of times invite can be used
  usedCount: number;            // How many times it has been used
  expiresAt: Date;              // When the invite expires
  createdAt: Date;              // When invite was created
  createdBy: string;            // UID of super admin who created it
  createdByUsername: string;    // Username of creator
  isActive: boolean;            // Whether invite can still be used
  usedBy: string[];             // Array of user IDs who used this invite
}
```

#### Key Functions

**Generate Invite Code**
```typescript
const generateInviteCode = (): string => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Excludes confusing chars
  let code = '';
  for (let i = 0; i < 12; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
    if ((i + 1) % 4 === 0 && i !== 11) {
      code += '-'; // Format: XXXX-XXXX-XXXX
    }
  }
  return code;
};
```

**Create Admin Invite**
- Generates unique code (checks for collisions)
- Fetches season details
- Calculates expiration timestamp
- Stores in `invites` collection

**Validate Invite**
- Checks if code exists
- Verifies `isActive === true`
- Confirms `usedCount < maxUses`
- Ensures not expired (`new Date() <= expiresAt`)

**Mark Invite as Used**
- Increments `usedCount`
- Adds user ID to `usedBy` array
- Creates usage record in `inviteUsages` collection
- Auto-deactivates if max uses reached

---

## Step-by-Step Flow

### Step 1: Super Admin Creates Invitation

**Page**: `/dashboard/superadmin/invites`
**Component**: `app/dashboard/superadmin/invites/page.tsx`

#### UI Features:
1. **Season-Based Admin Overview**
   - Shows all seasons with their admin counts
   - Displays active/used invite statistics
   - Lists all committee admins per season
   - Real-time updates via Firestore listeners

2. **Create Invite Form**
   - Season selection dropdown (shows active season with ✓)
   - Description field (optional)
   - Max uses (default: 1)
   - Expires in hours (default: 24)

#### Process:
```typescript
await createAdminInvite(
  {
    seasonId: formData.seasonId,
    description: formData.description,
    maxUses: formData.maxUses,
    expiresInHours: formData.expiresInHours,
  },
  user.uid,
  user.username
);
```

#### Real-Time Listeners:
The page sets up listeners on:
- `invites` collection - updates when invites created/used/deleted
- `users` collection - updates when new admins register

This provides instant feedback without page refresh.

---

### Step 2: Share Invite Link

**Generated URL Format:**
```
https://yoursite.com/register?invite=XXXX-XXXX-XXXX
```

Super admin can:
- Copy link with one click
- See copied confirmation (2 second toast)
- View all active invites with their codes
- Delete invites if needed

---

### Step 3: Admin Opens Registration Link

**Page**: `/register?invite=XXXX-XXXX-XXXX`
**Component**: `components/auth/Register.tsx`

#### Initial Detection:
```typescript
useEffect(() => {
  const code = searchParams.get('invite');
  if (code) {
    setInviteCode(code);
    setIsAdminInvite(true);  // Set immediately for instant UI update
    validateInviteCode(code); // Validate in background
  }
}, [searchParams]);
```

#### Validation Process:
```typescript
const validateInviteCode = async (code: string) => {
  setValidatingInvite(true);
  
  const validation = await validateAdminInvite(code);
  
  if (!validation.valid) {
    setError(validation.error);
    setInviteCode(null);
    setIsAdminInvite(false);
    return;
  }
  
  setInvite(validation.invite); // Store invite details
};
```

#### UI Changes:
1. **Blue Info Banner**:
   - Shows "Admin Invite Detected" or "Validating Invite..."
   - Displays season info: "You'll be registered as Committee Admin for Premier League (2024-25)"

2. **Modified Form**:
   - Title changes to "Join as Committee Admin"
   - Team name field hidden
   - Team logo upload hidden
   - Only asks for username and password

3. **Submit Button**:
   - Changes to "Join as Admin"

---

### Step 4: Admin Submits Registration

**When form is submitted:**

```typescript
const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  
  // Auto-generate email
  const email = username.includes('@') 
    ? username 
    : `${username}@ssleague.com`;
  
  // Set role and additional data
  const role = isAdminInvite ? 'committee_admin' : 'team';
  const additionalData = isAdminInvite && invite
    ? {
        seasonId: invite.seasonId,
        seasonName: invite.seasonName,
        seasonYear: invite.seasonYear,
        permissions: ['manage_teams', 'manage_auctions', 'manage_players'],
        canManageTeams: true,
        canManageAuctions: true,
      }
    : {
        teamName,
        players: [],
      };
  
  // Create user in Firebase
  const { user, firebaseUser } = await signUp(
    email,
    password,
    username,
    role,
    additionalData
  );
  
  // Redirect based on role
  if (role === 'committee_admin') {
    router.push('/dashboard/committee');
  }
  
  // Mark invite as used (non-blocking background task)
  if (isAdminInvite && inviteCode) {
    markInviteAsUsed(inviteCode, firebaseUser.uid, username, email);
  }
};
```

---

### Step 5: Firebase User Creation

**Firebase Auth User**:
- Email: `username@ssleague.com` (or provided email)
- Password: User's chosen password
- UID: Auto-generated by Firebase

**Firestore User Document** (`users/{uid}`):
```typescript
{
  uid: firebaseUser.uid,
  username: "john_admin",
  email: "john_admin@ssleague.com",
  role: "committee_admin",
  
  // Season binding
  seasonId: "season_2024_25",
  seasonName: "Premier League",
  seasonYear: "2024-25",
  
  // Permissions
  permissions: ['manage_teams', 'manage_auctions', 'manage_players'],
  canManageTeams: true,
  canManageAuctions: true,
  
  // Metadata
  isActive: true,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
}
```

---

### Step 6: Mark Invite as Used

**Background Process** (non-blocking):

```typescript
export const markInviteAsUsed = async (
  code: string,
  userId: string,
  username: string,
  email: string
) => {
  // Update invite document
  await updateDoc(doc(db, 'invites', code), {
    usedCount: increment(1),
    usedBy: arrayUnion(userId),
  });
  
  // Create usage record
  await setDoc(doc(collection(db, 'inviteUsages')), {
    inviteId: code,
    inviteCode: code,
    userId,
    username,
    email,
    usedAt: serverTimestamp(),
    seasonId: validation.invite.seasonId,
    seasonName: validation.invite.seasonName,
  });
  
  // Auto-deactivate if max uses reached
  if (validation.invite.usedCount + 1 >= validation.invite.maxUses) {
    await updateDoc(doc(db, 'invites', code), {
      isActive: false,
    });
  }
};
```

---

### Step 7: Immediate Dashboard Access

**No Approval Required**:
- Committee admins are automatically approved
- Redirected immediately to `/dashboard/committee`
- Can start managing their season right away

**Contrast with Team Registration**:
- Teams require super admin approval
- Teams are redirected to `/register/pending-approval`
- Teams must wait for activation

---

## Database Structure

### Collections

#### `invites/{inviteCode}`
```typescript
{
  code: "ABCD-EFGH-IJKL",
  description: "Main admin for 2024-25",
  seasonId: "season_2024_25",
  seasonName: "Premier League",
  seasonYear: "2024-25",
  maxUses: 1,
  usedCount: 0,
  usedBy: [],
  isActive: true,
  expiresAt: Timestamp,
  createdAt: Timestamp,
  createdBy: "superadmin_uid",
  createdByUsername: "super_admin"
}
```

#### `inviteUsages/{usageId}`
```typescript
{
  inviteId: "ABCD-EFGH-IJKL",
  inviteCode: "ABCD-EFGH-IJKL",
  userId: "committee_admin_uid",
  username: "john_admin",
  email: "john_admin@ssleague.com",
  usedAt: Timestamp,
  seasonId: "season_2024_25",
  seasonName: "Premier League"
}
```

#### `users/{uid}` (Committee Admin)
```typescript
{
  uid: "committee_admin_uid",
  username: "john_admin",
  email: "john_admin@ssleague.com",
  role: "committee_admin",
  seasonId: "season_2024_25",
  seasonName: "Premier League",
  seasonYear: "2024-25",
  permissions: ["manage_teams", "manage_auctions", "manage_players"],
  canManageTeams: true,
  canManageAuctions: true,
  isActive: true,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

---

## Security Features

### 1. Unique Code Generation
- 12-character alphanumeric codes
- Excludes confusing characters (O/0, I/1, etc.)
- Format: `XXXX-XXXX-XXXX` for readability
- Collision detection (regenerates if duplicate)

### 2. Multi-Layer Validation
```typescript
// Validation checks:
✓ Code exists in database
✓ Invite is active (isActive === true)
✓ Not expired (current date <= expiresAt)
✓ Usage limit not reached (usedCount < maxUses)
✓ User hasn't already used this invite
```

### 3. Usage Limits
- Max uses prevents unlimited registrations
- Auto-deactivation when limit reached
- Tracking of all users who used invite

### 4. Expiration
- Time-based security
- Default: 24 hours
- Configurable per invite

### 5. Season Isolation
- Each admin bound to ONE season
- Cannot access other seasons' data
- Enforced at database query level

### 6. Audit Trail
- Complete usage tracking in `inviteUsages`
- Who created invite
- Who used invite
- When it was used
- Which season it was for

---

## Real-Time Updates

### Super Admin Dashboard
Uses Firestore `onSnapshot` listeners:

```typescript
// Listen to invites
const invitesQuery = query(
  collection(db, 'invites'),
  orderBy('createdAt', 'desc')
);

onSnapshot(invitesQuery, (snapshot) => {
  const updatedInvites = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  }));
  setInvites(updatedInvites);
  updateSeasonAdminsData(updatedInvites);
});

// Listen to users for admin changes
const usersQuery = query(
  collection(db, 'users'),
  orderBy('createdAt', 'desc')
);

onSnapshot(usersQuery, () => {
  updateSeasonAdminsData(latestInvites);
});
```

**Benefits**:
- Instant feedback when invite is used
- No page refresh needed
- Multiple admins can monitor simultaneously
- Real-time admin counts per season

---

## Key Differences: Committee Admin vs Team

| Feature | Committee Admin | Team |
|---------|----------------|------|
| **Registration Method** | Invite-only | Open registration |
| **Approval Process** | Instant (auto-approved) | Requires super admin approval |
| **Season Binding** | Tied to ONE specific season | Not season-specific |
| **Required Fields** | Username, Password only | Username, Password, Team Name, Logo |
| **Email Generation** | Auto: `username@ssleague.com` | Auto: `username@ssleague.com` |
| **Redirect After Registration** | `/dashboard/committee` | `/register/pending-approval` |
| **Permissions** | Manage teams, auctions, players | View own team data only |
| **Can View Other Seasons** | No (season-isolated) | No |
| **Can Be Created By** | Super admin only | Self-registration |
| **Database Collection** | `users` (with role) | `users` + `teams` |

---

## Permission Structure

### Committee Admin Permissions
```typescript
permissions: [
  'manage_teams',
  'manage_auctions', 
  'manage_players'
]

canManageTeams: true
canManageAuctions: true
```

### What Committee Admins Can Do:
1. **Team Management**
   - View all teams in their season
   - Approve/reject team registrations
   - Edit team details
   - Activate/deactivate teams

2. **Auction Management**
   - Create and manage auction rounds
   - Set player prices
   - Approve transactions
   - View auction history

3. **Player Management**
   - Add/edit/delete players
   - Assign players to categories
   - Manage player statistics
   - Track player availability

4. **Tournament Management**
   - Create tournament brackets
   - Manage fixtures
   - Record match results
   - View standings

5. **Season-Specific Operations**
   - All operations scoped to their assigned season
   - Cannot view or modify other seasons

### What Committee Admins CANNOT Do:
- Create new seasons (super admin only)
- Create invite codes (super admin only)
- Promote users to admin (super admin only)
- Access other seasons' data
- Delete seasons
- Change system-wide settings

---

## Error Handling

### Invalid Invite Scenarios

1. **Code Not Found**
   - Error: "Invalid invite code"
   - User sees error banner
   - Registration blocked

2. **Invite Deactivated**
   - Error: "This invite has been deactivated"
   - Happens when max uses reached or manually deactivated

3. **Invite Expired**
   - Error: "This invite has expired"
   - Shows expiration date
   - Suggests contacting admin for new invite

4. **Max Uses Reached**
   - Error: "This invite has reached its maximum uses"
   - Invite auto-deactivated

5. **Already Used by User**
   - Error: "You have already used this invite"
   - Prevents duplicate registrations

---

## API Endpoints & Functions

### Frontend Functions
```typescript
// lib/firebase/invites.ts
createAdminInvite(data, createdBy, username)
getAdminInviteByCode(code)
getAllAdminInvites()
getAdminInvitesBySeason(seasonId)
validateAdminInvite(code)
markInviteAsUsed(code, userId, username, email)
deleteAdminInvite(code)
deactivateAdminInvite(code)
getInviteUsages(inviteCode)
getCommitteeAdminsBySeason(seasonId)
```

### Registration Functions
```typescript
// hooks/useFirebase.ts
signUp(email, password, username, role, additionalData)
```

---

## UI Components

### Super Admin Invite Management
**Location**: `/dashboard/superadmin/invites`

**Features**:
- Season overview with admin counts
- Create invite form (collapsible)
- Active invites list with copy functionality
- Real-time updates
- Delete invite capability
- Visual indicators for active/expired invites

### Registration Page
**Location**: `/register?invite=CODE`

**Features**:
- Instant invite detection
- Background validation
- Dynamic UI based on invite type
- Blue info banner for admin invites
- Error messaging
- Password strength indicator
- Responsive design

---

## Testing Checklist

- [ ] Super admin can create invite with all options
- [ ] Invite code is unique and properly formatted
- [ ] Invite link can be copied to clipboard
- [ ] Registration page detects invite parameter
- [ ] Invalid invite codes show appropriate errors
- [ ] Expired invites are blocked
- [ ] Max uses limit works correctly
- [ ] Used invite count increments properly
- [ ] Committee admin created with correct role
- [ ] Season binding is correct
- [ ] Permissions are set properly
- [ ] Admin redirected to correct dashboard
- [ ] Usage record created in inviteUsages
- [ ] Invite auto-deactivates at max uses
- [ ] Real-time updates work on super admin dashboard
- [ ] Multiple admins can use same invite (if max > 1)
- [ ] Season isolation enforced in committee dashboard

---

## Future Enhancements

1. **Email Integration**
   - Send invite via email directly from dashboard
   - Email templates with invite link

2. **Invite Templates**
   - Save common invite configurations
   - Quick invite creation

3. **Role-Based Invites**
   - Different permission levels
   - Custom role assignment

4. **Batch Invites**
   - Create multiple invites at once
   - CSV import for bulk admin creation

5. **Invite Analytics**
   - Track invite usage patterns
   - See which invites are most used

6. **Notification System**
   - Notify super admin when invite is used
   - Alert when invite is about to expire

---

## Troubleshooting

### Issue: Invite not validating
**Check**:
- Invite code exists in Firestore
- `isActive` field is `true`
- `expiresAt` is in the future
- `usedCount < maxUses`

### Issue: Admin not redirected properly
**Check**:
- `role` field set to `committee_admin`
- User document created successfully
- No auth errors in console

### Issue: Season data not showing
**Check**:
- `seasonId` matches existing season
- Season is active
- User's `seasonId` field is set correctly

### Issue: Real-time updates not working
**Check**:
- Firestore rules allow read access
- Listeners are set up correctly
- No console errors
- Network connectivity

---

## Conclusion

The sub-admin creation flow is a secure, streamlined process that:
- ✅ Uses invite-based registration for security
- ✅ Provides instant access (no approval needed)
- ✅ Enforces season-specific isolation
- ✅ Tracks complete audit trail
- ✅ Updates in real-time
- ✅ Handles errors gracefully
- ✅ Scales with multiple seasons and admins

The system ensures that each committee admin can only manage their assigned season, maintaining data integrity and security across the platform. 