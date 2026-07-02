import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ success: false, error: 'Not Found' }, { status: 404 });
  }
  const { id } = await context.params;
  
  return NextResponse.json({
    success: true,
    message: 'Test route works!',
    teamId: id
  });
}
