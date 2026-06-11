import { NextRequest, NextResponse } from 'next/server';

/**
 * Refund all salary deductions - DISABLED (Salary system deactivated)
 */
export async function POST(request: NextRequest) {
  return NextResponse.json(
    { error: 'Salary system is deactivated. This endpoint is no longer in use.' },
    { status: 410 }
  );
}
