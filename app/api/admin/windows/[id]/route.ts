import { NextRequest, NextResponse } from 'next/server';
import { updateWindow, getWindowById } from '@/lib/neon/transfer-windows';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    
    const existing = await getWindowById(id);
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Window not found' }, { status: 404 });
    }
    
    // Parse values to correct types if present
    if (body.max_requests !== undefined) body.max_requests = parseInt(body.max_requests);
    if (body.linked_window_id !== undefined) body.linked_window_id = body.linked_window_id ? parseInt(body.linked_window_id) : null;
    
    const updated = await updateWindow(id, body);
    
    return NextResponse.json({ success: true, data: updated });
  } catch (error: any) {
    console.error('Error updating window:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
