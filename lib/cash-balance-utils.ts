import { adminDb } from '@/lib/neon/admin-db-wrapper';

export interface CashPayment {
  payment_id: string;
  amount: number;
  season_id: string;
  date: any; // Date or Timestamp
  notes: string;
  recorded_by: string;
}

export interface CashDeduction {
  deduction_id: string;
  amount: number;
  season_id: string;
  date: any; // Date or Timestamp
}

export interface TeamCashBalance {
  team_id: string;
  team_name: string;
  payment_type: 'upfront' | 'seasonal';
  remaining_balance: number;
  seasons_played: string[];
  payments: CashPayment[];
  deductions: CashDeduction[];
  season_plans?: Record<string, string>;
  created_at: any;
  updated_at: any;
}

/**
 * Gets or initializes the cash balance document for a team.
 * Reads from Neon via the admin-db-wrapper (team_cash_balances table).
 * On first-access creates an empty record in Neon.
 */
export async function getOrCreateTeamCashBalance(teamId: string, teamName: string): Promise<TeamCashBalance> {
  const docRef = adminDb.collection('team_cash_balances').doc(teamId);
  const docSnap = await docRef.get();

  if (docSnap.exists) {
    const data = docSnap.data();
    return {
      team_id: teamId,
      team_name: data?.team_name || teamName,
      payment_type: data?.payment_type || 'seasonal',
      remaining_balance: data?.remaining_balance ?? 0,
      seasons_played: data?.seasons_played || [],
      payments: data?.payments || [],
      deductions: data?.deductions || [],
      season_plans: data?.season_plans || {},
      created_at: data?.created_at,
      updated_at: data?.updated_at,
    } as TeamCashBalance;
  }

  // Initialize new document if not present
  const newBalance: Omit<TeamCashBalance, 'team_id'> = {
    team_name: teamName,
    payment_type: 'seasonal',
    remaining_balance: 0,
    seasons_played: [],
    payments: [],
    deductions: [],
    season_plans: {},
    created_at: new Date(),
    updated_at: new Date(),
  };

  await docRef.set({
    team_id: teamId,
    ...newBalance,
  });

  return {
    team_id: teamId,
    ...newBalance,
  } as TeamCashBalance;
}

/**
 * Updates subscription type for a team
 */
export async function updatePaymentType(teamId: string, paymentType: 'upfront' | 'seasonal'): Promise<void> {
  const balance = await getOrCreateTeamCashBalance(teamId, teamId);
  const docRef = adminDb.collection('team_cash_balances').doc(teamId);
  await docRef.update({
    team_id: teamId,
    team_name: balance.team_name,
    payment_type: paymentType,
    remaining_balance: balance.remaining_balance,
    seasons_played: balance.seasons_played,
    payments: balance.payments,
    deductions: balance.deductions,
    season_plans: balance.season_plans || {},
    updated_at: new Date(),
  });
}

/**
 * Records a cash payment (increases remaining_balance)
 */
export async function recordCashPayment(
  teamId: string,
  teamName: string,
  amount: number,
  seasonId: string,
  notes: string,
  recordedBy: string
): Promise<void> {
  // Ensure the document exists first
  const balance = await getOrCreateTeamCashBalance(teamId, teamName);

  const payment: CashPayment = {
    payment_id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
    amount,
    season_id: seasonId,
    date: new Date(),
    notes,
    recorded_by: recordedBy,
  };

  const updatedPayments = [...(balance.payments || []), payment];
  const newBalance = (balance.remaining_balance || 0) + amount;

  const docRef = adminDb.collection('team_cash_balances').doc(teamId);
  await docRef.update({
    team_id: teamId,
    team_name: teamName,
    payment_type: balance.payment_type,
    remaining_balance: newBalance,
    seasons_played: balance.seasons_played || [],
    payments: updatedPayments,
    deductions: balance.deductions || [],
    season_plans: balance.season_plans || {},
    updated_at: new Date(),
  });
}

/**
 * Records a cash deduction (decreases remaining_balance and adds season to seasons_played)
 */
export async function recordCashDeduction(
  teamId: string,
  teamName: string,
  amount: number,
  seasonId: string
): Promise<void> {
  const balance = await getOrCreateTeamCashBalance(teamId, teamName);

  // If this season is already processed in deductions, skip it to prevent double deductions
  const alreadyDeducted = balance.deductions?.some((d) => d.season_id === seasonId);
  if (alreadyDeducted) {
    console.log(`⚠️ Cash deduction already exists for team ${teamId} in season ${seasonId}. Skipping.`);
    return;
  }

  const deduction: CashDeduction = {
    deduction_id: Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15),
    amount,
    season_id: seasonId,
    date: new Date(),
  };

  const updatedDeductions = [...(balance.deductions || []), deduction];
  const updatedSeasonsPlayed = balance.seasons_played?.includes(seasonId)
    ? balance.seasons_played
    : [...(balance.seasons_played || []), seasonId];
  const newBalance = (balance.remaining_balance || 0) - amount;

  const docRef = adminDb.collection('team_cash_balances').doc(teamId);
  await docRef.update({
    team_id: teamId,
    team_name: teamName,
    payment_type: balance.payment_type,
    remaining_balance: newBalance,
    seasons_played: updatedSeasonsPlayed,
    payments: balance.payments || [],
    deductions: updatedDeductions,
    season_plans: balance.season_plans || {},
    updated_at: new Date(),
  });

  console.log(`✅ Cash deduction of ${amount} recorded for team ${teamName} (Season: ${seasonId})`);
}
