import { NextResponse } from 'next/server';
import { getMainDb } from '@/lib/neon/main-config';

/**
 * GET /api/cached/firebase/match-data
 * Returns match_days and round_deadlines data with ISR caching
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('seasonId');
    const type = searchParams.get('type') || 'both';
    
    if (!seasonId) {
      return NextResponse.json(
        { success: false, error: 'seasonId is required' },
        { status: 400 }
      );
    }
    
    const sql = getMainDb();
    const result: any = {};
    
    // Fetch match_days if requested
    if (type === 'match_days' || type === 'both') {
      try {
        const matchDays: any[] = await sql`SELECT * FROM match_days WHERE season_id = ${seasonId}`;
        result.match_days = matchDays;
      } catch (e: any) {
        console.warn('[match-data] match_days query failed:', e.message);
        result.match_days = [];
      }
    }
    
    // Fetch round_deadlines if requested
    if (type === 'round_deadlines' || type === 'both') {
      try {
        const roundDeadlines: any[] = await sql`SELECT * FROM round_deadlines WHERE id LIKE ${seasonId + '%'} OR season_id = ${seasonId}`;
        result.round_deadlines = roundDeadlines;
      } catch (e: any) {
        console.warn('[match-data] round_deadlines query failed:', e.message);
        result.round_deadlines = [];
      }
    }
    
    return NextResponse.json(
      {
        success: true,
        data: result,
        cached: true,
        timestamp: new Date().toISOString(),
      },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=120, stale-while-revalidate=240',
          'CDN-Cache-Control': 'public, s-maxage=120',
          'Vercel-CDN-Cache-Control': 'public, s-maxage=120',
        },
      }
    );
  } catch (error) {
    console.error('Error fetching match data:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch match data',
      },
      { status: 500 }
    );
  }
}

export const revalidate = 120; // Revalidate every 2 minutes
export const dynamic = 'force-static';
