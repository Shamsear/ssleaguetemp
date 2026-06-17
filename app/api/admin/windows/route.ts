import { NextRequest, NextResponse } from 'next/server';
import { getWindows, createWindow } from '@/lib/neon/transfer-windows';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('season_id') || undefined;
    
    const windows = await getWindows(seasonId);
    return NextResponse.json({ success: true, data: windows });
  } catch (error: any) {
    console.error('Error fetching windows:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { season_id, name, type, status, max_requests, linked_window_id } = body;
    
    if (!season_id || !name || !type) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }
    
    const newWindow = await createWindow({
      season_id,
      name,
      type,
      status: status || 'closed',
      max_requests: parseInt(max_requests) || 0,
      linked_window_id: linked_window_id ? parseInt(linked_window_id) : undefined
    });
    
    return NextResponse.json({ success: true, data: newWindow });
  } catch (error: any) {
    console.error('Error creating window:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
