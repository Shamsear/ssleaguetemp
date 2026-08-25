# Firebase → Neon Migration Plan

## Strategy
**One collection at a time. Zero breakage.**

For each collection:
1. Create Neon table + index
2. Migration script (Firebase → Neon)
3. Create Neon read functions (drop-in replacements for Firebase reads)
4. Update every read point (listed below)
5. Keep Firebase for WRITE operations (transitions → sync to Neon)
6. Verify + test
7. Move to next collection

---

## Collection 1: `seasons` (Priority: CRITICAL)
**Why first:** ~10 docs total, read on EVERY page load, changes 1x/month. Highest ROI.

### Read Points to Update (35 client + 71 server = 106 total)

#### Server-Side Reads (adminDb)
| # | File | Line | Operation |
|---|------|------|-----------|
| 1 | `lib/firebase/seasons.ts` | 34 | `getActiveSeason()` - query where isActive==true |
| 2 | `lib/firebase/seasons.ts` | 64 | `getActiveSeason()` - query where isActive==true |
| 3 | `lib/firebase/seasons.ts` | 93 | `getSeasonById()` - doc get |
| 4 | `lib/firebase/seasons.ts` | 145 | `createSeason()` - fallback ID |
| 5 | `lib/firebase/seasons.ts` | 191 | `createSeason()` - fetch after create |
| 6 | `lib/firebase/seasons.ts` | 228 | `activateSeason()` - getDocs all |
| 7 | `lib/firebase/smart-cache.ts` | 89 | `getCachedActiveSeason()` - query isActive==true |
| 8 | `lib/firebase/teams.ts` | 82 | `getAllTeams()` - getDocs seasons |
| 9 | `lib/firebase/realPlayers.ts` | 175 | getDocs seasons |
| 10 | `lib/firebase/realPlayers.ts` | 253 | getDocs seasons |
| 11 | `lib/firebase/footballPlayers.ts` | 46 | getDocs seasons |
| 12 | `lib/firebase/footballPlayers.ts` | 127 | getDocs seasons |
| 13 | `lib/firebase/invites.ts` | 53 | `getSeasonById()` |
| 14 | `lib/firebase/invites.ts` | 223 | `getSeasonById()` |
| 15 | `lib/firebase/matchResults.ts` | 34 | `getSeasonById()` |
| 16 | `app/api/cached/firebase/seasons/route.ts` | 22 | doc get season |
| 17 | `app/api/cached/firebase/seasons/route.ts` | 48 | getDocs seasons |
| 18 | `app/seasons/[id]/page.tsx` | 9 | doc get season |
| 19 | `app/sitemap.ts` | 34 | getDocs seasons |
| 20 | `app/api/admin/seasons/[id]/transition-mid-season/route.ts` | 29 | doc get season |
| 21 | `app/api/admin/seasons/[id]/toggle-player-registration/route.ts` | 13 | doc get season |
| 22 | `app/api/admin/seasons/[id]/toggle-player-registration/route.ts` | 66 | doc get season |
| 23 | `app/api/admin/players/change-registration-type/route.ts` | 56 | doc get season |
| 24 | `app/api/admin/players/change-registration-type/route.ts` | 90,158,163,169 | doc update season |
| 25 | `app/api/admin/players/bulk-delete/route.ts` | 141 | doc get season |
| 26 | `app/api/admin/players/bulk-delete/route.ts` | 149,186 | doc update season |
| 27 | `app/api/admin/database/balance-audit/route.ts` | 120 | doc get season |
| 28 | `app/api/fantasy/teams/my-team/route.ts` | 341 | doc get season |
| 29 | `app/api/fantasy/teams/enable-all/route.ts` | 33 | doc get season |
| 30 | `app/api/admin/registration-phases/route.ts` | 22 | doc get season |
| 31 | `app/api/admin/registration-phases/route.ts` | 79 | doc get season |
| 32 | `lib/firebase/groups.ts` | various | getSeasonById calls |
| 33 | `lib/firebase/knockoutBracket.ts` | various | getSeasonById calls |
| 34 | `lib/firebase/multiSeasonPlayers.ts` | various | getSeasonById calls |
| 35 | `lib/firebase/multiSeasonTeams.ts` | various | getSeasonById calls |

#### Client-Side Reads (db)
| # | File | Line | Operation |
|---|------|------|-----------|
| 1 | `hooks/useRealtimeData.ts` | 63 | onSnapshot seasons |
| 2 | `app/dashboard/team/transactions/page.tsx` | 70 | query seasons |
| 3 | `app/dashboard/team/squad/[teamId]/page.tsx` | 152 | query seasons |
| 4 | `app/dashboard/team/team-leaderboard/page.tsx` | 32 | query seasons |
| 5 | `app/players/[id]/PlayerDetailClient.tsx` | 141 | query seasons |
| 6 | `app/fixtures/FixturesClient.tsx` | 59 | query seasons |

#### Functions that call getSeasonById (cascade reads)
| # | File | Usage |
|---|------|-------|
| 1 | `lib/firebase/teams.ts` | 5 calls to getSeasonById |
| 2 | `lib/firebase/realPlayers.ts` | 2 calls |
| 3 | `lib/firebase/footballPlayers.ts` | 1 call |
| 4 | `lib/firebase/invites.ts` | 2 calls |
| 5 | `lib/firebase/matchResults.ts` | 1 call |
| 6 | `lib/lineup-notifications.ts` | indirect via teams |
| 7 | `lib/enrich-team-awards.ts` | indirect via team_seasons |

### Neon Table Schema
```sql
CREATE TABLE seasons (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255),
    year VARCHAR(50),
    season_number INTEGER,
    type VARCHAR(50) DEFAULT 'single',
    is_active BOOLEAN DEFAULT false,
    status VARCHAR(50) DEFAULT 'draft',
    registration_open BOOLEAN DEFAULT false,
    start_date TIMESTAMP,
    end_date TIMESTAMP,
    total_teams INTEGER DEFAULT 0,
    total_rounds INTEGER DEFAULT 0,
    purse_amount NUMERIC DEFAULT 0,
    max_players_per_team INTEGER DEFAULT 11,
    -- Multi-season fields
    dollar_budget NUMERIC,
    euro_budget NUMERIC,
    required_real_players INTEGER,
    max_football_players INTEGER,
    category_fine_amount NUMERIC,
    -- Raw JSON for any extra fields
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

### Migration Approach
- **Reads**: Neon first, no fallback needed (data is migrated once and kept in sync)
- **Writes**: Keep Firebase writes + add Neon sync (dual-write during transition)
- **Sync**: After write to Firebase → upsert to Neon

---

## Collection 2: `teams` (Priority: HIGH)
**Why second:** ~32 docs, read on many pages, changes during registration/transfers.

### Read Points to Update (23 client + 95 server = 118 total)

#### Key Server-Side Read Points
| # | File | Operation |
|---|------|-----------|
| 1 | `lib/firebase/teams.ts:37` | `getAllTeams()` - getDocs teams |
| 2 | `lib/firebase/teams.ts:89` | `getAllTeams()` - getDocs teams |
| 3 | `lib/firebase/teams.ts:415` | query teams |
| 4 | `lib/firebase/smart-cache.ts:135` | query teams |
| 5 | `app/api/cached/firebase/teams/route.ts` | query teams |
| 6 | `app/teams/[id]/page.tsx:25` | doc get team |
| 7 | `app/api/fixtures/[fixtureId]/route.ts:47,51` | doc get team (logo) |
| 8 | `app/api/fixtures/[fixtureId]/fixtures/route.ts:77,298` | doc get teams |
| 9 | `app/api/teams/[id]/statistics/route.ts:23` | doc get team |
| 10 | `app/api/imagekit/link/route.ts:19` | getDocs teams |
| 11 | `app/api/admin/create-team/route.ts:49` | getDocs teams |
| 12 | `app/api/admin/migrate-team-logos/route.ts:21` | getDocs teams |
| 13 | `lib/lineup-notifications.ts:195` | doc get team |
| 14 | `lib/firebase/aggregates.ts:118` | query teams |
| 15 | `lib/firebase/optimizedQueries.ts:170` | query teams |

#### Client-Side Read Points
| # | File | Operation |
|---|------|-----------|
| 1 | `hooks/useRealtimeData.ts` | onSnapshot teams |
| 2 | `contexts/TeamRegistrationContext.tsx` | query teams |
| 3 | `app/dashboard/team/team-leaderboard/page.tsx` | query team_seasons |

### Neon Table Schema
```sql
CREATE TABLE teams (
    id VARCHAR(255) PRIMARY KEY,
    team_id VARCHAR(255),
    team_name VARCHAR(255) NOT NULL,
    team_code VARCHAR(50),
    owner_uid VARCHAR(255),
    owner_name VARCHAR(255),
    owner_email VARCHAR(255),
    username VARCHAR(255),
    balance NUMERIC DEFAULT 0,
    initial_balance NUMERIC DEFAULT 0,
    total_spent NUMERIC DEFAULT 0,
    season_id VARCHAR(255),
    is_active BOOLEAN DEFAULT true,
    logo_url TEXT,
    team_color VARCHAR(50),
    stats JSONB DEFAULT '{}',
    raw_data JSONB,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Collection 3: `team_seasons` (Priority: HIGH - Most Impact)
**Why third:** 187 refs (biggest single collection). Complex data with nested objects.

### Key Read Points (159 server + 28 client = 187 total)

#### Highest-Frequency Server Reads
| # | File | Operation |
|---|------|-----------|
| 1 | `lib/firebase/teams.ts:130,216` | getDocs team_seasons |
| 2 | `lib/firebase/smart-cache.ts:191` | query team_seasons |
| 3 | `lib/firebase/aggregates.ts:78` | query team_seasons |
| 4 | `lib/finalize-round.ts:150,177,296,425,587` | doc get/update team_seasons |
| 5 | `lib/player-transfers-v2.ts` | 10+ doc get/update team_seasons |
| 6 | `lib/player-transfers-neon.ts` | 10+ doc get/update team_seasons |
| 7 | `lib/enrich-team-awards.ts` | doc get team_seasons |
| 8 | `lib/notifications/send-notification.ts` | query team_seasons |
| 9 | `lib/firebase-batch.ts` | doc get team_seasons |
| 10 | `lib/reserve-calculator.ts` | doc get team_seasons |
| 11 | `lib/transfer-limits.ts` | doc get team_seasons |
| 12 | `app/api/tournaments/distribute-rewards/route.ts` | doc get/update team_seasons |
| 13 | `app/api/tournaments/[id]/standings-with-budgets/route.ts` | doc get team_seasons |
| 14 | `app/api/tournaments/[id]/penalties/route.ts` | doc get/update team_seasons |
| 15 | `app/api/admin/database/balance-audit/route.ts` | doc get/update team_seasons |

#### Neon Table Schema
```sql
CREATE TABLE team_seasons (
    id VARCHAR(255) PRIMARY KEY,
    team_id VARCHAR(255) NOT NULL,
    team_name VARCHAR(255),
    team_code VARCHAR(50),
    season_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255),
    username VARCHAR(255),
    team_email VARCHAR(255),
    status VARCHAR(50) DEFAULT 'registered',
    budget NUMERIC DEFAULT 0,
    initial_budget NUMERIC DEFAULT 0,
    football_budget NUMERIC,
    football_spent NUMERIC DEFAULT 0,
    real_player_budget NUMERIC,
    real_player_spent NUMERIC DEFAULT 0,
    currency_system VARCHAR(50) DEFAULT 'single',
    players_count INTEGER DEFAULT 0,
    football_players_count INTEGER DEFAULT 0,
    stats JSONB DEFAULT '{}',
    real_players JSONB DEFAULT '[]',
    football_players JSONB DEFAULT '[]',
    logo_url TEXT,
    team_color VARCHAR(50),
    raw_data JSONB,
    joined_at TIMESTAMP DEFAULT NOW(),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## Collection 4: `realplayers` (Priority: MEDIUM)
**Why:** 70 refs, already partially in Neon.

### Key Read Points (47 server + 23 client)
| # | File | Operation |
|---|------|-----------|
| 1 | `lib/firebase/realPlayers.ts:182` | getDocs team_seasons |
| 2 | `app/api/imagekit/link/route.ts:60` | query realplayers |
| 3 | `app/api/admin/players/bulk-delete/route.ts:110` | query realplayers |
| 4 | `app/api/migrate/player-photos/route.ts:54` | query realplayers |
| 5 | `lib/firebase/realPlayers.ts` | 5+ functions querying realplayers |

---

## Collection 5: `categories` (Priority: MEDIUM)
**Why:** 21 refs, already has Neon schema.

### Read Points (14 server + 7 client)
- `lib/firebase/categories.ts` - Main read functions
- `app/api/categories/route.ts` - API endpoint

---

## Collection 6: `users` (Priority: LOW)
**Why:** 42 refs, tied to Firebase Auth. Only migrate if needed.

---

## Sync Strategy (During Transition)

### Dual-Write Pattern
```
User Action → Firebase Write → Neon Upsert
                   ↓
            (existing code)
                   
New Code → Read from Neon → Return to client
```

### Files Needing Sync Hooks
After any Firebase write to `seasons`:
- `lib/firebase/seasons.ts` (createSeason, updateSeason, activateSeason, completeSeason, etc.)

After any Firebase write to `teams`:
- `lib/firebase/teams.ts` (createTeam, updateTeam, deleteTeam, etc.)

After any Firebase write to `team_seasons`:
- `lib/player-transfers-v2.ts`
- `lib/player-transfers-neon.ts`
- `lib/finalize-round.ts`
- `lib/firebase-batch.ts`
- All tournament reward routes
- All admin management routes

---

## Migration Order
1. ✅ Seasons (simpler, few docs, huge impact)
2. ✅ Teams (few docs, moderate impact)  
3. ⬜ Team Seasons (biggest impact, most complex)
4. ⬜ Categories (already has Neon schema)
5. ⬜ Real Players (already partially in Neon)

## Risk Assessment
- **Seasons migration**: Very low risk. ~10 docs, rarely changes.
- **Teams migration**: Low risk. ~32 docs, moderate changes.
- **Team Seasons migration**: Medium risk. Complex nested data, frequent writes, many references.
