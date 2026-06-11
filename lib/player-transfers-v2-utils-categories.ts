/**
 * Player Transfer System V2 - Category-Based Utilities
 * 
 * This module contains all calculation functions and constants for the enhanced
 * player transfer and swap system with category-based value increases, committee fees,
 * and automatic player upgrades using categories instead of star ratings.
 */

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Category value multipliers for calculating new player values
 * When a player is transferred or swapped, their value increases based on their category
 */
export const CATEGORY_VALUE_MULTIPLIERS: Record<string, number> = {
  'Bronze': 1.15,    // 115% of original value
  'Silver': 1.20,    // 120% of original value
  'Gold': 1.25,      // 125% of original value
  'Classic': 1.30,   // 130% of original value
  'Legend': 1.35,    // 135% of original value
  'Rising Star': 1.25, // 125% of original value
  'Veteran': 1.30,   // 130% of original value
};

/**
 * Fixed committee fees for swap deals based on category
 * Each team pays the fee for the player they are receiving
 */
export const SWAP_FEES_BY_CATEGORY: Record<string, number> = {
  'Bronze': 0,
  'Silver': 0,
  'Gold': 0,
  'Classic': 0,
  'Legend': 0,
  'Rising Star': 0,
  'Veteran': 0,
};

/**
 * Category point thresholds
 * Players upgrade their category when their points reach these thresholds
 */
export const CATEGORY_POINT_THRESHOLDS: Record<string, { min: number; max: number; nextCategory?: string }> = {
  'Bronze': { min: 100, max: 119, nextCategory: 'Silver' },
  'Silver': { min: 120, max: 144, nextCategory: 'Gold' },
  'Gold': { min: 145, max: 174, nextCategory: 'Classic' },
  'Classic': { min: 175, max: 209, nextCategory: 'Legend' },
  'Legend': { min: 210, max: Infinity }, // Max category
  'Rising Star': { min: 145, max: 174, nextCategory: 'Classic' },
  'Veteran': { min: 175, max: 209, nextCategory: 'Legend' },
};

/**
 * Salary calculation rates by player type
 */
export const SALARY_RATES = {
  real: 0.007,      // 0.7% of value for real players
  football: 0.003   // 0.3% of value for football players
} as const;

/**
 * Transfer fee percentage (10% of new value)
 */
export const TRANSFER_FEE_PERCENTAGE = 0.10;

/**
 * Points per value ratio for category upgrades
 * 1 point for every $5 increase in value = 0.2 ratio
 */
export const POINTS_PER_VALUE_RATIO = 0.2;

// ============================================================================
// CALCULATION FUNCTIONS
// ============================================================================

/**
 * Calculate new player value based on category multiplier
 * 
 * @param currentValue - The player's current auction value
 * @param category - The player's current category
 * @returns The new calculated value rounded to 2 decimal places
 * 
 * @example
 * calculateNewValue(225, 'Gold') // Returns 281.25 (225 * 1.25)
 */
export function calculateNewValue(
  currentValue: number,
  category: string
): number {
  if (currentValue < 0) {
    throw new Error('Current value must be non-negative');
  }
  
  const multiplier = CATEGORY_VALUE_MULTIPLIERS[category];
  if (!multiplier) {
    throw new Error(`Invalid category: ${category}. Must be one of: ${Object.keys(CATEGORY_VALUE_MULTIPLIERS).join(', ')}`);
  }
  
  return Math.round((currentValue * multiplier) * 100) / 100;
}

/**
 * Calculate committee fee (10% of new value)
 * 
 * @param newValue - The player's new calculated value
 * @returns The committee fee rounded to 2 decimal places
 */
export function calculateCommitteeFee(newValue: number): number {
  if (newValue < 0) {
    throw new Error('New value must be non-negative');
  }
  
  return Math.round((newValue * TRANSFER_FEE_PERCENTAGE) * 100) / 100;
}

/**
 * Calculate new category and points based on value increase
 * 
 * @param currentPoints - The player's current points
 * @param valueIncrease - The increase in player value
 * @param pointsPerValueRatio - Points added per dollar increase (default: 0.2)
 * @returns Object with new points and category
 * 
 * @example
 * calculateNewCategory(180, 56.25, 0.2) // Returns { newPoints: 191, newCategory: 'Gold' }
 */
export function calculateNewCategory(
  currentPoints: number,
  valueIncrease: number,
  currentCategory: string,
  pointsPerValueRatio: number = POINTS_PER_VALUE_RATIO
): { newPoints: number; newCategory: string } {
  if (currentPoints < 0) {
    throw new Error('Current points must be non-negative');
  }
  
  if (valueIncrease < 0) {
    throw new Error('Value increase must be non-negative');
  }
  
  if (pointsPerValueRatio < 0 || pointsPerValueRatio > 1) {
    throw new Error('Points per value ratio must be between 0 and 1');
  }
  
  // Calculate points to add based on value increase
  const pointsAdded = Math.round(valueIncrease * pointsPerValueRatio);
  const newPoints = currentPoints + pointsAdded;
  
  // Determine new category based on point thresholds
  for (const [category, threshold] of Object.entries(CATEGORY_POINT_THRESHOLDS)) {
    if (newPoints >= threshold.min && newPoints <= threshold.max) {
      return { newPoints, newCategory: category };
    }
  }
  
  // If points exceed all thresholds, return Legend category
  return { newPoints, newCategory: 'Legend' };
}

/**
 * Calculate salary based on new value and player type
 * 
 * @param newValue - The player's new calculated value
 * @param playerType - Type of player ('real' or 'football')
 * @returns The new salary per match rounded to 2 decimal places
 * 
 * @example
 * calculateSalary(281.25, 'real') // Returns 1.97 (281.25 * 0.007)
 */
export function calculateSalary(
  newValue: number,
  playerType: 'real' | 'football'
): number {
  if (newValue < 0) {
    throw new Error('New value must be non-negative');
  }
  
  if (playerType !== 'real' && playerType !== 'football') {
    throw new Error('Player type must be "real" or "football"');
  }
  
  const rate = SALARY_RATES[playerType];
  return Math.round((newValue * rate) * 100) / 100;
}

/**
 * Get swap fee based on category
 * 
 * @param category - The player's category
 * @returns The swap fee for the category
 */
export function getSwapFee(category: string): number {
  const fee = SWAP_FEES_BY_CATEGORY[category];
  if (fee === undefined) {
    throw new Error(`Invalid category: ${category}. Must be one of: ${Object.keys(SWAP_FEES_BY_CATEGORY).join(', ')}`);
  }
  return fee;
}

/**
 * Validate cash amount for transfers
 * 
 * @param amount - The cash amount
 * @returns True if valid, throws error if invalid
 */
export function validateCashAmount(amount: number): boolean {
  if (amount < 0) {
    throw new Error('Cash amount cannot be negative');
  }
  
  if (amount > 10000) {
    throw new Error('Cash amount cannot exceed $10,000');
  }
  
  return true;
}

// ============================================================================
// TRANSFER CALCULATION INTERFACES
// ============================================================================

/**
 * Complete transfer calculation result
 */
export interface TransferCalculation {
  originalValue: number;
  newValue: number;
  valueIncrease: number;
  committeeFee: number;
  buyingTeamPays: number;
  sellingTeamReceives: number;
  originalCategory: string;
  newCategory: string;
  originalPoints: number;
  newPoints: number;
  pointsAdded: number;
  newSalary: number;
}

/**
 * Calculate complete transfer details
 * 
 * @param currentValue - Player's current auction value
 * @param currentCategory - Player's current category
 * @param currentPoints - Player's current points
 * @param playerType - Type of player ('real' or 'football')
 * @returns Complete transfer calculation
 */
export function calculateTransferDetails(
  currentValue: number,
  currentCategory: string,
  currentPoints: number,
  playerType: 'real' | 'football'
): TransferCalculation {
  // Calculate new value
  const newValue = calculateNewValue(currentValue, currentCategory);
  const valueIncrease = newValue - currentValue;
  
  // Calculate committee fee
  const committeeFee = calculateCommitteeFee(newValue);
  
  // Calculate team payments
  const buyingTeamPays = newValue + committeeFee;
  const sellingTeamReceives = newValue - committeeFee;
  
  // Calculate new category and points
  const { newPoints, newCategory } = calculateNewCategory(
    currentPoints,
    valueIncrease,
    currentCategory
  );
  const pointsAdded = newPoints - currentPoints;
  
  // Calculate new salary
  const newSalary = calculateSalary(newValue, playerType);
  
  return {
    originalValue: currentValue,
    newValue,
    valueIncrease,
    committeeFee,
    buyingTeamPays,
    sellingTeamReceives,
    originalCategory: currentCategory,
    newCategory,
    originalPoints: currentPoints,
    newPoints,
    pointsAdded,
    newSalary
  };
}

// ============================================================================
// SWAP CALCULATION INTERFACES
// ============================================================================

/**
 * Swap calculation result for both players
 */
export interface SwapCalculation {
  playerA: {
    originalValue: number;
    newValue: number;
    valueIncrease: number;
    originalCategory: string;
    newCategory: string;
    originalPoints: number;
    newPoints: number;
    pointsAdded: number;
    newSalary: number;
    swapFee: number;
    committeeFee: number;
  };
  playerB: {
    originalValue: number;
    newValue: number;
    valueIncrease: number;
    originalCategory: string;
    newCategory: string;
    originalPoints: number;
    newPoints: number;
    pointsAdded: number;
    newSalary: number;
    swapFee: number;
    committeeFee: number;
  };
  totalSwapFees: number;
  cashFromAToB: number;
  cashFromBToA: number;
  cashAmount: number;
  cashDirection: 'A_to_B' | 'B_to_A' | 'none';
  teamAPays: number;
  teamBPays: number;
  totalCommitteeFees: number;
}

/**
 * Calculate swap details for two players
 * 
 * @param playerA - First player data { value, category, points, type }
 * @param playerB - Second player data { value, category, points, type }
 * @param cashAmount - Cash amount (positive = A pays B, negative = B pays A)
 * @returns Complete swap calculation
 */
export function calculateSwapDetails(
  playerA: { value: number; category: string; points: number; type: 'real' | 'football' },
  playerB: { value: number; category: string; points: number; type: 'real' | 'football' },
  cashAmount: number = 0
): SwapCalculation {
  // Swaps are free, cash amount is ignored/forced to 0
  const forcedCashAmount = 0;
  validateCashAmount(forcedCashAmount);
  
  // Calculate details for player A
  const playerADetails = calculateTransferDetails(
    playerA.value,
    playerA.category,
    playerA.points,
    playerA.type
  );
  
  // Calculate details for player B
  const playerBDetails = calculateTransferDetails(
    playerB.value,
    playerB.category,
    playerB.points,
    playerB.type
  );
  
  // Calculate swap fees (forced to 0)
  const playerASwapFee = 0;
  const playerBSwapFee = 0;
  const totalSwapFees = 0;
  
  const cashFromAToB = 0;
  const cashFromBToA = 0;
  const cashDirection = 'none';
  
  // Team A and B pay 0 fees for swapping
  const teamAPays = 0;
  const teamBPays = 0;
  
  return {
    playerA: {
      originalValue: playerADetails.originalValue,
      newValue: playerADetails.newValue,
      valueIncrease: playerADetails.valueIncrease,
      originalCategory: playerADetails.originalCategory,
      newCategory: playerADetails.newCategory,
      originalPoints: playerADetails.originalPoints,
      newPoints: playerADetails.newPoints,
      pointsAdded: playerADetails.pointsAdded,
      newSalary: playerADetails.newSalary,
      swapFee: playerASwapFee,
      committeeFee: playerASwapFee
    },
    playerB: {
      originalValue: playerBDetails.originalValue,
      newValue: playerBDetails.newValue,
      valueIncrease: playerBDetails.valueIncrease,
      originalCategory: playerBDetails.originalCategory,
      newCategory: playerBDetails.newCategory,
      originalPoints: playerBDetails.originalPoints,
      newPoints: playerBDetails.newPoints,
      pointsAdded: playerBDetails.pointsAdded,
      newSalary: playerBDetails.newSalary,
      swapFee: playerBSwapFee,
      committeeFee: playerBSwapFee
    },
    totalSwapFees,
    cashFromAToB,
    cashFromBToA,
    cashAmount: forcedCashAmount,
    cashDirection,
    teamAPays: 0,
    teamBPays: 0,
    totalCommitteeFees: 0
  };
}