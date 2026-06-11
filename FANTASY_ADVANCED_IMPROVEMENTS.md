# Fantasy League - Advanced Improvements

## Overview
This document suggests additional optimizations and better approaches beyond the critical fixes.

---

## 🎯 Architecture Improvements

### 1. Separate Service Layer

**Current Issue:** Business logic mixed with API route handlers

**Better Approach:** Extract to service layer

```typescript
// lib/fantasy/draft-service.ts
export class FantasyDraftService {
  constructor(
    private fantasySql: any,
    private tournamentSql: any
  ) {}

  async draftPlayer(params: DraftPlayerParams): Promise<DraftResult> {
    // Validate inputs
    await this.validateDraftRequest(params);
    
    // Execute draft in transaction
    return await this.executeDraft(params);
  }

  private async validateDraftRequest(params: DraftPlayerParams) {
    // All validation logic here
    const player = await this.getPlayerWithCategory(params.playerId);
    const team = await this.getTeamWithBudget(params.userId);
    const league = await this.getLeagueSettings(team.leagueId);
    
    this.validateDraftStatus(league);
    this.validatePlayerPrice(params.price, player.category, league);
    await this.validatePlayerAvailability(params.playerId, league.id);
    await this.validateSquadCapacity(team.id, league.maxSquadSize);
    await this.validateBudget(team, params.price);
  }

  private async executeDraft(params: DraftPlayerParams): Promise<DraftResult> {
    return await this.fantasySql.begin(async (tx) => {
      // Transaction logic here
    });
  }
}

// In API route:
import { FantasyDraftService } from '@/lib/fantasy/draft-service';

export async function POST(request: NextRequest) {
  const service = new FantasyDraftService(fantasySql, getTournamentDb());
  try {
    const result = await service.draftPlayer(body);
    return NextResponse.json(result);
  } catch (error) {
    return handleError(error);
  }
}
```

**Benefits:**
- Testable business logic
- Reusable across different endpoints
- Cleaner separation of concerns
- Easier to maintain

---

### 2. Add Caching Layer

**Current Issue:** Every request fetches league settings from database

**Better Approach:** Use Redis for caching

```typescript
// lib/fantasy/cache-service.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL);

export class FantasyCacheService {
  private TTL = {
    LEAGUE_SETTINGS: 300,      // 5 minutes
    CATEGORY_PRICES: 600,      // 10 minutes
    PLAYER_CATEGORY: 3600,     // 1 hour
  };

  async getLeagueSettings(leagueId: string) {
    const key = `fantasy:league:${leagueId}`;
    const cached = await redis.get(key);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    const league = await fantasySql`
      SELECT * FROM fantasy_leagues WHERE league_id = ${leagueId}
    `;
    
    await redis.setex(key, this.TTL.LEAGUE_SETTINGS, JSON.stringify(league[0]));
    return league[0];
  }

  async invalidateLeague(leagueId: string) {
    await redis.del(`fantasy:league:${leagueId}`);
  }

  async getCategoryPricing(leagueId: string) {
    const key = `fantasy:pricing:${leagueId}`;
    const cached = await redis.get(key);
    
    if (cached) {
      return JSON.parse(cached);
    }
    
    const league = await this.getLeagueSettings(leagueId);
    const pricing = league.category_prices || DEFAULT_PRICING;
    
    await redis.setex(key, this.TTL.CATEGORY_PRICES, JSON.stringify(pricing));
    return pricing;
  }
}
```

**Benefits:**
- 10-100x faster reads
- Reduces database load
- Better scalability

---

### 3. Add Request Validation Middleware

**Current Issue:** Validation code repeated in every endpoint

**Better Approach:** Create validation middleware

```typescript
// lib/fantasy/validation.ts
import { z } from 'zod';

export const DraftPlayerSchema = z.object({
  user_id: z.string().min(1),
  real_player_id: z.string().min(1),
  player_name: z.string().min(1),
  position: z.string().optional(),
  team_name: z.string().optional(),
  draft_price: z.number().positive(),
});

export function validateRequest<T>(schema: z.ZodSchema<T>) {
  return async (request: NextRequest) => {
    const body = await request.json();
    return schema.parse(body); // Throws if invalid
  };
}

// In API route:
export async function POST(request: NextRequest) {
  try {
    const body = await validateRequest(DraftPlayerSchema)(request);
    // body is now typed and validated
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
  }
}
```

**Benefits:**
- Type-safe validation
- Automatic error messages
- Reusable schemas
- Runtime type checking

---

## 🚀 Performance Improvements

### 4. Optimize Database Queries

**Current Issue:** Multiple roundtrips to database

**Better Approach:** Combine queries with JOINs

```typescript
// Instead of 3 separate queries:
const team = await fantasySql`SELECT * FROM fantasy_teams WHERE...`;
const league = await fantasySql`SELECT * FROM fantasy_leagues WHERE...`;
const squad = await fantasySql`SELECT * FROM fantasy_squad WHERE...`;

// Use a single query:
const draftContext = await fantasySql`
  SELECT 
    ft.team_id,
    ft.owner_uid,
    ft.budget_remaining,
    fl.league_id,
    fl.max_squad_size,
    fl.budget_per_team,
    fl.draft_status,
    fl.category_prices,
    COUNT(fs.squad_id) as current_squad_size,
    COALESCE(SUM(fs.purchase_price), 0) as budget_spent
  FROM fantasy_teams ft
  JOIN fantasy_leagues fl ON ft.league_id = fl.league_id
  LEFT JOIN fantasy_squad fs ON ft.team_id = fs.team_id
  WHERE ft.owner_uid = ${user_id} AND ft.is_enabled = true
  GROUP BY ft.team_id, fl.league_id
  LIMIT 1
`;
```

**Benefits:**
- 1 query instead of 3
- Faster response time
- Less network overhead

---

### 5. Add Database Connection Pooling

**Current Issue:** May not be configured optimally

**Better Approach:** Explicit pool configuration

```typescript
// lib/neon/fantasy-config.ts
import postgres from 'postgres';

export const fantasySql = postgres(process.env.FANTASY_DATABASE_URL!, {
  max: 20,                    // Maximum pool size
  idle_timeout: 20,           // Close idle connections after 20s
  connect_timeout: 10,        // Connection timeout
  max_lifetime: 60 * 30,      // Recycle connections after 30 min
  prepare: true,              // Use prepared statements (faster)
  onnotice: () => {},         // Suppress notices
  debug: process.env.NODE_ENV === 'development',
});

// Monitor pool stats
export async function getPoolStats() {
  return {
    total: fantasySql.options.max,
    idle: fantasySql.options.idle,
    active: fantasySql.options.max - fantasySql.options.idle,
  };
}
```

---

### 6. Add Query Result Pagination

**Current Issue:** Returns all players without pagination

**Better Approach:** Add cursor-based pagination

```typescript
// app/api/fantasy/players/available/route.ts
export async function GET(request: NextRequest) {
  const cursor = searchParams.get('cursor');
  const limit = Number(searchParams.get('limit')) || 50;

  const players = await tournamentSql`
    SELECT *
    FROM player_seasons
    WHERE season_id = ${season_id}
      ${cursor ? sql`AND player_id > ${cursor}` : sql``}
    ORDER BY player_id
    LIMIT ${limit + 1}
  `;

  const hasMore = players.length > limit;
  const data = players.slice(0, limit);
  const nextCursor = hasMore ? data[data.length - 1].player_id : null;

  return NextResponse.json({
    players: data,
    pagination: {
      next_cursor: nextCursor,
      has_more: hasMore,
      limit
    }
  });
}
```

---

## 🔒 Security Improvements

### 7. Add JWT Token Verification

**Current Issue:** Trusts `user_id` from request body

**Better Approach:** Verify JWT token

```typescript
// lib/auth/verify-token.ts
import { jwtVerify } from 'jose';

export async function verifyAuthToken(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  
  if (!authHeader?.startsWith('Bearer ')) {
    throw new Error('Missing authorization header');
  }

  const token = authHeader.substring(7);
  const secret = new TextEncoder().encode(process.env.JWT_SECRET!);

  try {
    const { payload } = await jwtVerify(token, secret);
    return {
      userId: payload.sub as string,
      email: payload.email as string,
      role: payload.role as string,
    };
  } catch (error) {
    throw new Error('Invalid token');
  }
}

// In API route:
export async function POST(request: NextRequest) {
  const auth = await verifyAuthToken(request);
  
  // Verify user_id matches token
  if (body.user_id !== auth.userId) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 403 }
    );
  }
  
  // Proceed with draft...
}
```

---

### 8. Add Rate Limiting

**Current Issue:** No protection against abuse

**Better Approach:** Use Upstash Rate Limit

```typescript
// lib/rate-limit.ts
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_URL!,
  token: process.env.UPSTASH_REDIS_TOKEN!,
});

const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'), // 10 requests per minute
  analytics: true,
});

export async function checkRateLimit(identifier: string) {
  const { success, limit, reset, remaining } = await ratelimit.limit(identifier);
  
  return {
    success,
    limit,
    reset,
    remaining,
  };
}

// In API route:
export async function POST(request: NextRequest) {
  const auth = await verifyAuthToken(request);
  const rateLimitResult = await checkRateLimit(`draft:${auth.userId}`);
  
  if (!rateLimitResult.success) {
    return NextResponse.json(
      { 
        error: 'Too many requests',
        retry_after: rateLimitResult.reset 
      },
      { 
        status: 429,
        headers: {
          'X-RateLimit-Limit': rateLimitResult.limit.toString(),
          'X-RateLimit-Remaining': rateLimitResult.remaining.toString(),
          'X-RateLimit-Reset': rateLimitResult.reset.toString(),
        }
      }
    );
  }
  
  // Proceed with draft...
}
```

---

### 9. Add Input Sanitization

**Current Issue:** Raw input inserted into database

**Better Approach:** Sanitize all inputs

```typescript
// lib/security/sanitize.ts
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeString(input: string): string {
  return DOMPurify.sanitize(input, { 
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: []
  }).trim();
}

export function sanitizePlayerData(data: any) {
  return {
    ...data,
    player_name: sanitizeString(data.player_name),
    position: sanitizeString(data.position || ''),
    team_name: sanitizeString(data.team_name || ''),
  };
}

// In API route:
const sanitizedBody = sanitizePlayerData(body);
```

---

## 📊 Monitoring & Observability

### 10. Add Structured Logging

**Current Issue:** Basic console.log statements

**Better Approach:** Use structured logging

```typescript
// lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: (label) => ({ level: label }),
  },
});

// In API route:
logger.info({
  event: 'draft_attempt',
  user_id: auth.userId,
  player_id: real_player_id,
  league_id: leagueId,
}, 'User attempting to draft player');

logger.error({
  event: 'draft_failed',
  error: error.message,
  user_id: auth.userId,
  player_id: real_player_id,
}, 'Draft transaction failed');
```

---

### 11. Add Performance Monitoring

**Current Issue:** No visibility into performance

**Better Approach:** Track metrics

```typescript
// lib/monitoring/metrics.ts
export class PerformanceMonitor {
  private metrics: Map<string, number[]> = new Map();

  startTimer(operation: string): () => void {
    const start = Date.now();
    
    return () => {
      const duration = Date.now() - start;
      this.recordMetric(operation, duration);
    };
  }

  private recordMetric(operation: string, duration: number) {
    if (!this.metrics.has(operation)) {
      this.metrics.set(operation, []);
    }
    this.metrics.get(operation)!.push(duration);
  }

  getStats(operation: string) {
    const durations = this.metrics.get(operation) || [];
    return {
      count: durations.length,
      avg: durations.reduce((a, b) => a + b, 0) / durations.length,
      min: Math.min(...durations),
      max: Math.max(...durations),
      p95: this.percentile(durations, 0.95),
    };
  }

  private percentile(arr: number[], p: number): number {
    const sorted = [...arr].sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * p) - 1;
    return sorted[index];
  }
}

// In API route:
const monitor = new PerformanceMonitor();
const endTimer = monitor.startTimer('draft_player');

try {
  // Draft logic...
} finally {
  endTimer();
  logger.info(monitor.getStats('draft_player'), 'Draft performance');
}
```

---

## 🧪 Testing Improvements

### 12. Add Unit Tests

**Current Issue:** No automated tests

**Better Approach:** Comprehensive test suite

```typescript
// __tests__/fantasy/draft-service.test.ts
import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { FantasyDraftService } from '@/lib/fantasy/draft-service';

describe('FantasyDraftService', () => {
  let service: FantasyDraftService;
  let mockFantasySql: any;
  let mockTournamentSql: any;

  beforeEach(() => {
    mockFantasySql = {
      begin: jest.fn(),
    };
    mockTournamentSql = jest.fn();
    service = new FantasyDraftService(mockFantasySql, mockTournamentSql);
  });

  describe('validateDraftRequest', () => {
    it('should throw error if player not found', async () => {
      mockTournamentSql.mockResolvedValue([]);
      
      await expect(
        service.validateDraftRequest({
          playerId: 'invalid',
          userId: 'user1',
          price: 40,
        })
      ).rejects.toThrow('Player not found');
    });

    it('should throw error if price mismatch', async () => {
      mockTournamentSql.mockResolvedValue([{ category: 'A' }]);
      
      await expect(
        service.validateDraftRequest({
          playerId: 'player1',
          userId: 'user1',
          price: 1, // Wrong price for category A
        })
      ).rejects.toThrow('Invalid draft price');
    });
  });

  describe('draftPlayer', () => {
    it('should successfully draft player', async () => {
      // Setup mocks
      mockFantasySql.begin.mockImplementation(async (fn) => {
        return fn(mockFantasySql);
      });
      
      const result = await service.draftPlayer({
        playerId: 'player1',
        userId: 'user1',
        price: 40,
      });
      
      expect(result.success).toBe(true);
      expect(mockFantasySql.begin).toHaveBeenCalled();
    });
  });
});
```

---

### 13. Add Integration Tests

```typescript
// __tests__/api/fantasy/draft.integration.test.ts
import { describe, it, expect } from '@jest/globals';

describe('/api/fantasy/draft/player', () => {
  it('should prevent concurrent drafts of same player', async () => {
    // Start two concurrent draft requests
    const [result1, result2] = await Promise.all([
      fetch('/api/fantasy/draft/player', {
        method: 'POST',
        body: JSON.stringify({ user_id: 'user1', real_player_id: 'player1', ... }),
      }),
      fetch('/api/fantasy/draft/player', {
        method: 'POST',
        body: JSON.stringify({ user_id: 'user2', real_player_id: 'player1', ... }),
      }),
    ]);

    const json1 = await result1.json();
    const json2 = await result2.json();

    // One should succeed, one should fail
    const succeeded = [json1, json2].filter(r => r.success);
    const failed = [json1, json2].filter(r => r.error);

    expect(succeeded.length).toBe(1);
    expect(failed.length).toBe(1);
    expect(failed[0].error).toContain('already drafted');
  });
});
```

---

## 🎨 Code Quality Improvements

### 14. Add TypeScript Strict Mode

**Better Approach:** Enable strict type checking

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitAny": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

---

### 15. Add Error Handling Utility

**Current Issue:** Error handling repeated

**Better Approach:** Centralized error handler

```typescript
// lib/error-handler.ts
export class AppError extends Error {
  constructor(
    public message: string,
    public statusCode: number,
    public code: string,
    public details?: any
  ) {
    super(message);
  }
}

export function handleApiError(error: unknown): NextResponse {
  if (error instanceof AppError) {
    return NextResponse.json(
      {
        error: error.message,
        code: error.code,
        details: error.details,
      },
      { status: error.statusCode }
    );
  }

  if (error instanceof Error) {
    logger.error({ error: error.message, stack: error.stack }, 'Unexpected error');
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    { error: 'Unknown error occurred' },
    { status: 500 }
  );
}

// In API route:
try {
  // Logic...
} catch (error) {
  return handleApiError(error);
}
```

---

## 📈 Priority Implementation

### High Priority (Next Sprint)
1. ✅ Service layer extraction (#1)
2. ✅ JWT token verification (#7)
3. ✅ Rate limiting (#8)
4. ✅ Input sanitization (#9)
5. ✅ Query optimization (#4)

### Medium Priority (Next Month)
6. ✅ Caching layer (#2)
7. ✅ Request validation middleware (#3)
8. ✅ Pagination (#6)
9. ✅ Structured logging (#10)
10. ✅ Unit tests (#12)

### Low Priority (Future)
11. ✅ Performance monitoring (#11)
12. ✅ Integration tests (#13)
13. ✅ TypeScript strict mode (#14)
14. ✅ Connection pooling config (#5)
15. ✅ Error handling utility (#15)

---

## 💰 Cost-Benefit Analysis

| Improvement | Dev Time | Performance Gain | Security Gain | Maintenance |
|-------------|----------|------------------|---------------|-------------|
| Service Layer | 2 days | - | - | ⬇️ Easier |
| Caching | 1 day | 10-100x | - | ➡️ Same |
| JWT Verification | 4 hours | - | ⬆️⬆️⬆️ High | ➡️ Same |
| Rate Limiting | 2 hours | - | ⬆️⬆️ Medium | ➡️ Same |
| Query Optimization | 1 day | 2-3x | - | ➡️ Same |
| Unit Tests | 3 days | - | - | ⬇️⬇️ Much easier |

---

## ✅ Estimated Impact

After implementing these improvements:

- **Performance:** 5-10x faster response times
- **Security:** Production-grade auth & rate limiting
- **Maintainability:** 50% easier to modify/extend
- **Reliability:** 99.9% uptime achievable
- **Scalability:** Support 10,000+ concurrent users

---

**Status:** Ready for phased implementation  
**Total Effort:** ~2-3 weeks  
**ROI:** High (especially items 1, 2, 7, 8)
