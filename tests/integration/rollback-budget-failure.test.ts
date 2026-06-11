/**
 * Integration test for rollback when budget update fails
 * 
 * This test verifies that when player updates succeed but Firestore budget/spent updates fail,
 * the rollback mechanism properly restores all player season records.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { describe, test, expect, beforeEach, vi } from 'vitest';
import { 
  executeSwapV2, 
  SwapRequest
} from '../../lib/player-transfers-v2';

// Mock the dependencies
vi.mock('../../lib/neon/tournament-config', () => ({
  getTournamentDb: vi.fn(() => ({
    query: vi.fn()
  }))
}));

vi.mock('../../lib/neon/auction-config', () => ({
  getAuctionDb: vi.fn(() => ({
    query: vi.fn()
  }))
}));

vi.mock('../../lib/firebase/admin', () => ({
  adminDb: {
    collection: vi.fn(() => ({
      doc: vi.fn(() => ({
        get: vi.fn(),
        set: vi.fn(),
        update: vi.fn()
      })),
      where: vi.fn(() => ({
        get: vi.fn()
      }))
    }))
  }
}));

vi.mock('firebase-admin', () => ({
  default: {
    firestore: {
      FieldValue: {
        serverTimestamp: vi.fn(() => new Date()),
        increment: vi.fn((value: number) => ({ _increment: value }))
      }
    }
  }
}));

vi.mock('../../lib/transfer-limits', () => ({
  validateTransferLimit: vi.fn(),
  validateMultipleTeamLimits: vi.fn()
}));

vi.mock('../../lib/transaction-logger', () => ({
  logTransferPayment: vi.fn(),
  logTransferCompensation: vi.fn(),
  logSwapTransactions: vi.fn()
}));

describe('Rollback when budget update fails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test('should rollback all player updates when budget update fails', async () => {
    const { getTournamentDb } = await import('../../lib/neon/tournament-config');
    const { adminDb } = await import('../../lib/firebase/admin');
    const { validateMultipleTeamLimits } = await import('../../lib/transfer-limits');
    
    let updateCallCount = 0;
    
    // Mock successful player data fetch and updates
    // For executeSwapV2:
    // 1. fetchPlayerData for Player A S16
    // 2. fetchPlayerData for Player B S16
    // 3. updatePlayerInNeon Player A: BEGIN, UPDATE, COMMIT
    // 4. updatePlayerInNeon Player B: BEGIN, UPDATE, COMMIT
    // 5. rollback Player B: BEGIN, UPDATE, COMMIT
    // 6. rollback Player A: BEGIN, UPDATE, COMMIT
    const mockQuery = vi.fn()
      .mockResolvedValueOnce([{ // Fetch Player A S16
        id: '1',
        player_id: 'SSPSPL0001',
        player_name: 'Player A',
        team_id: 'SSPSLT0001',
        auction_value: 225,
        star_rating: 5,
        points: 180,
        salary_per_match: 5.0,
        season_id: 'SSPSLS16',
        category: 'Gold',
        type: 'real'
      }])
      .mockResolvedValueOnce([{ // Fetch Player B S16
        id: '2',
        player_id: 'SSPSPL0002',
        player_name: 'Player B',
        team_id: 'SSPSLT0002',
        auction_value: 150,
        star_rating: 4,
        points: 120,
        salary_per_match: 3.0,
        season_id: 'SSPSLS16',
        category: 'Silver',
        type: 'real'
      }])
      // UPDATE Player A S16: BEGIN, UPDATE, COMMIT
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // UPDATE
      .mockResolvedValueOnce(undefined) // COMMIT
      // UPDATE Player B S16: BEGIN, UPDATE, COMMIT
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // UPDATE
      .mockResolvedValueOnce(undefined) // COMMIT
      // ROLLBACK Player B S16: BEGIN, UPDATE, COMMIT
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // UPDATE
      .mockResolvedValueOnce(undefined) // COMMIT
      // ROLLBACK Player A S16: BEGIN, UPDATE, COMMIT
      .mockResolvedValueOnce(undefined) // BEGIN
      .mockResolvedValueOnce(undefined) // UPDATE
      .mockResolvedValueOnce(undefined); // COMMIT
    
    (getTournamentDb as any).mockReturnValue({ query: mockQuery });
    
    // Mock team balance checks (successful)
    const mockGet = vi.fn().mockResolvedValue({
      exists: true,
      data: () => ({
        real_player_budget: 1000,
        real_player_spent: 0,
        football_budget: 500,
        football_spent: 0
      })
    });
    
    // Mock updateSwapBalances to fail
    const mockUpdate = vi.fn().mockImplementation(() => {
      updateCallCount++;
      if (updateCallCount === 1) {
        // The first update call is from updateSwapBalances - fail it
        return Promise.reject(new Error('Firestore update failed'));
      }
      // Subsequent calls are for rollback - succeed
      return Promise.resolve(undefined);
    });
    
    (adminDb.collection as any).mockReturnValue({
      doc: vi.fn(() => ({
        get: mockGet,
        update: mockUpdate,
        set: vi.fn().mockResolvedValue(undefined)
      })),
      where: vi.fn(() => ({
        get: vi.fn().mockResolvedValue({ docs: [] })
      }))
    });
    
    // Mock limit validation
    (validateMultipleTeamLimits as any).mockResolvedValue({
      valid: true,
      message: 'Limits check passed'
    });
    
    const consoleSpy = vi.spyOn(console, 'log');
    const consoleErrorSpy = vi.spyOn(console, 'error');
    
    const request: SwapRequest = {
      playerAId: 'SSPSPL0001',
      playerAType: 'real',
      playerBId: 'SSPSPL0002',
      playerBType: 'real',
      seasonId: 'SSPSLS16',
      swappedBy: 'admin',
      swappedByName: 'Admin'
    };
    
    const result = await executeSwapV2(request);
    
    // Swap should fail
    expect(result.success).toBe(false);
    expect(result.errorCode).toBe('SYSTEM_ERROR');
    
    // Verify rollback was initiated
    const playerARollback = consoleSpy.mock.calls
      .map(call => call[0])
      .find(log => typeof log === 'string' && log.includes('Rolling back Player A record'));
      
    const playerBRollback = consoleSpy.mock.calls
      .map(call => call[0])
      .find(log => typeof log === 'string' && log.includes('Rolling back Player B record'));
    
    expect(playerARollback).toBeDefined();
    expect(playerBRollback).toBeDefined();
  });
});
