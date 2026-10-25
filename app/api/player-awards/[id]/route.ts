import { NextRequest, NextResponse } from 'next/server';
import { getTournamentDb } from '@/lib/neon/tournament-config';

// PATCH / PUT - Update player award (recipient, award type, position, category, notes, instagram)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { id: awardId } = await params;
    const body = await request.json();

    const existing = await sql`
      SELECT * FROM player_awards WHERE id = ${awardId}
    `;

    if (existing.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Award not found' },
        { status: 404 }
      );
    }

    const currentAward = existing[0];
    const newPlayerId = body.player_id || currentAward.player_id;
    const newPlayerName = body.player_name || currentAward.player_name;
    const newAwardCategory = body.award_category || currentAward.award_category;
    const newAwardType = body.award_type || currentAward.award_type;
    const newAwardPosition = body.award_position !== undefined ? body.award_position : currentAward.award_position;
    const newPlayerCategory = body.player_category !== undefined ? body.player_category : currentAward.player_category;
    const newNotes = body.notes !== undefined ? body.notes : currentAward.notes;
    const newInstaLink = body.instagram_link !== undefined ? body.instagram_link : currentAward.instagram_link;
    const newInstaPostUrl = body.instagram_post_url !== undefined ? body.instagram_post_url : currentAward.instagram_post_url;

    // If player changed, update awards_count in player_season
    if (body.player_id && body.player_id !== currentAward.player_id) {
      try {
        await sql`
          UPDATE player_season
          SET awards_count = GREATEST(COALESCE(awards_count, 0) - 1, 0), updated_at = NOW()
          WHERE player_id = ${currentAward.player_id} AND season_id = ${currentAward.season_id}
        `;
        await sql`
          UPDATE player_season
          SET awards_count = COALESCE(awards_count, 0) + 1, updated_at = NOW()
          WHERE player_id = ${newPlayerId} AND season_id = ${currentAward.season_id}
        `;
      } catch (e) {
        // ignore if player_season row doesn't exist
      }
    }

    const updated = await sql`
      UPDATE player_awards
      SET
        player_id = ${newPlayerId},
        player_name = ${newPlayerName},
        award_category = ${newAwardCategory},
        award_type = ${newAwardType},
        award_position = ${newAwardPosition},
        player_category = ${newPlayerCategory},
        notes = ${newNotes},
        instagram_link = ${newInstaLink},
        instagram_post_url = ${newInstaPostUrl},
        updated_at = NOW()
      WHERE id = ${awardId}
      RETURNING *
    `;

    return NextResponse.json({
      success: true,
      message: 'Player award updated successfully',
      award: updated[0]
    });
  } catch (error: any) {
    console.error('Error updating player award:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to update player award' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  return PATCH(request, context);
}

// DELETE - Remove a player award
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const sql = getTournamentDb();
    const { id: awardId } = await params;

    // Get award details before deleting (to update awards_count)
    const award = await sql`
      SELECT player_id, season_id
      FROM player_awards
      WHERE id = ${awardId}
    `;

    if (award.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Award not found' },
        { status: 404 }
      );
    }

    const { player_id, season_id } = award[0];

    // Delete the award
    await sql`
      DELETE FROM player_awards
      WHERE id = ${awardId}
    `;

    // Update player_season awards_count (decrement)
    try {
      await sql`
        UPDATE player_season
        SET 
          awards_count = GREATEST(COALESCE(awards_count, 0) - 1, 0),
          updated_at = NOW()
        WHERE player_id = ${player_id} AND season_id = ${season_id}
      `;
    } catch (e) {
      // ignore
    }

    return NextResponse.json({
      success: true,
      message: 'Player award deleted successfully'
    });
  } catch (error: any) {
    console.error('Error deleting player award:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete player award' },
      { status: 500 }
    );
  }
}
