import { NextRequest, NextResponse } from 'next/server';

/**
 * Expire contracts - DISABLED (Contract system deactivated)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json(
    { error: 'Contract system is deactivated. This endpoint is no longer in use.' },
    { status: 410 }
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  return NextResponse.json(
    { error: 'Contract system is deactivated. This endpoint is no longer in use.' },
    { status: 410 }
  );
}
