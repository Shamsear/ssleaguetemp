import { getMainDb } from '@/lib/neon/main-config';
import { NextRequest } from 'next/server';

/**
 * GET /api/realtime/stream?collection=seasons&interval=3&filters={"season_id":"SSPSLS18"}
 * 
 * Server-Sent Events endpoint that polls Neon and pushes changes to clients.
 */

const SUPPORTED_COLLECTIONS = new Set([
  'seasons', 'teams', 'team_seasons', 'realplayers', 'categories', 'transactions',
  'player_transactions', 'team_cash_balances', 'realplayerstats',
]);

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const collection = searchParams.get('collection') || 'seasons';
  const interval = Math.min(Math.max(parseInt(searchParams.get('interval') || '3'), 2), 30);
  const filters = searchParams.get('filters') || '';

  if (!SUPPORTED_COLLECTIONS.has(collection)) {
    return new Response(JSON.stringify({ error: `Invalid collection: ${collection}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let lastHash = '0';
      let running = true;

      // Cleanup on disconnect
      request.signal.addEventListener('abort', () => {
        running = false;
        try { controller.close(); } catch {}
      });

      try {
        // Dynamically import Neon to avoid cold-start issues
        const { getMainDb } = await import('@/lib/neon/main-config');
        const sql = getMainDb();

        // Send initial connection event
        controller.enqueue(
          encoder.encode(`event: connected\ndata: ${JSON.stringify({ collection, interval })}\n\n`)
        );

        while (running) {
          try {
            // Build query
            let query = `SELECT id, updated_at FROM ${collection}`;
            let fullQuery = `SELECT * FROM ${collection}`;
            const params: any[] = [];
            const conditions: string[] = [];
            
            if (filters) {
              try {
                const filterObj = JSON.parse(filters);
                let idx = 1;
                for (const [field, value] of Object.entries(filterObj)) {
                  conditions.push(`${field} = $${idx++}`);
                  params.push(value);
                }
              } catch (e) {
                console.error('[SSE] Filter parse error:', e);
              }
            }

            if (conditions.length > 0) {
              const whereClause = ` WHERE ${conditions.join(' AND ')}`;
              query += whereClause;
              fullQuery += whereClause;
            }

            query += ' ORDER BY updated_at DESC LIMIT 100';
            fullQuery += ' ORDER BY updated_at DESC LIMIT 100';

            // Execute hash query
            const result = params.length > 0
              ? await sql.query(query, params)
              : await sql.query(query);
            const rows: any[] = Array.isArray(result) ? result : (result?.rows || []);

            // Create hash from row ids + timestamps
            const hash = rows.map((r: any) => `${r.id}:${r.updated_at?.getTime?.() || r.updated_at}`).join('|');

            if (hash !== lastHash && lastHash !== '0') {
              // Data changed - fetch full data and push
              const fullResult: any = params.length > 0
                ? await sql.query(fullQuery, params)
                : await sql.query(fullQuery);
              const data: any[] = Array.isArray(fullResult) ? fullResult : (fullResult?.rows || []);

              const eventId = Date.now().toString();
              lastHash = hash;

              controller.enqueue(
                encoder.encode(`id: ${eventId}\nevent: update\ndata: ${JSON.stringify({ collection, data, count: data.length })}\n\n`)
              );
            } else if (lastHash === '0') {
              // First load - send full data
              const fullResult: any = params.length > 0
                ? await sql.query(fullQuery, params)
                : await sql.query(fullQuery);
              const data: any[] = Array.isArray(fullResult) ? fullResult : (fullResult?.rows || []);

              const eventId = Date.now().toString();
              lastHash = hash;

              controller.enqueue(
                encoder.encode(`id: ${eventId}\nevent: initial\ndata: ${JSON.stringify({ collection, data, count: data.length })}\n\n`)
              );
            }
          } catch (error: any) {
            console.error(`[SSE] Query error for ${collection}:`, error.message);
            controller.enqueue(
              encoder.encode(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`)
            );
          }

          // Keep alive + wait
          if (running) {
            controller.enqueue(encoder.encode(`: keepalive\n\n`));
            await new Promise(resolve => setTimeout(resolve, interval * 1000));
          }
        }
      } catch (error: any) {
        console.error('[SSE] Fatal error:', error.message);
        try {
          controller.enqueue(
            encoder.encode(`event: error\ndata: ${JSON.stringify({ error: error.message })}\n\n`)
          );
        } catch {}
        try { controller.close(); } catch {}
      }
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
