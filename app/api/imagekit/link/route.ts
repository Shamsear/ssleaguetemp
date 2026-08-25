import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/neon/admin-db-wrapper';
import { tournamentSql as sql } from '@/lib/neon/tournament-config';

/**
 * GET /api/imagekit/link
 * Returns all linkable entities: teams, managers, owners, players
 * Used to populate the "Assign image to..." picker in the media manager
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'all'; // teams | managers | owners | players | all

    const results: Record<string, any[]> = {};

    // ── Teams (Firestore) ──────────────────────────────────────────────────
    if (type === 'all' || type === 'teams') {
      const snapshot = await adminDb.collection('teams').orderBy('team_name').get();
      results.teams = snapshot.docs.map(doc => ({
        id: doc.id,
        label: doc.data().team_name || doc.data().name || doc.id,
        current_image: doc.data().logo_url || null,
        subtitle: doc.id,
      }));
    }

    // ── Managers (Neon SQL) ────────────────────────────────────────────────
    if (type === 'all' || type === 'managers') {
      const rows = await sql`
        SELECT manager_id, name, team_id, season_id, photo_url
        FROM managers
        ORDER BY name ASC
      `;
      results.managers = rows.map((r: any) => ({
        id: r.manager_id,
        label: r.name,
        current_image: r.photo_url || null,
        subtitle: `${r.team_id} · ${r.season_id}`,
      }));
    }

    // ── Owners (Neon SQL) ──────────────────────────────────────────────────
    if (type === 'all' || type === 'owners') {
      const rows = await sql`
        SELECT owner_id, name, team_id, season_id, photo_url
        FROM owners
        ORDER BY name ASC
      `;
      results.owners = rows.map((r: any) => ({
        id: r.owner_id,
        label: r.name,
        current_image: r.photo_url || null,
        subtitle: `${r.team_id} · ${r.season_id}`,
      }));
    }

    // ── Players (Firebase) ─────────────────────────────────────────────────
    if (type === 'all' || type === 'players') {
      const snapshot = await adminDb.collection('realplayers').orderBy('name').get();
      results.players = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: data.player_id || doc.id,
          label: data.name || data.player_name || doc.id,
          current_image: data.photo_url || null,
          subtitle: data.player_id || doc.id,
        };
      });
    }

    return NextResponse.json({ success: true, data: results });
  } catch (error: any) {
    console.error('ImageKit link GET error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to fetch entities' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/imagekit/link
 * Assigns an ImageKit image URL to a specific entity
 * Body: { entityType: 'team'|'manager'|'owner'|'player', entityId: string, imageUrl: string, fileId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const { entityType, entityId, imageUrl, fileId } = await request.json();

    if (!entityType || !entityId || !imageUrl) {
      return NextResponse.json(
        { success: false, error: 'entityType, entityId and imageUrl are required' },
        { status: 400 }
      );
    }

    switch (entityType) {
      // ── Team Logo ────────────────────────────────────────────────────────
      case 'team': {
        const teamRef = adminDb.collection('teams').doc(entityId);
        const teamDoc = await teamRef.get();
        if (!teamDoc.exists) {
          return NextResponse.json({ success: false, error: 'Team not found' }, { status: 404 });
        }
        await teamRef.update({
          logo_url: imageUrl,
          ...(fileId ? { logo_file_id: fileId } : {}),
          updated_at: new Date().toISOString(),
        });

        // Also update users collection if the team has an owner uid
        const teamData = teamDoc.data()!;
        const ownerUid = teamData.uid || teamData.userId || teamData.owner_uid;
        if (ownerUid) {
          const userRef = adminDb.collection('users').doc(ownerUid);
          const userDoc = await userRef.get();
          if (userDoc.exists) {
            await userRef.update({ logoUrl: imageUrl });
          }
        }
        return NextResponse.json({ success: true, message: `Team logo updated for ${entityId}` });
      }

      // ── Manager Photo ────────────────────────────────────────────────────
      case 'manager': {
        if (fileId) {
          await sql`
            UPDATE managers
            SET photo_url = ${imageUrl}, photo_file_id = ${fileId}, updated_at = NOW()
            WHERE manager_id = ${entityId}
          `;
        } else {
          await sql`
            UPDATE managers
            SET photo_url = ${imageUrl}, updated_at = NOW()
            WHERE manager_id = ${entityId}
          `;
        }
        return NextResponse.json({ success: true, message: `Manager photo updated for ${entityId}` });
      }

      // ── Owner Photo ──────────────────────────────────────────────────────
      case 'owner': {
        if (fileId) {
          await sql`
            UPDATE owners
            SET photo_url = ${imageUrl}, photo_file_id = ${fileId}, updated_at = NOW()
            WHERE owner_id = ${entityId}
          `;
        } else {
          await sql`
            UPDATE owners
            SET photo_url = ${imageUrl}, updated_at = NOW()
            WHERE owner_id = ${entityId}
          `;
        }
        return NextResponse.json({ success: true, message: `Owner photo updated for ${entityId}` });
      }

      // ── Player Photo ─────────────────────────────────────────────────────
      case 'player': {
        // Find the player document by player_id field
        const playersSnapshot = await adminDb.collection('realplayers')
          .where('player_id', '==', entityId)
          .limit(1)
          .get();
        
        if (playersSnapshot.empty) {
          return NextResponse.json({ success: false, error: 'Player not found' }, { status: 404 });
        }

        const playerDoc = playersSnapshot.docs[0];
        await playerDoc.ref.update({
          photo_url: imageUrl,
          ...(fileId ? { photo_file_id: fileId } : {}),
          updated_at: new Date().toISOString(),
        });
        
        return NextResponse.json({ success: true, message: `Player photo updated for ${entityId}` });
      }

      default:
        return NextResponse.json(
          { success: false, error: `Unknown entityType: ${entityType}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('ImageKit link POST error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to link image' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/imagekit/link
 * Clears (removes) the currently assigned image from an entity
 * Body: { entityType: 'team'|'manager'|'owner'|'player', entityId: string }
 */
export async function PATCH(request: NextRequest) {
  try {
    const { entityType, entityId } = await request.json();

    if (!entityType || !entityId) {
      return NextResponse.json(
        { success: false, error: 'entityType and entityId are required' },
        { status: 400 }
      );
    }

    switch (entityType) {
      case 'team': {
        const teamRef = adminDb.collection('teams').doc(entityId);
        const teamDoc = await teamRef.get();
        if (!teamDoc.exists) {
          return NextResponse.json({ success: false, error: 'Team not found' }, { status: 404 });
        }
        await teamRef.update({
          logo_url: null,
          logo_file_id: null,
          updated_at: new Date().toISOString(),
        });
        // Sync users collection
        const ownerUid = teamDoc.data()?.uid || teamDoc.data()?.userId;
        if (ownerUid) {
          const userDoc = await adminDb.collection('users').doc(ownerUid).get();
          if (userDoc.exists) await adminDb.collection('users').doc(ownerUid).update({ logoUrl: null });
        }
        return NextResponse.json({ success: true, message: `Team logo cleared for ${entityId}` });
      }

      case 'manager': {
        await sql`
          UPDATE managers
          SET photo_url = NULL, photo_file_id = NULL, updated_at = NOW()
          WHERE manager_id = ${entityId}
        `;
        return NextResponse.json({ success: true, message: `Manager photo cleared for ${entityId}` });
      }

      case 'owner': {
        await sql`
          UPDATE owners
          SET photo_url = NULL, photo_file_id = NULL, updated_at = NOW()
          WHERE owner_id = ${entityId}
        `;
        return NextResponse.json({ success: true, message: `Owner photo cleared for ${entityId}` });
      }

      case 'player': {
        // Find the player document by player_id field
        const playersSnapshot = await adminDb.collection('realplayers')
          .where('player_id', '==', entityId)
          .limit(1)
          .get();
        
        if (playersSnapshot.empty) {
          return NextResponse.json({ success: false, error: 'Player not found' }, { status: 404 });
        }

        const playerDoc = playersSnapshot.docs[0];
        await playerDoc.ref.update({
          photo_url: null,
          photo_file_id: null,
          updated_at: new Date().toISOString(),
        });
        
        return NextResponse.json({ success: true, message: `Player photo cleared for ${entityId}` });
      }

      default:
        return NextResponse.json({ success: false, error: `Unknown entityType: ${entityType}` }, { status: 400 });
    }
  } catch (error: any) {
    console.error('ImageKit link PATCH error:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Failed to clear image' },
      { status: 500 }
    );
  }
}

