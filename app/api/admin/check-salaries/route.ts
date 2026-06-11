import { NextRequest, NextResponse } from 'next/server';

/**
 * Check salary deductions - DISABLED (Salary system deactivated)
 */
export async function GET(request: NextRequest) {
  return NextResponse.json(
    { error: 'Salary system is deactivated. This endpoint is no longer in use.' },
    { status: 410 }
  );
}
