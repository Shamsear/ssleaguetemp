import { NextRequest, NextResponse } from 'next/server';
import { getMainDb } from '@/lib/neon/main-config';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const seasonId = searchParams.get('season_id');
    const teamId = searchParams.get('team_id');
    const transactionType = searchParams.get('transaction_type');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = parseInt(searchParams.get('offset') || '0');

    if (!seasonId) {
      return NextResponse.json(
        { success: false, error: 'Season ID is required' },
        { status: 400 }
      );
    }

    const sql = getMainDb();
    let result;
    if (transactionType) {
      result = await sql`
        SELECT * FROM transactions
        WHERE season_id = ${seasonId} AND type = ${transactionType}
        ORDER BY created_at DESC
      `;
    } else {
      result = await sql`
        SELECT * FROM transactions
        WHERE season_id = ${seasonId}
        ORDER BY created_at DESC
      `;
    }

    let allTransactions: any[] = result.map((row: any) => ({
      id: row.id,
      ...row,
      raw_data: typeof row.raw_data === 'string' ? JSON.parse(row.raw_data) : row.raw_data,
      created_at: row.created_at?.toISOString?.() || row.created_at || new Date().toISOString()
    }));

    // Apply team filter if provided (client-side filtering)
    if (teamId) {
      allTransactions = allTransactions.filter((data: any) => {
        const raw = data.raw_data || data;
        return (
          raw.old_team_id === teamId ||
          raw.new_team_id === teamId ||
          raw.team_a_id === teamId ||
          raw.team_b_id === teamId ||
          raw.teams?.team_a_id === teamId ||
          raw.teams?.team_b_id === teamId ||
          data.team_id === teamId
        );
      });
    }

    // Apply pagination
    const totalCount = allTransactions.length;
    const paginatedTransactions = allTransactions.slice(offset, offset + limit);

    return NextResponse.json({
      success: true,
      transactions: paginatedTransactions,
      pagination: {
        total: totalCount,
        limit,
        offset,
        has_more: offset + limit < totalCount
      }
    });
  } catch (error) {
    console.error('Error fetching transfer history:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch transfer history', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
