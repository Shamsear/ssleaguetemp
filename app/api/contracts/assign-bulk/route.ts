import { NextRequest, NextResponse } from 'next/server';

/**
 * Assign contracts in bulk - DISABLED (Contract system deactivated)
 */
export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: 'Contract system is deactivated. This endpoint is no longer in use.' },
    { status: 410 }
  );
}
