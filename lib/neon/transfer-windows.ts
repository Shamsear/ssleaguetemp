import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.NEON_DATABASE_URL!);

export interface TransferWindow {
  id: number;
  season_id: string;
  name: string;
  type: 'release' | 'swap';
  status: 'open' | 'closed';
  max_requests: number;
  linked_window_id?: number;
  created_at?: string;
  updated_at?: string;
}

export async function getWindows(seasonId?: string) {
  if (seasonId) {
    return await sql`SELECT * FROM transfer_windows WHERE season_id = ${seasonId} ORDER BY created_at DESC`;
  }
  return await sql`SELECT * FROM transfer_windows ORDER BY created_at DESC`;
}

export async function getOpenWindows(seasonId: string, type?: 'release' | 'swap') {
  if (type) {
    return await sql`SELECT * FROM transfer_windows WHERE season_id = ${seasonId} AND status = 'open' AND type = ${type} ORDER BY created_at DESC`;
  }
  return await sql`SELECT * FROM transfer_windows WHERE season_id = ${seasonId} AND status = 'open' ORDER BY created_at DESC`;
}

export async function getWindowById(id: number | string) {
  const result = await sql`SELECT * FROM transfer_windows WHERE id = ${id} LIMIT 1`;
  return result[0] || null;
}

export async function createWindow(data: Partial<TransferWindow>) {
  const result = await sql`
    INSERT INTO transfer_windows (
      season_id, name, type, status, max_requests, linked_window_id
    ) VALUES (
      ${data.season_id}, ${data.name}, ${data.type}, ${data.status || 'closed'}, 
      ${data.max_requests || 0}, ${data.linked_window_id || null}
    ) RETURNING *
  `;
  return result[0];
}

export async function updateWindow(id: number | string, data: Partial<TransferWindow>) {
  // Build dynamic update query
  const updates: any[] = [];
  
  if (data.name !== undefined) updates.push(sql`name = ${data.name}`);
  if (data.status !== undefined) updates.push(sql`status = ${data.status}`);
  if (data.max_requests !== undefined) updates.push(sql`max_requests = ${data.max_requests}`);
  if (data.linked_window_id !== undefined) updates.push(sql`linked_window_id = ${data.linked_window_id}`);
  
  if (updates.length === 0) return await getWindowById(id);
  
  updates.push(sql`updated_at = NOW()`);
  
  // Combine fragments
  const setClause = updates.reduce((acc, frag, i) => {
    if (i === 0) return frag;
    return sql`${acc}, ${frag}`;
  });

  const result = await sql`
    UPDATE transfer_windows
    SET ${setClause}
    WHERE id = ${id}
    RETURNING *
  `;
  return result[0];
}

export async function getTeamRequestCountForWindow(teamId: string, windowId: number | string, type: 'release' | 'swap'): Promise<number> {
  const window = await getWindowById(windowId);
  if (!window) return 0;
  
  // If this window is linked to another window, we need to count requests for BOTH windows.
  // We'll collect all window IDs that are linked in this "pool".
  // A simple way: find all windows that have the same linked_window_id, OR are the linked_window_id.
  let poolWindowIds = [window.id];
  
  if (window.linked_window_id) {
    const linkedResult = await sql`
      SELECT id FROM transfer_windows 
      WHERE id = ${window.linked_window_id} OR linked_window_id = ${window.linked_window_id}
    `;
    poolWindowIds = linkedResult.map((w: any) => w.id);
  } else {
    // Check if any other windows link to THIS window
    const linkedToMe = await sql`SELECT id FROM transfer_windows WHERE linked_window_id = ${window.id}`;
    if (linkedToMe.length > 0) {
      poolWindowIds = [...poolWindowIds, ...linkedToMe.map((w: any) => w.id)];
    }
  }

  // Count the requests in these windows
  let count = 0;
  
  // We only count requests that are 'pending' or 'approved' (i.e. not 'rejected' or 'cancelled')
  if (type === 'release') {
    // In postgres, ANY(array) works well with sql string, but neon tagged template doesn't natively spread array to IN ()
    // Let's just do a loop or join
    const idsString = poolWindowIds.join(',');
    // Wait, better to just query them sequentially or use IN
    const counts = await Promise.all(poolWindowIds.map(wId => 
      sql`SELECT COUNT(*) as count FROM release_requests 
          WHERE team_id = ${teamId} 
          AND window_id = ${wId} 
          AND status IN ('pending', 'approved')`
    ));
    count = counts.reduce((sum, res) => sum + parseInt(res[0].count), 0);
  } else if (type === 'swap') {
    const counts = await Promise.all(poolWindowIds.map(wId => 
      sql`SELECT COUNT(*) as count FROM swap_requests 
          WHERE requesting_team_id = ${teamId} 
          AND window_id = ${wId} 
          AND status IN ('pending', 'approved')`
    ));
    count = counts.reduce((sum, res) => sum + parseInt(res[0].count), 0);
  }
  
  return count;
}
