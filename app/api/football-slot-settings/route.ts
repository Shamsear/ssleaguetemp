import { NextRequest, NextResponse } from 'next/server';
import { getMainDb } from '@/lib/neon/main-config';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const seasonId = searchParams.get('season_id');

    if (!seasonId) {
      return NextResponse.json(
        { success: false, error: 'season_id is required' },
        { status: 400 }
      );
    }

    const sql = getMainDb();
    const rows = await sql`SELECT * FROM seasons WHERE id = ${seasonId} LIMIT 1`;

    if (rows.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Season not found' },
        { status: 404 }
      );
    }

    const seasonData = rows[0];

    const settings = {
      football_base_slots: seasonData.football_base_slots || 25,
      football_max_purchasable_slots: seasonData.football_max_purchasable_slots || 3,
      football_slot_price: seasonData.football_slot_price || 10,
      football_slot_purchase_enabled: seasonData.football_slot_purchase_enabled !== false,
    };

    return NextResponse.json({ success: true, data: settings });
  } catch (error: any) {
    console.error('Error fetching slot settings:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      season_id,
      football_base_slots,
      football_max_purchasable_slots,
      football_slot_price,
      football_slot_purchase_enabled
    } = body;

    if (!season_id) {
      return NextResponse.json({ success: false, error: 'season_id is required' }, { status: 400 });
    }

    if (football_base_slots !== undefined && (football_base_slots < 1 || football_base_slots > 100)) {
      return NextResponse.json({ success: false, error: 'Base slots must be between 1 and 100' }, { status: 400 });
    }
    if (football_max_purchasable_slots !== undefined && (football_max_purchasable_slots < 0 || football_max_purchasable_slots > 50)) {
      return NextResponse.json({ success: false, error: 'Max purchasable slots must be between 0 and 50' }, { status: 400 });
    }
    if (football_slot_price !== undefined && (football_slot_price < 0 || football_slot_price > 10000)) {
      return NextResponse.json({ success: false, error: 'Slot price must be between 0 and 10000' }, { status: 400 });
    }

    const sql = getMainDb();
    const updateData: Record<string, any> = {};

    if (football_base_slots !== undefined) updateData.football_base_slots = football_base_slots;
    if (football_max_purchasable_slots !== undefined) updateData.football_max_purchasable_slots = football_max_purchasable_slots;
    if (football_slot_price !== undefined) updateData.football_slot_price = football_slot_price;
    if (football_slot_purchase_enabled !== undefined) updateData.football_slot_purchase_enabled = football_slot_purchase_enabled;

    if (Object.keys(updateData).length > 0) {
      const setClauses = Object.entries(updateData).map(([key, val]) => `${key} = ${val}`);
      await sql.query(`UPDATE seasons SET ${setClauses.join(', ')}, updated_at = NOW() WHERE id = $1`, [season_id]);
    }

    return NextResponse.json({ success: true, message: 'Slot settings updated successfully', data: updateData });
  } catch (error: any) {
    console.error('Error updating slot settings:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
