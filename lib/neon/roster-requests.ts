import { getTournamentDb } from '@/lib/neon/tournament-config';
import { getAuctionDb } from '@/lib/neon/auction-config';

// Reusing same logic from other neon files: default to auction DB for requests, or use pool directly
// Since the tables were created in the default Neon DB, let's use the neon instance directly
import { neon } from '@neondatabase/serverless';
const sql = neon(process.env.NEON_DATABASE_URL!);

// --- RELEASE REQUESTS ---

export interface ReleaseRequestData {
  team_id: string;
  season_id: string;
  player_id: string;
  player_name: string;
  player_type: 'real' | 'football';
  refund_amount: number;
}

export async function createReleaseRequest(data: ReleaseRequestData) {
  const result = await sql`
    INSERT INTO release_requests (
      team_id, season_id, player_id, player_name, player_type, refund_amount, status
    ) VALUES (
      ${data.team_id}, ${data.season_id}, ${data.player_id}, ${data.player_name}, 
      ${data.player_type}, ${data.refund_amount}, 'pending'
    ) RETURNING *
  `;
  return result[0];
}

export async function getPendingReleaseRequests(seasonId?: string) {
  if (seasonId) {
    return await sql`SELECT * FROM release_requests WHERE status = 'pending' AND season_id = ${seasonId} ORDER BY submitted_at DESC`;
  }
  return await sql`SELECT * FROM release_requests WHERE status = 'pending' ORDER BY submitted_at DESC`;
}

export async function getTeamReleaseRequests(teamId: string, seasonId: string) {
  return await sql`SELECT * FROM release_requests WHERE team_id = ${teamId} AND season_id = ${seasonId} ORDER BY submitted_at DESC`;
}

export async function getReleaseRequestById(id: number | string) {
  const result = await sql`SELECT * FROM release_requests WHERE id = ${id} LIMIT 1`;
  return result[0] || null;
}

export async function updateReleaseRequestStatus(
  id: number | string, 
  status: 'approved' | 'rejected' | 'cancelled', 
  processedBy?: string,
  rejectionReason?: string
) {
  return await sql`
    UPDATE release_requests 
    SET 
      status = ${status}, 
      processed_at = NOW(), 
      processed_by = ${processedBy || null},
      rejection_reason = ${rejectionReason || null}
    WHERE id = ${id}
    RETURNING *
  `;
}

// --- SWAP REQUESTS ---

export interface SwapRequestData {
  season_id: string;
  requesting_team_id: string;
  target_team_id: string;
  cash_amount?: number;
  cash_direction?: 'A_to_B' | 'B_to_A' | 'none';
  players: {
    from_team_id: string;
    to_team_id: string;
    player_id: string;
    player_name: string;
    player_type: 'real' | 'football';
  }[];
}

export async function createSwapRequest(data: SwapRequestData) {
  // We need to use a transaction-like approach or insert then insert players
  // Since serverless neon driver doesn't support transactions via tagged template in the simplest form,
  // we will insert the request, get the ID, then insert the players.
  
  const reqResult = await sql`
    INSERT INTO swap_requests (
      season_id, requesting_team_id, target_team_id, cash_amount, cash_direction, status
    ) VALUES (
      ${data.season_id}, ${data.requesting_team_id}, ${data.target_team_id}, 
      ${data.cash_amount || 0}, ${data.cash_direction || 'none'}, 'pending'
    ) RETURNING *
  `;
  
  const swapReq = reqResult[0];
  
  // Insert players
  for (const p of data.players) {
    await sql`
      INSERT INTO swap_request_players (
        swap_request_id, from_team_id, to_team_id, player_id, player_name, player_type
      ) VALUES (
        ${swapReq.id}, ${p.from_team_id}, ${p.to_team_id}, ${p.player_id}, ${p.player_name}, ${p.player_type}
      )
    `;
  }
  
  return swapReq;
}

export async function getPendingSwapRequests(seasonId?: string) {
  // Fetch pending requests
  let requests;
  if (seasonId) {
    requests = await sql`SELECT * FROM swap_requests WHERE status = 'pending' AND season_id = ${seasonId} ORDER BY submitted_at DESC`;
  } else {
    requests = await sql`SELECT * FROM swap_requests WHERE status = 'pending' ORDER BY submitted_at DESC`;
  }
  
  // Fetch players for each request
  for (const req of requests) {
    req.players = await sql`SELECT * FROM swap_request_players WHERE swap_request_id = ${req.id}`;
  }
  
  return requests;
}

export async function getTeamSwapRequests(teamId: string, seasonId: string) {
  const requests = await sql`
    SELECT * FROM swap_requests 
    WHERE (requesting_team_id = ${teamId} OR target_team_id = ${teamId}) 
    AND season_id = ${seasonId} 
    ORDER BY submitted_at DESC
  `;
  
  for (const req of requests) {
    req.players = await sql`SELECT * FROM swap_request_players WHERE swap_request_id = ${req.id}`;
  }
  
  return requests;
}

export async function getSwapRequestById(id: number | string) {
  const reqs = await sql`SELECT * FROM swap_requests WHERE id = ${id} LIMIT 1`;
  const req = reqs[0];
  if (!req) return null;
  
  req.players = await sql`SELECT * FROM swap_request_players WHERE swap_request_id = ${req.id}`;
  return req;
}

export async function updateSwapRequestStatus(
  id: number | string, 
  status: 'approved' | 'rejected' | 'cancelled', 
  processedBy?: string,
  rejectionReason?: string
) {
  return await sql`
    UPDATE swap_requests 
    SET 
      status = ${status}, 
      processed_at = NOW(), 
      processed_by = ${processedBy || null},
      rejection_reason = ${rejectionReason || null}
    WHERE id = ${id}
    RETURNING *
  `;
}
