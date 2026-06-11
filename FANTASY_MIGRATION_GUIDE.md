# Fantasy League Migration Guide

## Quick Start - Run the Migration

### Prerequisites
- Node.js and npm installed
- Database access configured (.env.local)
- Backup of fantasy database (recommended)

### Step 1: Backup Database (Recommended)
```bash
# Optional but recommended - backup your fantasy database
pg_dump -h <host> -U <user> -d <database> > fantasy_backup_$(date +%Y%m%d).sql
```

### Step 2: Run Migration Script
```bash
# From project root
npx ts-node scripts/migrate-fantasy-to-category-pricing.ts
```

### Step 3: Verify Migration
```sql
-- Connect to your fantasy database and run these checks

-- 1. Check category_prices in leagues
SELECT league_id, category_prices FROM fantasy_leagues;

-- 2. Verify drafted players have drafted_by_team_id
SELECT COUNT(*) as drafted_players
FROM fantasy_players 
WHERE drafted_by_team_id IS NOT NULL;

-- 3. Check categories in fantasy_squad
SELECT category, COUNT(*) as count
FROM fantasy_squad
GROUP BY category;

-- 4. Verify indexes were created
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'fantasy_players';
```

### Step 4: Test the Changes
```bash
# Test available players API
curl "http://localhost:3000/api/fantasy/players/available?league_id=SSPSLFLS16"

# Should return players grouped by category with no drafted players
```

---

## Migration Script Output

When successful, you should see:

```
🔄 Starting fantasy league category pricing migration...

📊 Step 1: Adding category_prices to fantasy_leagues...
✅ category_prices column added

📊 Step 2: Updating existing leagues with category prices...
✅ Updated 2 leagues

📊 Step 3: Adding columns to fantasy_players...
✅ Columns added to fantasy_players

📊 Step 4: Creating indexes...
✅ Indexes created

📊 Step 5: Adding category to fantasy_squad...
✅ Category added to fantasy_squad

📊 Step 6: Adding category to fantasy_drafts...
✅ Category added to fantasy_drafts

📊 Step 7: Migrating category data from player_seasons...
  Processing league SSPSLFLS16...
  ✅ Updated 150 players in SSPSLFLS16
✅ Category data migrated

📊 Step 8: Setting drafted_by_team_id for drafted players...
  Found 45 drafted players
✅ Updated 45 players as drafted

📊 Step 9: Updating fantasy_squad with category...
✅ fantasy_squad updated with categories

📊 Step 10: Updating fantasy_drafts with category...
✅ fantasy_drafts updated with categories

═══════════════════════════════════════════
✅ Migration completed successfully!

Summary of changes:
  ✓ Added category_prices to fantasy_leagues
  ✓ Added category and drafted_by_team_id to fantasy_players
  ✓ Added category to fantasy_squad and fantasy_drafts
  ✓ Created indexes for performance
  ✓ Migrated all existing data
  ✓ Set drafted_by_team_id for drafted players
═══════════════════════════════════════════

✅ Migration script finished successfully
```

---

## Troubleshooting

### Error: "Permission denied for table fantasy_leagues"
**Solution:** Check your database credentials in `.env.local`
```bash
# Verify your connection string
echo $FANTASY_DATABASE_URL
```

### Error: "Column already exists"
**Solution:** This is safe to ignore. The migration uses `IF NOT EXISTS` so it's idempotent.

### Error: "No category found for player"
**Solution:** Players without categories will default to 'A'. You can manually update them:
```sql
UPDATE fantasy_players
SET category = 'B'  -- or appropriate category
WHERE real_player_id = 'player_xyz';
```

### Error: "Failed to connect to database"
**Solution:** Check your .env.local configuration:
```env
FANTASY_DATABASE_URL=postgresql://user:password@host:port/database
```

---

## Rollback Instructions

If you need to rollback the migration:

### Option 1: Restore from Backup
```bash
# Restore from backup (if you created one)
psql -h <host> -U <user> -d <database> < fantasy_backup_YYYYMMDD.sql
```

### Option 2: Manual Rollback
```sql
-- Remove added columns (CAUTION: This deletes data)
ALTER TABLE fantasy_players DROP COLUMN IF EXISTS category;
ALTER TABLE fantasy_players DROP COLUMN IF EXISTS drafted_by_team_id;
ALTER TABLE fantasy_squad DROP COLUMN IF EXISTS category;
ALTER TABLE fantasy_drafts DROP COLUMN IF EXISTS category;
ALTER TABLE fantasy_leagues DROP COLUMN IF EXISTS category_prices;

-- Drop indexes
DROP INDEX IF EXISTS idx_fantasy_players_drafted;
DROP INDEX IF EXISTS idx_fantasy_players_category;
```

---

## Post-Migration Checklist

- [ ] Migration script completed without errors
- [ ] Verified category_prices in fantasy_leagues
- [ ] Verified drafted_by_team_id is set for drafted players
- [ ] Tested available players API (no drafted players shown)
- [ ] Tested drafting a player (success)
- [ ] Tested drafting same player by another team (fails)
- [ ] Tested removing player (becomes available again)
- [ ] Restarted application servers
- [ ] Informed team about changes

---

## What Changed for Users

### Team Managers
- Players now show categories (A, B, C, etc.) instead of star ratings
- Prices are based on category
- Each player can only be drafted by one team
- Drafted players no longer appear in available players list

### Committee Admins
- Can configure category prices per league
- Can see which team drafted each player
- Category-based reporting available

---

## FAQ

**Q: What happens to players without a category?**
A: They default to category 'A' (highest value)

**Q: Can I change category prices after migration?**
A: Yes, update the `category_prices` in `fantasy_leagues` table

**Q: What if a player was drafted by multiple teams before migration?**
A: Migration keeps the most recent draft and makes player unavailable to others

**Q: Can I still use star ratings?**
A: Yes, the system falls back to star_rating_prices if category_prices is not set

**Q: How do I assign categories to new players?**
A: Categories come from the `player_seasons` table or can be set during player registration

---

## Support Contacts

- Technical Issues: Check application logs
- Database Issues: Verify connection strings
- Migration Errors: Review migration script output

---

**Last Updated:** June 11, 2026
**Migration Script:** `scripts/migrate-fantasy-to-category-pricing.ts`
**Documentation:** `FANTASY_CHANGES_SUMMARY.md`
