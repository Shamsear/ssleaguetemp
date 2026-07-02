import { NextRequest, NextResponse } from 'next/server';
import { broadcastRoundUpdate } from '@/lib/realtime/broadcast';

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ success: false, error: 'Not Found' }, { status: 404 });
  }
  try {
    const body = await request.json();
    const { seasonId, roundId, teamId } = body;

    if (!seasonId || !roundId || !teamId) {
      return NextResponse.json(
        { success: false, error: 'Missing required fields: seasonId, roundId, teamId' },
        { status: 400 }
      );
    }

    console.log('🧪 [Test] Broadcasting submission update:', { seasonId, roundId, teamId });

    await broadcastRoundUpdate(seasonId, roundId, {
      type: 'submission',
      team_id: teamId,
      action: 'submitted',
      bid_count: 10,
      test: true,
    });

    console.log('✅ [Test] Broadcast successful');

    return NextResponse.json({
      success: true,
      message: 'Broadcast sent successfully',
      data: { seasonId, roundId, teamId }
    });
  } catch (error: any) {
    console.error('❌ [Test] Error broadcasting:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
