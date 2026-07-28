# Fix Player 55 (SANJU / SANJU K) Instructions

## Problem
Player ID `sspslpsl0055` currently contains stats from **two different players**:
- **SANJU**: Has stats from S12, S11, S10, S9, S8 (needs to be moved to a new player)
- **SANJU K**: Should be the name of player 55, keeping only their own stats (S13 onwards)

**Issue URL**: https://ssleague.vercel.app/players/sspslpsl0055

## Solution
The script will:
1. ✅ Create a new player "SANJU" in Firebase
2. ✅ Transfer stats from S12-S8 to the new "SANJU" player in Neon Tournament DB
3. ✅ Rename player 55 to "SANJU K" in both Firebase and Neon
4. ✅ Update Firebase `realplayerstats` references
5. ✅ Maintain data integrity across both databases

## Prerequisites
- Node.js installed
- Access to Firebase Admin credentials
- Access to Neon Database
- `.env.local` file properly configured

## Files Created
1. **`scripts/fix-player-55-sanju-split.js`** - Main script to execute the fix
2. **`fix-player-55-stats.sql`** - SQL reference (manual approach, not needed if using the JS script)

## How to Run

### Step 1: Review the Script
```bash
# Open and review the script
cat scripts/fix-player-55-sanju-split.js
```

### Step 2: Run the Script
```bash
cd /path/to/ssleaguetemp
node scripts/fix-player-55-sanju-split.js
```

### Step 3: Follow the Interactive Prompts

The script will ask you:

1. **Confirm Player 55 details** - Verifies the current player data
2. **Review stats distribution** - Shows which stats will be transferred
3. **New Player ID** - Suggests next available ID (e.g., `sspslpsl0156`)
   - Press Enter to accept, or type a custom ID
4. **Optional email/phone** - For the new SANJU player (can skip)
5. **Final confirmation** - Type "yes" to proceed

### Step 4: Verify the Changes

After the script completes:

1. **Check Admin Panel**
   - Go to Super Admin → Players
   - Search for "SANJU" - should see TWO players:
     - SANJU (new player ID)
     - SANJU K (sspslpsl0055)

2. **Check Player Pages**
   - SANJU: https://ssleague.vercel.app/players/[new-id]
     - Should show stats from S12, S11, S10, S9, S8
   - SANJU K: https://ssleague.vercel.app/players/sspslpsl0055
     - Should show stats from S13 onwards only

3. **Upload Player Photo**
   - Upload SANJU's photo to: `/public/images/players/[new-id].webp`
   - Or use Super Admin → Player Photos

## What the Script Does

### Firebase Updates
```javascript
// Creates new player "SANJU"
realplayers collection:
  - player_id: [new-id]
  - name: "SANJU"
  - display_name: "SANJU"
  
// Renames player 55
realplayers/[doc-id]:
  - name: "SANJU K"
  - display_name: "SANJU K"
  
// Updates stats references
realplayerstats collection:
  - S12-S8 stats → player_id: [new-id], player_name: "SANJU"
  - S13+ stats → player_name: "SANJU K"
```

### Neon Tournament DB Updates
```sql
-- Transfer stats to new player
UPDATE realplayerstats
SET player_id = '[new-id]',
    player_name = 'SANJU',
    updated_at = NOW()
WHERE player_id = 'sspslpsl0055'
AND season_name IN ('SSPSLS12', 'SSPSLS11', 'SSPSLS10', 'SSPSLS9', 'SSPSLS8');

-- Update remaining stats
UPDATE realplayerstats
SET player_name = 'SANJU K',
    updated_at = NOW()
WHERE player_id = 'sspslpsl0055'
AND season_name NOT IN ('SSPSLS12', 'SSPSLS11', 'SSPSLS10', 'SSPSLS9', 'SSPSLS8');
```

## Expected Output

```
================================================================================
🔀 FIX PLAYER 55 - SPLIT SANJU & SANJU K
================================================================================

1️⃣ Looking for Player 55 in Firebase...
✅ Found Player: SANJU (sspslpsl0055)

2️⃣ Fetching stats from Neon Tournament DB...
Found 15 stat record(s) in Tournament DB:

Stats to transfer to SANJU (S12-S8):
   - SSPSLS12: Team A - 10 matches, 5 goals
   - SSPSLS11: Team B - 8 matches, 3 goals
   ...

Stats to keep with SANJU K (S13+):
   - SSPSLS13: Team C - 12 matches, 7 goals
   ...

3️⃣ Determining new player ID for SANJU...
Suggested player ID for SANJU: sspslpsl0156
✅ Will use: sspslpsl0156 for SANJU

📋 SPLIT SUMMARY
New Player: SANJU (sspslpsl0156)
   - Will receive 5 stat record(s) from S12-S8

Existing Player 55: SANJU K (sspslpsl0055)
   - Will be renamed to "SANJU K"
   - Will keep 10 stat record(s) from S13+

❓ Proceed with split? (type "yes" to confirm): yes

🔄 Starting split process...

4️⃣ Creating SANJU in Firebase...
   ✅ Created SANJU (sspslpsl0156)

5️⃣ Renaming Player 55 to SANJU K in Firebase...
   ✅ Renamed to SANJU K

6️⃣ Transferring stats in Neon Tournament DB...
   ✅ Transferred 5 stat record(s) to SANJU

7️⃣ Updating remaining stats to SANJU K...
   ✅ Updated 10 stat record(s) to SANJU K

8️⃣ Updating Firebase realplayerstats references...
   ✅ Transferred 5 Firebase stat(s) to SANJU
   ✅ Updated 10 Firebase stat(s) to SANJU K

✅ Split complete!

📝 Summary:
   - SANJU (sspslpsl0156): 5 stat records from S12-S8
   - SANJU K (sspslpsl0055): 10 stat records from S13+
```

## Rollback (If Needed)

If something goes wrong, you can manually rollback:

### Firebase Rollback
```javascript
// Delete the new SANJU player
db.collection('realplayers').where('player_id', '==', '[new-id]').get()
  .then(snapshot => snapshot.docs[0].ref.delete());

// Restore player 55 name
db.collection('realplayers').where('player_id', '==', 'sspslpsl0055').get()
  .then(snapshot => snapshot.docs[0].ref.update({ name: 'SANJU' }));

// Restore stats references
// (Run similar batch update to revert player_id and player_name)
```

### Neon Rollback
```sql
-- Transfer stats back
UPDATE realplayerstats
SET player_id = 'sspslpsl0055',
    player_name = 'SANJU'
WHERE player_id = '[new-id]';

-- Delete new player if exists in any tables
DELETE FROM realplayers WHERE player_id = '[new-id]';
```

## Notes
- ✅ The script is **safe** - it asks for confirmation before making changes
- ✅ All updates use **transactions** where possible
- ✅ Maintains **referential integrity** across databases
- ✅ Adds metadata fields (`split_note`, `rename_note`) for audit trail
- ⚠️ **Backup recommended** before running (Firebase export + Neon snapshot)

## Support
If you encounter issues:
1. Check the error message
2. Verify database connections
3. Ensure Firebase Admin credentials are correct
4. Check that player 55 exists in both databases
